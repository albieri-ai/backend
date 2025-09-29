import type { FastifyInstance, FastifyServerOptions } from "fastify";
import { subscriptions } from "../../database/schema";
import { eq } from "drizzle-orm";

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

			if (!stripeCustomer) {
				return reply.send({ data: null });
			}

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
			where: (s, { eq, or, and, isNull }) =>
				or(
					eq(s.organization, organization.organization.id),
					and(eq(s.owner, request.user!.id), isNull(s.organization)),
				),
		});

		if (!subscription) {
			return reply.send({ data: null });
		}

		const stripeSubscription = await fastify.stripe.subscriptions.retrieve(
			subscription.stripeId,
		);

		if (stripeSubscription && !subscription.organization) {
			await fastify.db
				.update(subscriptions)
				.set({ organization: organization.organization.id })
				.where(eq(subscriptions.id, subscription.id));
		} else if (!stripeSubscription) {
			return reply.send({ data: null });
		}

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

	fastify.get("/billing/session", async (request, reply) => {
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
			locale: "pt-BR",
		});

		reply.header("cache-control", "private, max-age=30");

		return reply.send({ data: { url: session.url } });
	});

	fastify.post("/checkout/session", async (request, reply) => {
		if (!request.user) {
			return reply.status(401).send({ error: "Unauthorized" });
		}

		const env = fastify.config.APP_ENV;
		const baseSubscriptionPriceId =
			env === "production"
				? "price_1S752EIXzF0eOiKFZH5YH3SQ"
				: "price_1S74paIbAFGq3bR6IeBiua05";
		const messagesPackagePriceId =
			env === "production"
				? "price_1S756zIXzF0eOiKF9HwYROSP"
				: "price_1SADqkIbAFGq3bR66QHZmTw3";
		const wordsPackagePriceId =
			env === "production"
				? "price_1S756VIXzF0eOiKFJNs394SB"
				: "price_1SADpaIbAFGq3bR6oGDz9MKN";

		const { data } = await fastify.stripe.customers.list({
			email: request.user!.email,
		});
		const stripeCustomer = data?.[0];

		if (stripeCustomer) {
			const { data } = await fastify.stripe.subscriptions.list({
				customer: stripeCustomer.id,
				price: baseSubscriptionPriceId,
			});

			if (data.find((d) => d.status !== "canceled" && d.status !== "paused")) {
				return reply.status(400).send({ error: "Active subscription found" });
			}
		}

		const session = await fastify.stripe.checkout.sessions.create({
			client_reference_id: request.user!.id,
			customer_email: request.user!.email,
			customer: stripeCustomer?.id,
			mode: "subscription",
			allow_promotion_codes: true,
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
			locale: "pt-BR",
			success_url: `${fastify.config.APP_URL}/onboarding/comecar`,
		});

		// await fastify.facebookTracker.trackInitiateCheckout({
		// 	email: request.user.email,
		// 	currency: "BRL",
		// 	successUrl: session.url || undefined,
		// 	timestamp: Math.floor(Date.now() / 1000),
		// });

		return reply.send({ data: { url: session.url! } });
	});
}
