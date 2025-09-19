import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { and, isNull, eq } from "drizzle-orm";
import { members } from "../database/schema";

export function adminOnly(fastify: FastifyInstance) {
	return async (
		request: FastifyRequest<{ Params: { slug: string } }>,
		reply: FastifyReply,
	) => {
		if (!request.user) {
			return reply.unauthorized("unauthorized");
		}

		const persona = await fastify.db.query.personas.findFirst({
			columns: {
				photo: false,
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
				and(eq(personas.slug, request.params.slug), isNull(personas.deletedAt)),
		});

		if (!persona) {
			return reply.callNotFound();
		}

		request.persona = persona;

		const [organizationMember] = await fastify.db
			.select()
			.from(members)
			.where(
				and(
					eq(members.organizationId, persona.organization),
					eq(members.userId, request.user!.id),
				),
			);

		if (!organizationMember) {
			return reply.forbidden();
		}
	};
}
