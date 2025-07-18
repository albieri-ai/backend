import fastify from "fastify";
import AutoLoad from "@fastify/autoload";
import path from "node:path";
import fastifyEnv from "@fastify/env";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "./database/schema";
import type pg from "pg";
import type { betterAuth } from "better-auth";

async function createServer() {
	const server = fastify({
		logger: true,
	});

	await server.register(fastifyEnv, {
		dotenv: true,
		schema: {
			type: "object",
			required: [
				"PORT",
				"DATABASE_URL",
				"BETTER_AUTH_SECRET",
				"BETTER_AUTH_URL",
			],
			properties: {
				PORT: {
					type: "string",
					default: 8080,
				},
				DATABASE_URL: {
					type: "string",
				},
				BETTER_AUTH_SECRET: {
					type: "string",
				},
				BETTER_AUTH_URL: {
					type: "string",
				},
			},
		},
	});

	await server.register(AutoLoad, {
		dir: path.join(__dirname, "plugins"),
	});

	await server.register(AutoLoad, {
		dir: path.join(__dirname, "routes"),
		dirNameRoutePrefix: true,
	});

	await server.listen({
		port: server.config.PORT ? parseInt(server.config.PORT) : 8080,
	});
}

createServer();

declare module "fastify" {
	interface FastifyInstance {
		config: {
			PORT: string;
			DATABASE_URL: string;
			BETTER_AUTH_SECRET: string;
			BETTER_AUTH_URL: string;
		};
		db: NodePgDatabase<typeof schema> & { $client: pg.Client };
		auth: ReturnType<typeof betterAuth>;
	}
}
