import { task } from "@trigger.dev/sdk/v3";
import { createDb } from "../database/db";
import {
	members,
	organizations,
	personas,
	stripeCustomerId,
	subscriptions,
	userMessages,
} from "../database/schema";
import {
	and,
	count,
	eq,
	getTableColumns,
	gte,
	lte,
	sql,
	sum,
} from "drizzle-orm";
import Stripe from "stripe";

export const TrackSubscriptionUsage = task({
	id: "track-subscription-usage",
	run: async (payload: { subscriptionId: number }) => {
		const { db } = await createDb({
			connectionString: process.env.DATABASE_URL!,
		});

		const subscription = await db
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.id, payload.subscriptionId))
			.limit(1)
			.then(([res]) => res);

		if (!subscription || !subscription.organization) {
			return;
		}

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

		const [statistics] = await db
			.select({
				messages: count().as("messages"),
				words: sum(userMessages.wordCount).as("words"),
			})
			.from(userMessages)
			.where(
				and(
					eq(userMessages.persona, persona.id),
					gte(
						sql`DATE_TRUNC('day', ${userMessages.date})`,
						sql`DATE_TRUNC('day', NOW() - INTERVAL '24 hours')`,
					),
					lte(
						sql`DATE_TRUNC('day', ${userMessages.date})`,
						sql`DATE_TRUNC('day', NOW())`,
					),
				),
			)
			.groupBy(userMessages.persona);

		if (!statistics) {
			return null;
		}

		const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

		if (statistics.words) {
			await stripe.billing.meterEvents.create({
				event_name: "albieri_words",
				payload: {
					stripe_customer_id: stripeCustomer.stripeId,
					value: statistics.words,
				},
			});
		}

		if (statistics.messages) {
			await stripe.billing.meterEvents.create({
				event_name: "albieri_messages",
				payload: {
					stripe_customer_id: stripeCustomer.stripeId,
					value: statistics.messages.toFixed(0),
				},
			});
		}
	},
});
