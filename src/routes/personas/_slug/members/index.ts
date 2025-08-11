import type { FastifyInstance, FastifyServerOptions } from "fastify";
import { adminOnly } from "../../../../lib/adminOnly";
import { threads, users } from "../../../../database/schema";
import { eq } from "drizzle-orm";

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	fastify.get(
		"/",
		{
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			const personaMembers = fastify.db
				.$with("persona_members")
				.as(
					fastify.db.selectDistinct({ author: threads.author }).from(threads),
				);

			const personaUsers = await fastify.db
				.with(personaMembers)
				.select()
				.from(users)
				.leftJoin(personaMembers, eq(personaMembers.author, users.id));

			return reply.send({ data: personaUsers });
		},
	);
}
