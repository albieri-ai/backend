import type { FastifyInstance, FastifyServerOptions } from "fastify";
import {
	members,
	organizations,
	personas,
	personaTopics,
	topics,
} from "../../database/schema";
import { z } from "zod";
import { and, isNull, eq, getTableColumns, notInArray } from "drizzle-orm";

export const PersonaCreateSchema = z.object({
	name: z.string().min(3).max(64),
	slug: z.string().min(3).max(32),
	photo: z.string(),
	title: z.string().min(3).max(64).optional(),
	description: z.string().optional(),
	objective: z.string().optional(),
});

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	const getPersonaBySlug = async (slug: string) => {
		const persona = await fastify.db.query.personas.findFirst({
			columns: {
				photo: false,
				organization: false,
			},
			with: {
				organization: {
					columns: {
						id: true,
						name: true,
						slug: true,
					},
				},
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
				url: `${fastify.config.BACKEND_URL}/storage/files/${persona.photo.id}`,
			},
			topics: persona.topics.map((t) => t.topic),
		};
	};

	fastify.get("/topics", async (_request, reply) => {
		const availableTopics = await fastify.db
			.select({ id: topics.id, name: topics.name, icon: topics.icon })
			.from(topics)
			.where(isNull(topics.disabledAt));

		reply.send({ data: availableTopics });
	});

	fastify.post<{
		Body: z.infer<typeof PersonaCreateSchema>;
	}>(
		"/",
		{
			schema: {
				body: PersonaCreateSchema,
			},
		},
		async (request, reply) => {
			if (!request.user) {
				return reply.unauthorized();
			}

			const userOrganizations = await fastify.db
				.select({ ...getTableColumns(organizations) })
				.from(members)
				.leftJoin(organizations, eq(organizations.id, members.organizationId))
				.where(eq(members.userId, request.user!.id));

			if (userOrganizations.length > 0) {
				reply.code(400).send({ error: "User already has an organization" });

				return;
			}

			await fastify.db.transaction(async (trx) => {
				const organization = await fastify.auth.api.createOrganization({
					body: {
						name: request.body.name,
						slug: request.body.slug,
						userId: request.user!.id,
					},
				});

				if (!organization) {
					reply.code(500).send({ error: "Failed to create organization" });

					return;
				}

				await trx.insert(personas).values({
					...request.body,
					organization: organization.id,
					createdBy: request.user!.id,
				});
			});

			const createdPersona = await getPersonaBySlug(request.body.slug);

			reply.code(201).send({ data: createdPersona });
		},
	);
}
