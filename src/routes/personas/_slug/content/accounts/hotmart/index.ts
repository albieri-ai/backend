import type { FastifyInstance, FastifyServerOptions } from "fastify";
import { adminOnly } from "../../../../../../lib/adminOnly";
import z from "zod";
import {
	hotmartCourseLessons,
	hotmartCourseModules,
	hotmartCourses,
	hotmartVideoAssets,
	trainingAssets,
} from "../../../../../../database/schema";
import { eq, and, isNull, sql, inArray } from "drizzle-orm";
import { HotmartCourseImport } from "../../../../../../trigger/hotmart";
import axios from "axios";

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	fastify.post<{
		Params: { slug: string };
		Body: { token: string; hotmartId: string };
	}>(
		"/accounts/hotmart",
		{
			schema: {
				params: z.object({
					slug: z.string(),
				}),
				body: z.object({
					token: z.string(),
					hotmartId: z.string(),
				}),
			},
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			const { persona, user } = request;

			if (!persona) {
				return reply.status(404).send({ error: "Persona not found" });
			} else if (!user) {
				return reply.status(401).send({ error: "User not found" });
			}

			const { data: productInitialData } = await axios.get(
				`https://api-content-platform-space-gateway.cp.hotmart.com/rest/v1/memberships/products/${request.body.hotmartId}`,
				{
					headers: {
						Authorization: `Bearer ${request.body.token}`,
					},
				},
			);

			const {
				data: { name, description },
			} = await axios.get<{
				id: number;
				name: string;
				description: string;
				clubSubdomain: string;
				categoryId: number;
				isDraft: boolean;
				status: string;
				backgroundImageFinal?: string;
			}>(
				`https://api-content-platform-space-gateway.cp.hotmart.com/rest/v1/admin/memberships/${productInitialData.slug}/products/${request.body.hotmartId}/basic`,
				{
					headers: {
						Authorization: `Bearer ${request.body.token}`,
					},
				},
			);

			const [res] = await fastify.db
				.insert(hotmartCourses)
				.values({
					persona: persona.id,
					courseId: request.body.hotmartId,
					name: name,
					description: description,
					createdBy: user.id,
				})
				.onConflictDoUpdate({
					target: [hotmartCourses.persona, hotmartCourses.courseId],
					set: {
						name: name,
						description: description,
						disabledBy: null,
						disabledAt: null,
					},
				})
				.returning();

			await HotmartCourseImport.trigger({
				persona: persona.id,
				token: request.body.token,
				hotmartId: request.body.hotmartId,
				id: res.id,
				createdBy: user.id,
			});

			return reply.send({ data: res });
		},
	);

	fastify.delete<{
		Params: {
			slug: string;
			courseId: string;
		};
		Querystring: {
			remove_content: boolean;
		};
	}>(
		"/accounts/hotmart/:courseId",
		{
			schema: {
				params: z.object({
					slug: z.string(),
					courseId: z.string(),
				}),
				querystring: z.object({
					remove_content: z.coerce.boolean().default(false),
				}),
			},
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			if (!request.user) {
				return reply.unauthorized();
			}

			const { persona } = request;

			if (!persona) {
				return reply.status(404).send({ error: "Persona not found" });
			}

			await fastify.db.transaction(async (trx) => {
				const course = await trx
					.select()
					.from(hotmartCourses)
					.where(eq(hotmartCourses.id, request.params.courseId))
					.then(([res]) => res);

				if (course.persona !== request.persona?.id) {
					return reply.status(403).send({ error: "Forbidden" });
				}

				await trx
					.update(hotmartCourses)
					.set({
						disabledBy: request.user!.id,
						disabledAt: sql`NOW()`,
					})
					.where(
						and(
							eq(hotmartCourses.id, request.params.courseId),
							eq(hotmartCourses.persona, persona.id),
							isNull(hotmartCourses.disabledAt),
						),
					);

				if (request.query.remove_content) {
					await trx
						.update(trainingAssets)
						.set({ deletedAt: sql`NOW()`, deletedBy: request.user!.id })
						.where(
							and(
								isNull(trainingAssets.deletedAt),
								inArray(
									trainingAssets.id,
									trx
										.select({ id: hotmartVideoAssets.asset })
										.from(hotmartVideoAssets)
										.leftJoin(
											hotmartCourseLessons,
											eq(hotmartCourseLessons.id, hotmartVideoAssets.lesson),
										)
										.leftJoin(
											hotmartCourseModules,
											eq(hotmartCourseModules.id, hotmartCourseLessons.module),
										)
										.leftJoin(
											hotmartCourses,
											eq(hotmartCourses.id, hotmartCourseModules.course),
										)
										.where(eq(hotmartCourses.id, request.params.courseId)),
								),
							),
						);
				}
			});

			return reply.status(204).send();
		},
	);
}
