import type { FastifyInstance, FastifyServerOptions } from "fastify";

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	fastify.post("/", async (request, reply) => {
		return reply.send({ foo: "bar" });
	});
}
