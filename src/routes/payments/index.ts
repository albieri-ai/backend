import type { FastifyInstance, FastifyServerOptions } from "fastify";
import { subscriptions } from "../../database/schema";
import { desc, eq, or } from "drizzle-orm";
import z from "zod";

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

		const subscription = await fastify.db.query.subscriptions.findFirst({
			where: (s, { eq }) =>
				organization
					? or(
							eq(s.organization, organization.organization.id),
							eq(s.owner, request.user!.id),
						)
					: eq(s.owner, request.user!.id),
			orderBy: [desc(subscriptions.createdAt)],
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
			return_url: organization
				? `${fastify.config.APP_URL}/u/${organization.organization.slug}`
				: `${fastify.config.APP_URL}/onboarding/comecar`,
			locale: "pt-BR",
		});

		reply.header("cache-control", "private, max-age=30");

		return reply.send({ data: { url: session.url } });
	});

	fastify.post<{ Querystring: { plan: string } }>(
		"/checkout/session",
		{
			schema: {
				querystring: z.object({
					plan: z.string().default("basic_monthly"),
				}),
			},
		},
		async (request, reply) => {
			if (!request.user) {
				return reply.status(401).send({ error: "Unauthorized" });
			}

			const plan = await fastify.db.query.subscriptionPlans.findFirst({
				where: (sub, { eq }) => eq(sub.key, request.query.plan),
			});

			if (!plan) {
				return reply.status(404).send({ error: "Plan not found" });
			}

			const limits = await fastify.db.query.subscriptionPlanLimits.findMany({
				where: (sl, { eq }) => eq(sl.plan, plan.id),
			});

			const { data } = await fastify.stripe.customers.list({
				email: request.user!.email,
			});
			const stripeCustomer = data?.[0];

			if (stripeCustomer) {
				const { data } = await fastify.stripe.subscriptions.list({
					customer: stripeCustomer.id,
					price: plan.stripeId,
				});

				if (
					data.find((d) => d.status !== "canceled" && d.status !== "paused")
				) {
					return reply.status(400).send({ error: "Active subscription found" });
				}
			}

			const session = await fastify.stripe.checkout.sessions
				.create({
					client_reference_id: request.user!.id,
					customer_email: request.user!.email,
					customer: stripeCustomer?.id,
					mode: "subscription",
					allow_promotion_codes: true,
					line_items: [
						{
							price: plan.stripeId,
							quantity: 1,
						},
						...limits.map((l) => ({
							price: l.stripeId,
						})),
					],
					ui_mode: "hosted",
					locale: "pt-BR",
					success_url: `${fastify.config.APP_URL}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
				})
				.catch((err) => {
					console.error(err);
					throw err;
				});

			return reply.send({
				data: {
					url: session.url!,
					currency: session.currency,
					amountTotal: session.amount_total,
					items: session.line_items?.data.map((it) => ({
						id: it.id,
						name: it.description,
						currency: it.currency,
						price: it.price,
						quantity: it.quantity,
					})),
				},
			});
		},
	);

	fastify.get<{ Params: { sessionId: string } }>(
		"/checkout/session/:sessionId",
		{
			schema: {
				params: z.object({
					sessionId: z.string(),
				}),
			},
		},
		async (request, reply) => {
			const checkoutSession = await fastify.stripe.checkout.sessions.retrieve(
				request.params.sessionId,
			);

			reply.send({
				data: {
					id: checkoutSession.id,
					paymentStatus: checkoutSession.payment_status,
					amountTotal: checkoutSession.amount_total,
					customer: checkoutSession.customer,
					customerEmail: checkoutSession.customer_email,
					currency: checkoutSession.currency,
					status: checkoutSession.status,
					subscription: checkoutSession.subscription,
				},
			});
		},
	);
}
