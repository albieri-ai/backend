import fastify from "fastify";
import AutoLoad from "@fastify/autoload";
import path from "node:path";
import fastifyEnv from "@fastify/env";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "./database/schema";
import type pg from "pg";
import type { Session, User } from "better-auth";
import type { auth } from "../auth";
import type { S3Client } from "@aws-sdk/client-s3";
import {
	serializerCompiler,
	validatorCompiler,
} from "fastify-type-provider-zod";

async function createServer() {
	const server = fastify({
		logger: true,
	});

	server.setValidatorCompiler(validatorCompiler);
	server.setSerializerCompiler(serializerCompiler);

	server.register(require("@fastify/cors"), {
		origin: "http://localhost:3000",
		methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
		credentials: true,
		maxAge: 86400,
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
				"AWS_ACCESS_KEY_ID",
				"AWS_SECRET_ACCESS_KEY",
				"AWS_S3_BUCKET",
				"BACKEND_URL",
				"GEMINI_API_KEY",
				"GROQ_API_KEY",
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
				AWS_ACCESS_KEY_ID: {
					type: "string",
				},
				AWS_SECRET_ACCESS_KEY: {
					type: "string",
				},
				AWS_S3_BUCKET: {
					type: "string",
				},
				BACKEND_URL: {
					type: "string",
				},
				GEMINI_API_KEY: {
					type: "string",
				},
				GROQ_API_KEY: {
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
			AWS_ACCESS_KEY_ID: string;
			AWS_SECRET_ACCESS_KEY: string;
			AWS_S3_BUCKET: string;
			BACKEND_URL: string;
			GEMINI_API_KEY: string;
			GROQ_API_KEY: string;
		};
		db: NodePgDatabase<typeof schema> & { $client: pg.Client };
		auth: typeof auth;
		s3: S3Client;
	}

	interface FastifyRequest {
		session?: Session;
		user?: User;
	}
}
