import type { FastifyInstance, FastifyServerOptions } from "fastify";

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	fastify.get("/health", async (request, reply) => {
		reply.status(200).send({ status: "ok" });
	});

	fastify.route({
		method: ["GET", "POST"],
		url: "/api/auth/*",
		handler: async (request, reply) => {
			try {
				const url = new URL(request.url, `http://${request.headers.host}`);

				const headers = new Headers();
				Object.entries(request.headers).forEach(([key, value]) => {
					if (value) headers.append(key, value.toString());
				});

				// Create Fetch API-compatible request
				const req = new Request(url.toString(), {
					method: request.method,
					headers,
					body: request.body ? JSON.stringify(request.body) : undefined,
				});

				// Process authentication request
				const response = await fastify.auth.handler(req);

				// Forward response to client
				reply.status(response.status);
				response.headers.forEach((value, key) => reply.header(key, value));
				reply.send(response.body ? await response.text() : null);
			} catch (err) {
				fastify.log.error("Authentication Error:", err);
				reply.status(500).send({
					error: "Internal authentication error",
					code: "AUTH_FAILURE",
				});
			}
		},
	});
}
