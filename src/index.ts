import fastify from "fastify";
import AutoLoad from "@fastify/autoload";
import path from "node:path";
import fastifyEnv from "@fastify/env";

const server = fastify({
	logger: true,
});

server
	.register(fastifyEnv, {
		schema: {
			type: "object",
			required: ["PORT", "DATABASE_URL"],
			properties: {
				PORT: {
					type: "string",
					default: 3000,
				},
				DATABASE_URL: {
					type: "string",
				},
			},
		},
	})
	.then(() => {
		server.register(AutoLoad, {
			dir: path.join(__dirname, "plugins"),
		});

		server.register(AutoLoad, {
			dir: path.join(__dirname, "routes"),
		});

		server.listen({ port: 8080 }, (err, address) => {
			if (err) {
				console.error(err);
				process.exit(1);
			}
			console.log(`Server listening at ${address}`);
		});
	});
