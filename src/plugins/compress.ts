import type { FastifyInstance, FastifyServerOptions } from "fastify";
import compress from "@fastify/compress";

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	fastify.register(compress);
}
