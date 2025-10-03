import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { and, isNull, eq } from "drizzle-orm";

export function personaLoader(fastify: FastifyInstance) {
	return async (
		request: FastifyRequest<{ Params: { slug: string } }>,
		reply: FastifyReply,
	) => {
		const { slug } = request.params;

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
				and(eq(personas.slug, slug), isNull(personas.deletedAt)),
		});

		if (!persona) {
			return reply.callNotFound();
		}

		request.persona = {
			...persona,
			photo: {
				...persona.photo,
				url: `${fastify.config.BACKEND_URL}/storage/files/${persona.photo.id}/url`,
			},
		};
	};
}
