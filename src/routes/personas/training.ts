import type { FastifyInstance, FastifyServerOptions } from "fastify";

export default function (
  fastify: FastifyInstance,
  _opts: FastifyServerOptions,
) {
  fastify.get(
    "/",
    {
      preValidation: (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: "Unauthorized" });
        }
      },
    },
    (request, reply) => {
      reply.send({ message: "Hello from persona!" });
    },
  );
}
