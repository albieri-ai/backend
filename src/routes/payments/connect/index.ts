import type { FastifyInstance, FastifyServerOptions } from "fastify";
import {
	members,
	merchantAccounts,
	organizations,
} from "../../../database/schema";
import { and, eq, getTableColumns } from "drizzle-orm";
import z from "zod";

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	fastify.post<{ Querystring: { organization: string } }>(
		"/accounts",
		{
			schema: {
				querystring: z.object({
					organization: z.string(),
				}),
			},
		},
		async (request, reply) => {
			const { user } = request;

			if (!user) {
				return reply.status(401).send({ error: "Unauthorized" });
			}

			const organization = await fastify.db
				.select({
					...getTableColumns(organizations),
				})
				.from(members)
				.leftJoin(organizations, eq(organizations.id, members.organizationId))
				.where(
					and(
						eq(members.userId, user.id),
						eq(organizations.id, request.query.organization),
					),
				)
				.then(([res]) => res);

			if (!organization) {
				return reply.status(401).send({ error: "Unauthorized" });
			}

			const account = await fastify.stripe.accounts.create({
				type: "express",
				country: "BR",
				email: user.email,
				capabilities: {
					card_payments: { requested: true },
					transfers: { requested: true },
				},
			});

			await fastify.db.insert(merchantAccounts).values({
				stripeId: account.id,
				user: user.id,
			});

			const accountLink = await fastify.stripe.accountLinks.create({
				account: account.id,
				refresh_url: `${fastify.config.BACKEND_URL}/payments/connect/accounts/${account.id}`,
				return_url: `${fastify.config.APP_URL}/${organization.slug}/monetizacao`,
				type: "account_onboarding",
			});

			reply.send({ data: { url: accountLink.url } });
		},
	);

	fastify.get<{ Params: { id: string } }>(
		"/accounts/:id",
		async (request, reply) => {
			const account = await fastify.db.query.merchantAccounts.findFirst({
				where: (acc, { eq }) => eq(acc.id, request.params.id),
			});

			if (!account) {
				return reply.status(404).send({ error: "Account not found" });
			}

			const accountLink = await fastify.stripe.accountLinks.create({
				account: request.params.id,
				refresh_url: "http://localhost:3000/refresh-onboarding",
				return_url: "http://localhost:3000/",
				type: "account_onboarding",
			});

			reply.redirect(accountLink.url);
		},
	);

	fastify.post<{ Params: { id: string } }>(
		"/accounts/:id/login",
		async (request, reply) => {
			const account = await fastify.db.query.merchantAccounts.findFirst({
				where: (acc, { eq }) => eq(acc.id, request.params.id),
			});

			if (!account) {
				return reply.status(404).send({ error: "Account not found" });
			}

			const loginLink = await fastify.stripe.accounts.createLoginLink(
				request.params.id,
			);

			reply.send({ data: { url: loginLink.url } });
		},
	);
}
