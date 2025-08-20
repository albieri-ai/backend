import { schedules } from "@trigger.dev/sdk/v3";
import { createDb } from "../database/db";
import {
	members,
	organizations,
	personas,
	stripeCustomerId,
	subscriptionLimits,
	subscriptions,
	userMessages,
} from "../database/schema";
import { and, between, count, eq, getTableColumns, or, sum } from "drizzle-orm";
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

		const extraWordsItem = stripeSubscription.items.data.find(
			(d) =>
				d.price.id === "price_1Rwm6gIm8TXXTMNzB8yKa71l" ||
				d.price.id === "price_1RwmRQI8ev3lBpW6zwRgYPzg",
		);
		const extraMessagesItem = stripeSubscription.items.data.find(
			(d) =>
				d.price.id === "price_1RwmCnIm8TXXTMNzL291RFkL" ||
				d.price.id === "price_1RwmRkI8ev3lBpW60EMaug3I",
		);

		const defaultLimits = await db
			.select()
			.from(subscriptionLimits)
			.where(
				and(
					eq(subscriptionLimits.subscription, subscription.id),
					or(
						eq(subscriptionLimits.key, "words"),
						eq(subscriptionLimits.key, "messages"),
					),
				),
			);

		if (extraWordsItem) {
			const wordLimit = defaultLimits.find((d) => d.key === "words");
			const wordLimitCount = wordLimit?.value ? parseInt(wordLimit?.value) : 0;

			const words = await db
				.select({
					words: sum(userMessages.wordCount).as("words"),
				})
				.from(userMessages)
				.where(
					and(
						eq(userMessages.persona, persona.id),
						between(
							userMessages.date,
							new Date(extraWordsItem.current_period_start),
							new Date(extraWordsItem.current_period_end),
						),
					),
				)
				.groupBy(userMessages.persona)
				.then(([res]) => res?.words || "0");

			if (parseInt(words) > wordLimitCount) {
				await stripe.billing.meterEvents.create({
					event_name: "albieri_words",
					payload: {
						stripe_customer_id: stripeCustomer.stripeId,
						value: (parseInt(words) - wordLimitCount).toFixed(0),
					},
				});
			}
		}

		if (extraMessagesItem) {
			const messageLimit = defaultLimits.find((d) => d.key === "messages");
			const messageLimitCount = messageLimit?.value
				? parseInt(messageLimit?.value)
				: 0;

			const messages = await db
				.select({
					messages: count().as("messages"),
				})
				.from(userMessages)
				.where(
					and(
						eq(userMessages.persona, persona.id),
						between(
							userMessages.date,
							new Date(extraMessagesItem.current_period_start),
							new Date(extraMessagesItem.current_period_end),
						),
					),
				)
				.groupBy(userMessages.persona)
				.then(([res]) => res?.messages || 0);

			if (messages > messageLimitCount) {
				await stripe.billing.meterEvents.create({
					event_name: "albieri_messages",
					payload: {
						stripe_customer_id: stripeCustomer.stripeId,
						value: (messages - messageLimitCount).toFixed(0),
					},
				});
			}
		}
	},
});
