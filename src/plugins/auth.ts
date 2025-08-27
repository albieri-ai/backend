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
import { threads } from "../database/schema";
import { eq } from "drizzle-orm";

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
		session: {
			cookieCache: {
				enabled: true,
				maxAge: 5 * 60,
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
		plugins: [
			jwt(),
			bearer(),
			organization(),
			admin(),
			anonymous({
				onLinkAccount: async ({ anonymousUser, newUser }) => {
					await fastify.db
						.update(threads)
						.set({
							author: newUser.user.id,
						})
						.where(eq(threads.author, anonymousUser.user.id));
				},
			}),
		],
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
