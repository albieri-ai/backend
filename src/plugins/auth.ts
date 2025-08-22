import { betterAuth } from "better-auth";
import {
	jwt,
	bearer,
	organization,
	admin,
	anonymous,
} from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { createId } from "@paralleldrive/cuid2";

const authPlugin: FastifyPluginAsync<{}> = async (fastify: FastifyInstance) => {
	const authClient = betterAuth({
		appName: "albieri",
		user: {
			additionalFields: {
				whatsapp: {
					type: "string",
					required: false,
				},
				avatarId: {
					type: "string",
					fieldName: "avatar_id",
					required: false,
				},
			},
		},
		advanced: {
			database: {
				generateId: createId,
			},
			disableCSRFCheck: true,
			crossSubDomainCookies: {
				enabled: true,
				domain: fastify.config.APP_ENV !== "dev" ? "albieri.ai" : undefined,
			},
		},
		emailAndPassword: {
			enabled: true,
			minPasswordLength: 8,
			revokeSessionsOnPasswordReset: true,
		},
		plugins: [jwt(), bearer(), organization(), admin(), anonymous()],
		database: drizzleAdapter(fastify.db, { provider: "pg", usePlural: true }),
	});

	fastify.decorate("auth", authClient);

	fastify.addHook("preValidation", async (request) => {
		const headers = new Headers();
		Object.entries(request.headers).forEach(([key, value]) => {
			if (value) headers.append(key, value.toString());
		});

		const session = await authClient.api.getSession({ headers });

		if (session?.session) {
			request.session = session?.session;
			request.user = session?.user;
		}
	});
};

export default fp(authPlugin, {
	name: "auth",
	fastify: ">=4.0.0",
	dependencies: ["@fastify/env", "database"],
});
