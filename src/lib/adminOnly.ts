import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { and, isNull, eq } from "drizzle-orm";
import { members, personas } from "../database/schema";

export function adminOnly(fastify: FastifyInstance) {
	return async (
		request: FastifyRequest<{ Params: { slug: string } }>,
		reply: FastifyReply,
	) => {
		if (!request.user) {
			return reply.unauthorized("unauthorized");
		}

		const [persona] = await fastify.db
			.select()
			.from(personas)
			.where(
				and(eq(personas.slug, request.params.slug), isNull(personas.deletedAt)),
			);

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
