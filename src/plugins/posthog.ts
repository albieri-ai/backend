import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { PostHog } from "posthog-node";
import { fastifyGracefulShutdown } from "fastify-graceful-shutdown";

const posthogPlugin: FastifyPluginAsync<{}> = async (
	fastify: FastifyInstance,
) => {
	fastify.register(fastifyGracefulShutdown);

	const phClient = new PostHog(
		"phc_YbJS5RdDYAH54LF6Rig4Cc4DOb9wITZgN6pmf2l69R1",
		{ host: "https://us.i.posthog.com" },
	);

	fastify.gracefulShutdown(async (_signal) => {
		await phClient.shutdown();
	});

	fastify.decorate("posthog", phClient);
};

export default fp(posthogPlugin, {
	name: "ai",
	fastify: ">=4.0.0",
	dependencies: ["@fastify/env", "database", "ai"],
});
