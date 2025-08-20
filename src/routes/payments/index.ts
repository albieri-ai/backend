import type { FastifyInstance, FastifyServerOptions } from "fastify";

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	fastify.get("/subscription", async (request, reply) => {
		if (!request.user) {
			return reply.status(401).send({ error: "Unauthorized" });
		}

		const organization = await fastify.db.query.members.findFirst({
			columns: {},
			with: {
				organization: {
					columns: {
						id: true,
						slug: true,
					},
				},
			},
			where: (m, { eq }) => eq(m.userId, request.user!.id),
		});

		if (!organization) {
			const stripeCustomer = await fastify.db.query.stripeCustomerId.findFirst({
				where: (sic, { eq }) => eq(sic.user, request.user!.id),
			});

			const activeUserSubscriptions = await fastify.stripe.subscriptions.list({
				customer: stripeCustomer?.stripeId,
				status: "active",
			});

			if (activeUserSubscriptions?.data.length) {
				const stripeSubscription = activeUserSubscriptions.data[0];

				return reply.send({
					data: {
						id: stripeSubscription.id,
						status: stripeSubscription.status,
						canceledAt: stripeSubscription.canceled_at,
						// discounts: stripeSubscription.discounts,
						endedAt: stripeSubscription.ended_at,
						startDate: stripeSubscription.start_date,
						trialEnd: stripeSubscription.trial_end,
						trialStart: stripeSubscription.trial_start,
					},
				});
			}

			return reply.send({ data: null });
		}

		const subscription = await fastify.db.query.subscriptions.findFirst({
			where: (s, { eq }) => eq(s.organization, organization.organization.id),
		});

		if (!subscription) {
			return reply.send({ data: null });
		}

		const stripeSubscription = await fastify.stripe.subscriptions.retrieve(
			subscription.stripeId,
		);

		return reply.send({
			data: {
				id: stripeSubscription.id,
				status: stripeSubscription.status,
				canceledAt: stripeSubscription.canceled_at,
				// discounts: stripeSubscription.discounts,
				endedAt: stripeSubscription.ended_at,
				startDate: stripeSubscription.start_date,
				trialEnd: stripeSubscription.trial_end,
				trialStart: stripeSubscription.trial_start,
			},
		});
	});

	fastify.post("/billing/session", async (request, reply) => {
		const organization = await fastify.db.query.members.findFirst({
			columns: {},
			with: {
				organization: {
					columns: {
						id: true,
						slug: true,
					},
				},
			},
			where: (m, { eq }) => eq(m.userId, request.user!.id),
		});

		if (!organization) {
			return reply.callNotFound();
		}

		const subscription = await fastify.db.query.subscriptions.findFirst({
			where: (s, { eq }) => eq(s.organization, organization.organization.id),
		});

		if (!subscription) {
			return reply.callNotFound();
		}

		const stripeCustomer = await fastify.db.query.stripeCustomerId.findFirst({
			where: (sci, { eq }) => eq(sci.user, subscription.owner!),
		});

		if (!stripeCustomer) {
			return reply.callNotFound();
		}

		const session = await fastify.stripe.billingPortal.sessions.create({
			customer: stripeCustomer.stripeId,
			return_url: `${fastify.config.APP_URL}/u/${organization.organization.slug}`,
		});

		return reply.send({ data: { url: session.url } });
	});

	fastify.post("/checkout/session", async (request, reply) => {
		if (!request.user) {
			return reply.status(401).send({ error: "Unauthorized" });
		}

		const env = fastify.config.APP_ENV;
		const baseSubscriptionPriceId =
			env === "production"
				? "price_1RsOvDIm8TXXTMNzlkG0ysKa"
				: "price_1RwmPLI8ev3lBpW6N0ewKn1G";
		const messagesPackagePriceId =
			env === "production"
				? "price_1Rwm6gIm8TXXTMNzB8yKa71l"
				: "price_1RwmRQI8ev3lBpW6zwRgYPzg";
		const wordsPackagePriceId =
			env === "production"
				? "price_1RwmCnIm8TXXTMNzL291RFkL"
				: "price_1RwmRkI8ev3lBpW60EMaug3I";

		const session = await fastify.stripe.checkout.sessions.create({
			client_reference_id: request.user!.id,
			customer_email: request.user!.email,
			mode: "subscription",
			line_items: [
				{
					price: baseSubscriptionPriceId,
					quantity: 1,
				},
				{
					price: messagesPackagePriceId,
				},
				{
					price: wordsPackagePriceId,
				},
			],
			ui_mode: "hosted",
			success_url: `${fastify.config.APP_URL}/onboarding/comecar`,
		});

		return reply.send({ data: { url: session.url! } });
	});
}
