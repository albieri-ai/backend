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

const authPlugin: FastifyPluginAsync<{}> = async (fastify: FastifyInstance) => {
  const authClient = betterAuth({
    appName: "albieri",
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

    request.session = session?.session;
    request.user = session?.user;
  });
};

export default fp(authPlugin, {
  name: "auth",
  fastify: ">=4.0.0",
  dependencies: ["@fastify/env", "database"],
});
