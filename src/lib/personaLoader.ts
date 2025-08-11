import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { and, isNull, eq } from "drizzle-orm";
import { personas } from "../database/schema";

export function personaLoader(fastify: FastifyInstance) {
	return async (
		request: FastifyRequest<{ Params: { slug: string } }>,
		reply: FastifyReply,
	) => {
		const { slug } = request.params;

		const [persona] = await fastify.db
			.select()
			.from(personas)
			.where(and(eq(personas.slug, slug), isNull(personas.deletedAt)));

		if (!persona) {
			return reply.callNotFound();
		}

		request.persona = persona;
	};
}
