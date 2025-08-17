import type { FastifyInstance, FastifyServerOptions } from "fastify";
import Stripe from "stripe";

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	const stripe = new Stripe(fastify.config.STRIPE_SECRET_KEY);

	fastify.post("/session", async (request, reply) => {
		const session = await stripe.checkout.sessions.create({
			client_reference_id: request.user!.id,
			customer_email: request.user!.email,
			mode: "subscription",
			line_items: [
				{
					// price: "price_1RsOvDIm8TXXTMNzlkG0ysKa",
					price: "price_1RwmPLI8ev3lBpW6N0ewKn1G",
					quantity: 1,
				},
				{
					// price: "price_1Rwm6gIm8TXXTMNzB8yKa71l",
					price: "price_1RwmRQI8ev3lBpW6zwRgYPzg",
				},
				{
					// price: "price_1RwmCnIm8TXXTMNzL291RFkL",
					price: "price_1RwmRkI8ev3lBpW60EMaug3I",
				},
			],
			ui_mode: "hosted",
			success_url: `${fastify.config.APP_URL}/onboarding/comecar`,
		});

		return reply.send({ data: { url: session.url! } });
	});
}
