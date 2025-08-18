import type { FastifyInstance, FastifyServerOptions } from "fastify";
import {
	members,
	organizations,
	stripeCustomerId,
	subscriptions,
} from "../../../../database/schema";
import { eq } from "drizzle-orm";

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

		await fastify.db.transaction(async (trx) => {
			const dbUser = await trx.query.users.findFirst({
				where: (u, { eq }) => eq(u.email, customer.email!),
			});

			if (!dbUser) {
				throw new Error("user not found");
			}

			await trx.insert(stripeCustomerId).values({
				user: dbUser.id,
				stripeId: customer.id,
			});

			const userOrganization = await trx
				.select({ id: organizations.id })
				.from(organizations)
				.leftJoin(members, eq(members.organizationId, organizations.id))
				.where(eq(members.id, dbUser.id))
				.limit(1)
				.then(([res]) => res);

			await trx.insert(subscriptions).values({
				owner: dbUser.id,
				stripeId: subscription.id,
				organization: userOrganization?.id,
				createdAt: new Date(subscription.start_date),
				endAt: subscription.ended_at ? new Date(subscription.ended_at) : null,
			});
		});
	}

	async function handleSubscriptionUpdated(subscriptionId: string) {
		const subscription =
			await fastify.stripe.subscriptions.retrieve(subscriptionId);

		if (subscription.ended_at) {
			await fastify.db
				.update(subscriptions)
				.set({
					endAt: subscription.ended_at ? new Date(subscription.ended_at) : null,
				})
				.where(eq(subscriptions.stripeId, subscription.id));
		}
	}

	async function handleSubscriptionDeleted(subscriptionId: string) {
		const subscription =
			await fastify.stripe.subscriptions.retrieve(subscriptionId);

		if (subscription.ended_at) {
			await fastify.db
				.update(subscriptions)
				.set({
					endAt: subscription.ended_at ? new Date(subscription.ended_at) : null,
				})
				.where(eq(subscriptions.stripeId, subscription.id));
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
