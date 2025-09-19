import type { FastifyInstance, FastifyServerOptions } from "fastify";
import {
	organizations,
	personaProfileAttributes,
	personas,
	personaTopics,
	topics,
} from "../../../database/schema";
import { z } from "zod";
import { and, isNull, eq, notInArray, sql } from "drizzle-orm";
import { PersonaCreateSchema } from "../index";
import { adminOnly } from "../../../lib/adminOnly";

export const PersonaBySlugSchema = z.object({
	slug: z.string(),
});

const PersonaUpdateSchema = PersonaCreateSchema.partial();

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	const getPersonaBySlug = async (slug: string) => {
		const persona = await fastify.db.query.personas.findFirst({
			columns: {
				photo: false,
				createdBy: false,
				modifiedBy: false,
				deletedBy: false,
				deletedAt: false,
			},
			with: {
				photo: {
					columns: {
						id: true,
						name: true,
						originalName: true,
						mimeType: true,
						size: true,
						checksum: true,
					},
				},
				topics: {
					columns: {},
					with: {
						topic: {
							columns: {
								id: true,
								name: true,
							},
						},
					},
				},
				attributes: {
					columns: {
						attribute: true,
						value: true,
					},
				},
			},
			where: (personas) =>
				and(eq(personas.slug, slug), isNull(personas.deletedAt)),
		});

		if (!persona) {
			return null;
		}

		return {
			...persona,
			photo: {
				...persona.photo,
				url: `${fastify.config.BACKEND_URL}/storage/files/${persona.photo.id}/url`,
			},
			topics: persona.topics.map((t) => t.topic),
		};
	};

	fastify.get<{ Params: z.infer<typeof PersonaBySlugSchema> }>(
		"/",
		{
			schema: {
				params: PersonaBySlugSchema,
			},
		},
		async (request, reply) => {
			const persona = await getPersonaBySlug(request.params.slug);

			if (!persona) {
				return reply.callNotFound();
			}

			return reply.send({
				data: persona,
			});
		},
	);

	fastify.patch<{
		Params: z.infer<typeof PersonaBySlugSchema>;
		Body: z.infer<typeof PersonaUpdateSchema>;
	}>(
		"/",
		{
			schema: {
				params: PersonaBySlugSchema,
				body: PersonaUpdateSchema,
			},
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			const { attributes, ...body } = request.body;

			await fastify.db.transaction(async (trx) => {
				if (Object.keys(body).length) {
					await trx
						.update(personas)
						.set(body)
						.where(eq(personas.slug, request.params.slug));
				}

				if (attributes) {
					if (attributes.length) {
						await trx.delete(personaProfileAttributes).where(
							and(
								eq(personaProfileAttributes.persona, request.persona!.id),
								notInArray(
									personaProfileAttributes.attribute,
									attributes.map((att) => att.attribute),
								),
							),
						);

						await trx
							.insert(personaProfileAttributes)
							.values(
								attributes.map((att) => ({
									persona: request.persona!.id,
									attribute: att.attribute,
									value: att.value,
								})),
							)
							.onConflictDoUpdate({
								target: [
									personaProfileAttributes.persona,
									personaProfileAttributes.attribute,
								],
								set: {
									value: sql`EXCLUDED.value`,
								},
							});
					} else {
						await trx
							.delete(personaProfileAttributes)
							.where(eq(personaProfileAttributes.persona, request.persona!.id));
					}
				}

				if (request.body.name || request.body.slug) {
					await trx
						.update(organizations)
						.set({
							...("name" in request.body ? { name: request.body.name } : {}),
							...("slug" in request.body ? { slug: request.body.slug } : {}),
						})
						.where(eq(organizations.id, request.persona!.organization))
						.returning();
				}
			});

			const updatedPersona = await getPersonaBySlug(request.params.slug);

			reply.send({ data: updatedPersona });
		},
	);

	fastify.put<{
		Body: { topics: number[] };
		Params: z.infer<typeof PersonaBySlugSchema>;
	}>(
		"/topics",
		{
			schema: {
				body: z.object({
					topics: z.array(z.number().positive()),
				}),
				params: PersonaBySlugSchema,
			},
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			const updatedTopics = await fastify.db.transaction(async (trx) => {
				const [persona] = await trx
					.select({ id: personas.id, organization: personas.organization })
					.from(personas)
					.where(
						and(
							eq(personas.slug, request.params.slug),
							isNull(personas.deletedAt),
						),
					);

				if (!persona) {
					return reply.callNotFound();
				}

				await trx
					.delete(personaTopics)
					.where(
						and(
							eq(personaTopics.persona, persona.id),
							notInArray(personaTopics.topic, request.body.topics),
						),
					);

				await trx
					.insert(personaTopics)
					.values(
						request.body.topics.map((topic) => ({
							persona: persona.id,
							topic,
						})),
					)
					.onConflictDoNothing({
						target: [personaTopics.persona, personaTopics.topic],
					});

				return trx
					.select({ id: topics.id, name: topics.name })
					.from(personaTopics)
					.leftJoin(topics, eq(topics.id, personaTopics.topic))
					.where(eq(personaTopics.persona, persona.id));
			});

			return updatedTopics;
		},
	);
}
