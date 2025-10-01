import { schedules } from "@trigger.dev/sdk";
import { createDb } from "../database/db";
import {
	members,
	organizations,
	personas,
	stripeCustomerId,
	subscriptions,
	trainingAssets,
	userMessages,
} from "../database/schema";
import { and, between, count, eq, getTableColumns, sum } from "drizzle-orm";
import Stripe from "stripe";

export const TrackSubscriptionUsage = schedules.task({
	id: "track-subscription-usage",
	run: async (payload) => {
		if (!payload.externalId) {
			throw new Error("invalid external id");
		}

		const { db } = await createDb({
			connectionString: process.env.DATABASE_URL!,
		});

		const subscription = await db
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.id, parseInt(payload.externalId)))
			.limit(1)
			.then(([res]) => res);

		if (!subscription || !subscription.organization) {
			return;
		}

		const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

		const stripeSubscription = await stripe.subscriptions.retrieve(
			subscription.stripeId,
		);

		const stripeCustomer = await db
			.select({ ...getTableColumns(stripeCustomerId) })
			.from(stripeCustomerId)
			.leftJoin(
				members,
				and(
					eq(members.id, stripeCustomerId.user),
					eq(members.organizationId, subscription.organization),
				),
			)
			.then(([res]) => res);

		if (!stripeCustomer) {
			return;
		}

		const [persona] = await db
			.select({ id: personas.id })
			.from(personas)
			.leftJoin(organizations, eq(organizations.id, personas.organization))
			.leftJoin(members, eq(members.organizationId, organizations.id))
			.where(eq(members.userId, subscription.owner))
			.limit(1);

		if (!persona) {
			return;
		}

		const limits = await db.query.subscriptionLimits.findMany({
			columns: {
				limit: false,
			},
			with: {
				limit: true,
			},
			where: (sl, { eq }) => eq(sl.subscription, subscription.id),
		});

		for (const limit of limits) {
			// update to count training assets
			if (limit.limit?.stripeMeterId === "albieri_words") {
				const extraItem = stripeSubscription.items.data.find(
					(d) => d.price.id === limit.limit?.stripeMeterId,
				);

				if (!extraItem) {
					continue;
				}

				const words = await db
					.select({
						count: sum(trainingAssets.wordCount).as("count"),
					})
					.from(trainingAssets)
					.where(eq(trainingAssets.persona, persona.id))
					.then((res) => (res[0]?.count ? parseInt(res[0]?.count) : 0));

				const wordLimitCount = limit?.value ? parseInt(limit?.value) || 0 : 0;

				if (words > wordLimitCount) {
					await stripe.billing.meterEvents.create({
						event_name: "albieri_words",
						payload: {
							stripe_customer_id: stripeCustomer.stripeId,
							value: (words - wordLimitCount).toFixed(0),
						},
					});
				}
			} else if (limit.limit?.stripeMeterId === "albieri_messages") {
				const extraItem = stripeSubscription.items.data.find(
					(d) => d.price.id === limit.limit?.stripeMeterId,
				);

				if (!extraItem) {
					continue;
				}

				const messageCount = await db
					.select({
						messages: count().as("messages"),
					})
					.from(userMessages)
					.where(
						and(
							eq(userMessages.persona, persona.id),
							between(
								userMessages.date,
								new Date(extraItem.current_period_start),
								new Date(extraItem.current_period_end),
							),
						),
					)
					.groupBy(userMessages.persona)
					.then(([res]) => res?.messages || 0);

				const limitCount = limit?.value ? parseInt(limit?.value) || 0 : 0;

				if (messageCount > limitCount) {
					await stripe.billing.meterEvents.create({
						event_name: "albieri_messages",
						payload: {
							stripe_customer_id: stripeCustomer.stripeId,
							value: (messageCount - limitCount).toFixed(0),
						},
					});
				}
			}
		}
	},
});
