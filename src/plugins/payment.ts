import axios from "axios";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

const paymentPlugin: FastifyPluginAsync<{}> = async (
	fastify: FastifyInstance,
) => {
	const paymentClient = axios.create({
		baseURL: "https://api.pagar.me/core/v5",
		headers: {
			Authorization: `Bearer ${fastify.config.PAGARME_API_KEY}`,
		},
	});

	fastify.decorate("payment", paymentClient);
};

export default fp(paymentPlugin, {
	name: "payment",
	fastify: ">=4.0.0",
	dependencies: ["@fastify/env"],
});
