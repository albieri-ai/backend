import type { FastifyInstance, FastifyServerOptions } from "fastify";
import sensible from "@fastify/sensible";

export default function (
  fastify: FastifyInstance,
  _opts: FastifyServerOptions,
) {
  fastify.register(sensible);
}
