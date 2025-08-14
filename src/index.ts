import fastify from "fastify";
import AutoLoad from "@fastify/autoload";
import cors from "@fastify/cors";
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
import type { AxiosInstance } from "axios";
import type { InferSelectModel } from "drizzle-orm";
import type { personas } from "./database/schema";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";

async function createServer() {
	const server = fastify({
		logger: true,
	});

	server.setValidatorCompiler(validatorCompiler);
	server.setSerializerCompiler(serializerCompiler);
	server.setNotFoundHandler((_, reply) =>
		reply.status(404).send({ error: "Not Found" }),
	);
	server.setErrorHandler((error, _, reply) =>
		reply.status(error.statusCode || 500).send({ error: error.message }),
	);

	server.register(cors, {
		origin: ["http://localhost:3000"],
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
				"OPENAI_API_KEY",
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
				OPENAI_API_KEY: {
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
		routeParams: true,
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
			OPENAI_API_KEY: string;
		};
		db: NodePgDatabase<typeof schema> & { $client: pg.Client };
		auth: typeof auth;
		s3: S3Client;
		ai: {
			providers: {
				gemini: ReturnType<typeof createGoogleGenerativeAI>;
				groq: ReturnType<typeof createGroq>;
				openai: ReturnType<typeof createOpenAI>;
			};
			handlers: {
				retrieveContent: (
					persona: string,
					embed: number[],
				) => Promise<
					{ asset: string; summary: string | null; chunk: string }[]
				>;
			};
		};
	}

	interface FastifyRequest {
		session?: Session;
		user?: User;
		persona?: InferSelectModel<typeof personas>;
	}
}
