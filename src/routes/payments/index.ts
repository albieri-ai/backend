import type { FastifyInstance, FastifyServerOptions } from "fastify";
import { stripeCustomerId } from "../../database/schema";
import { eq } from "drizzle-orm";

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	fastify.post("/billing/session", async (request, reply) => {
		const [customer] = await fastify.db
			.select()
			.from(stripeCustomerId)
			.where(eq(stripeCustomerId.user, request.user!.id));

		if (!customer) {
			return reply.callNotFound();
		}

		const organization = await fastify.db.query.members.findFirst({
			columns: {},
			with: {
				organization: {
					columns: {
						slug: true,
					},
				},
			},
			where: (m, { eq }) => eq(m.userId, request.user!.id),
		});

		if (!organization) {
			return reply.callNotFound();
		}

		const session = await fastify.stripe.billingPortal.sessions.create({
			customer: customer.stripeId,
			return_url: `${fastify.config.APP_URL}/u/${organization.organization.slug}`,
		});

		return reply.send({ data: { url: session.url } });
	});

	fastify.post("/checkout/session", async (request, reply) => {
		const session = await fastify.stripe.checkout.sessions.create({
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
