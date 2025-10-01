import type { FastifyInstance, FastifyServerOptions } from "fastify";
import {
	members,
	organizations,
	type personas,
	stripeCustomerId,
	subscriptionLimits,
	subscriptions,
	subscriptionUsageTrackWorkflow,
} from "../../../../database/schema";
import { eq, type InferSelectModel } from "drizzle-orm";
import { TrackSubscriptionUsage } from "../../../../trigger/subscription";
import { schedules } from "@trigger.dev/sdk";

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	async function handleSubscriptionCreated(subscriptionId: string) {
		const subscription =
			await fastify.stripe.subscriptions.retrieve(subscriptionId);

		if (!subscription) {
			throw new Error("subscription not found");
		}

		const customer = await fastify.stripe.customers.retrieve(
			subscription.customer as string,
		);

		if (!customer || customer.deleted) {
			throw new Error("customer not found");
		}

		const albieriSubscription = await fastify.db.transaction(async (trx) => {
			const dbUser = await trx.query.users.findFirst({
				where: (u, { eq }) => eq(u.email, customer.email!),
			});

			if (!dbUser) {
				throw new Error("user not found");
			}

			await trx
				.insert(stripeCustomerId)
				.values({
					user: dbUser.id,
					stripeId: customer.id,
				})
				.onConflictDoUpdate({
					target: [stripeCustomerId.user],
					set: {
						stripeId: customer.id,
					},
				});

			const userOrganization = await trx
				.select({ id: organizations.id })
				.from(organizations)
				.leftJoin(members, eq(members.organizationId, organizations.id))
				.where(eq(members.id, dbUser.id))
				.limit(1)
				.then(([res]) => res);

			let persona: InferSelectModel<typeof personas> | null = null;

			if (userOrganization) {
				persona = (await trx.query.personas.findFirst({
					where: (p, { eq }) => eq(p.organization, userOrganization?.id),
				})) as InferSelectModel<typeof personas> | null;
			}

			const subscriptionPlan = await trx.query.subscriptionPlans.findFirst({
				columns: {
					id: true,
				},
				with: {
					limits: true,
				},
				where: (sp, { inArray }) =>
					inArray(
						sp.stripeId,
						subscription.items.data
							.filter((d) => !d.deleted && d.quantity && d.quantity > 0)
							.map((d) => d.price.id),
					),
			});

			const insertedSubscription = await trx
				.insert(subscriptions)
				.values({
					owner: dbUser.id,
					stripeId: subscription.id,
					organization: userOrganization?.id,
					createdAt: new Date(subscription.start_date * 1000),
					endAt: subscription.ended_at
						? new Date(subscription.ended_at * 1000)
						: null,
				})
				.onConflictDoUpdate({
					target: [subscriptions.stripeId],
					set: {
						organization: userOrganization?.id,
						createdAt: new Date(subscription.start_date * 1000),
						endAt: subscription.ended_at
							? new Date(subscription.ended_at * 1000)
							: null,
					},
				})
				.returning()
				.then(([res]) => res);

			if (subscriptionPlan?.limits?.length) {
				await trx.insert(subscriptionLimits).values(
					subscriptionPlan?.limits.map((lim) => ({
						subscription: insertedSubscription.id,
						key: lim.key,
						limit: lim.id,
						value: lim.value.toFixed(0),
					})),
				);
			}

			fastify.posthog.capture({
				event: "subscription created",
				distinctId: dbUser.id,
				properties: {
					organization: userOrganization?.id,
					persona: persona?.id,
				},
			});

			return insertedSubscription;
		});

		const schedule = await schedules.create({
			task: TrackSubscriptionUsage.id,
			externalId: albieriSubscription.id.toString(),
			cron: "0 3 * * *",
			timezone: "America/Sao_Paulo",
			deduplicationKey: `track-subscription-usage-${albieriSubscription.id}`,
		});

		await fastify.db.insert(subscriptionUsageTrackWorkflow).values({
			subscription: albieriSubscription.id,
			workflowId: schedule.id,
		});
	}

	async function handleSubscriptionUpdated(subscriptionId: string) {
		const subscription =
			await fastify.stripe.subscriptions.retrieve(subscriptionId);

		if (subscription.ended_at) {
			await fastify.db
				.update(subscriptions)
				.set({
					endAt: subscription.ended_at
						? new Date(subscription.ended_at * 1000)
						: null,
				})
				.where(eq(subscriptions.stripeId, subscription.id));
		}
	}

	async function handleSubscriptionDeleted(subscriptionId: string) {
		const subscription =
			await fastify.stripe.subscriptions.retrieve(subscriptionId);

		if (subscription.ended_at) {
			const updatedSubscription = await fastify.db
				.update(subscriptions)
				.set({
					endAt: subscription.ended_at
						? new Date(subscription.ended_at * 1000)
						: null,
				})
				.where(eq(subscriptions.stripeId, subscription.id))
				.returning()
				.then(([res]) => res);

			const [workflow] = await fastify.db
				.select()
				.from(subscriptionUsageTrackWorkflow)
				.where(
					eq(
						subscriptionUsageTrackWorkflow.subscription,
						updatedSubscription.id,
					),
				);

			if (workflow) {
				await schedules.deactivate(workflow.workflowId!).catch(() => null);
			}
		}
	}

	fastify.post<{ Body: Buffer }>(
		"/",
		{ config: { rawBody: true } },
		async (request, reply) => {
			const event = fastify.stripe.webhooks.constructEvent(
				request.rawBody as string,
				request.headers["stripe-signature"] as string,
				fastify.config.STRIPE_WEBHOOK_SECRET,
			);
			switch (event.type) {
				case "customer.subscription.created":
					await handleSubscriptionCreated(event.data.object.id);

					break;
				case "customer.subscription.deleted":
					await handleSubscriptionUpdated(event.data.object.id);

					break;
				case "customer.subscription.updated":
					await handleSubscriptionDeleted(event.data.object.id);

					break;
			}
			return reply.status(204).send();
		},
	);
}
