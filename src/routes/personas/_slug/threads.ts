import { and, desc, isNull, eq, count } from "drizzle-orm";
import type { FastifyInstance, FastifyServerOptions } from "fastify";
import { personas, threads } from "../../../database/schema";
import { PersonaBySlugSchema } from "./";
import { z } from "zod";

const ListThreadsSchema = z.object({
	page: z.number().int().default(1),
	limit: z.number().int().default(10),
});

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	fastify.get<{
		Params: z.infer<typeof PersonaBySlugSchema>;
		Querystring: z.infer<typeof ListThreadsSchema>;
	}>(
		"/threads",
		{
			schema: {
				querystring: ListThreadsSchema,
			},
		},
		async (request, reply) => {
			if (!request.user) {
				return reply.unauthorized();
			}

			const personaSlug = request.params.slug;
			const [persona] = await fastify.db
				.select({ id: personas.id })
				.from(personas)
				.where(and(eq(personas.slug, personaSlug), isNull(personas.deletedAt)));

			if (!persona) {
				return reply.callNotFound();
			}

			const userThreads = await fastify.db.query.threads.findMany({
				columns: {
					id: true,
					title: true,
					createdAt: true,
					updatedAt: true,
				},
				with: {
					author: {
						columns: {
							id: true,
							name: true,
						},
					},
				},
				where: (threads) =>
					and(
						eq(threads.author, request.user!.id),
						eq(threads.persona, persona.id),
						isNull(threads.deletedAt),
					),
				limit: request.query.limit,
				offset: request.query.limit * (request.query.page - 1),
				orderBy: desc(threads.updatedAt),
			});

			const userThreadCount = await fastify.db
				.select({ count: count().as("count") })
				.from(threads)
				.where(
					and(
						eq(threads.author, request.user!.id),
						eq(threads.persona, persona.id),
						isNull(threads.deletedAt),
					),
				)
				.then(([res]) => res.count || 0);

			const hasNextPage =
				userThreadCount > request.query.limit * request.query.page;
			const previousPage = Math.min(
				request.query.page - 1,
				Math.ceil(userThreadCount / request.query.limit),
			);
			const hasPreviousPage =
				previousPage > 0 && previousPage < request.query.page;

			reply.send({
				data: userThreads,
				pagination: {
					totalRecords: userThreadCount,
					totalPages: Math.ceil(userThreadCount / request.query.limit),
					currentPage: request.query.page,
					pageSize: request.query.limit,
					nextPage: hasNextPage ? request.query.page + 1 : null,
					previousPage: hasPreviousPage,
				},
			});
		},
	);

	fastify.get<{
		Params: z.infer<typeof PersonaBySlugSchema> & { threadId: string };
	}>("/threads/:threadId", async (request, reply) => {
		if (!request.user) {
			return reply.unauthorized();
		}

		const personaSlug = request.params.slug;

		const [persona] = await fastify.db
			.select({ id: personas.id })
			.from(personas)
			.where(and(eq(personas.slug, personaSlug), isNull(personas.deletedAt)));

		if (!persona) {
			return reply.callNotFound();
		}

		const [thread] = await fastify.db
			.select()
			.from(threads)
			.where(
				and(
					eq(threads.persona, persona.id),
					eq(threads.author, request.user!.id),
					eq(threads.id, request.params.threadId),
					isNull(threads.deletedAt),
				),
			);

		if (!thread) {
			return reply.callNotFound();
		}

		reply.send({ data: thread });
	});

	fastify.delete<{
		Params: z.infer<typeof PersonaBySlugSchema> & { threadId: string };
	}>("/threads/:threadId", async (request, reply) => {
		if (!request.user) {
			return reply.unauthorized();
		}

		const [thread] = await fastify.db
			.select()
			.from(threads)
			.where(
				and(
					eq(threads.id, request.params.threadId),
					eq(threads.author, request.user!.id),
					isNull(threads.deletedAt),
				),
			);

		if (!thread) {
			return reply.callNotFound();
		}

		await fastify.db
			.update(threads)
			.set({ deletedAt: new Date(), deletedBy: request.user!.id })
			.where(eq(threads.id, thread.id));

		reply.status(204).send();
	});
}
