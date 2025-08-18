import Stripe from "stripe";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

const stripePlugin: FastifyPluginAsync<{}> = async (
	fastify: FastifyInstance,
) => {
	const stripe = new Stripe(fastify.config.STRIPE_SECRET_KEY);

	fastify.decorate("stripe", stripe);
};

export default fp(stripePlugin, {
	name: "stripe",
	fastify: ">=4.0.0",
	dependencies: ["@fastify/env"],
});
