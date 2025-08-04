import type { FastifyInstance, FastifyServerOptions } from "fastify";
import {
	members,
	organizations,
	subscriptions,
} from "../../../database/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { generateId } from "better-auth/*";
import { z } from "zod";

const CreateSubscriptionSchema = z.object({
	card: z.object({
		token: z.string(),
		billingAddress: z.object({
			street: z.string(),
			number: z.string(),
			neighborhood: z.string(),
			complement: z.string(),
			zipCode: z.string(),
			city: z.string(),
			state: z.string(),
		}),
	}),
	customer: z.object({
		email: z.string().email(),
		name: z.string(),
		document: z.string(),
		customerType: z.enum(["individual", "company"]),
		phone: z.object({
			ddd: z.string(),
			number: z.string(),
		}),
	}),
});

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	const getSubscription = async (organizationID: string) => {
		const [subscription] = await fastify.db
			.select()
			.from(subscriptions)
			.where(eq(subscriptions.organization, organizationID))
			.orderBy(desc(subscriptions.createdAt))
			.limit(1);

		if (!subscription) {
			return null;
		}

		const { data: pagarmeSubscription } = await fastify.payment.get<{
			id: string;
			code: string;
			start_at: string;
			interval: string;
			interval_count: number;
			billing_type: string;
			boleto_due_days?: number;
			current_cycle: {
				id: string;
				start_at: string;
				end_at: string;
				billing_at: string;
				status: string;
				cycle: number;
			};
			next_billing_at: string;
			payment_method: string;
			currency: string;
			installments: number;
			minimum_price: number;
			status: string;
			created_at: string;
			updated_at: string;
			customer: {
				id: string;
				name: string;
				email: string;
				code: string;
				document: string;
				document_type: string;
				type: string;
				delinquent: boolean;
				created_at: string;
				updated_at: string;
				phones: {
					mobile_phone: {
						country_code: string;
						number: string;
						area_code: string;
					};
				};
			};
			card: {
				id: string;
				first_six_digits: string;
				last_four_digits: string;
				brand: string;
				holder_name: string;
				exp_month: number;
				exp_year: number;
				status: string;
				type: string;
				created_at: string;
				updated_at: string;
				billing_address: {
					zip_code: string;
					city: string;
					state: string;
					country: string;
					line_1: string;
					line_2: string;
				};
			};
			plan: {
				id: string;
				name: string;
				url: string;
				minimum_price: number;
				interval: string;
				interval_count: number;
				billing_type: string;
				payment_methods: string[];
				installments: number[];
				status: string;
				currency: string;
				created_at: string;
				updated_at: string;
			};
			items: {
				id: string;
				name: string;
				description: string;
				quantity: number;
				status: string;
				created_at: string;
				updated_at: string;
				pricing_scheme: {
					price: number;
					scheme_type: string;
				};
			}[];
			increments: {
				id: string;
				cycles: number;
				value: number;
				discount_type: string;
				created_at: string;
			}[];
			discounts: {
				id: string;
				cycles: number;
				value: number;
				discount_type: string;
				created_at: string;
			}[];
		}>(`/subscriptions/${subscription.id}`);

		return {
			id: subscription.id,
			externalId: pagarmeSubscription.id,
			start_at: pagarmeSubscription.start_at,

			currentCycle: pagarmeSubscription.current_cycle,
			card: {
				id: pagarmeSubscription.card.id,
				firstSixDigits: pagarmeSubscription.card.first_six_digits,
				lastFourDigits: pagarmeSubscription.card.last_four_digits,
				brand: pagarmeSubscription.card.brand,
				holderName: pagarmeSubscription.card.holder_name,
				expMonth: pagarmeSubscription.card.exp_month,
				exp_year: pagarmeSubscription.card.exp_year,
				status: pagarmeSubscription.card.status,
			},
			plan: {
				id: pagarmeSubscription.plan.id,
				name: pagarmeSubscription.plan.name,
			},
			items: {},

			increments: pagarmeSubscription.increments,
			discounts: pagarmeSubscription.discounts,
		};
	};

	fastify.get<{ Params: { id: string } }>(
		"/subscriptions",
		async (request, reply) => {
			if (request.user?.id) {
				return reply.unauthorized();
			}

			const [organization] = await fastify.db
				.select()
				.from(organizations)
				.where(eq(organizations.id, request.params.id));

			if (!organization) {
				return reply.callNotFound();
			}

			const isMember = await fastify.db
				.select()
				.from(members)
				.where(
					and(
						eq(members.organizationId, organization.id),
						eq(members.userId, request.user!.id),
					),
				)
				.then(([res]) => !!res);

			if (!isMember) {
				return reply.forbidden();
			}

			const subscription = await getSubscription(organization.id);

			if (!subscription) {
				return reply.callNotFound();
			}

			reply.send({ data: subscription });
		},
	);

	fastify.post<{
		Params: { id: string };
		Body: z.infer<typeof CreateSubscriptionSchema>;
	}>(
		"/subscriptions",
		{
			schema: {
				params: z.object({
					id: z.string(),
				}),
				body: CreateSubscriptionSchema,
			},
		},
		async (request, reply) => {
			if (request.user?.id) {
				return reply.unauthorized();
			}

			const [organization] = await fastify.db
				.select()
				.from(organizations)
				.where(eq(organizations.id, request.params.id));

			if (!organization) {
				return reply.callNotFound();
			}

			const isMember = await fastify.db
				.select()
				.from(members)
				.where(
					and(
						eq(members.organizationId, organization.id),
						eq(members.userId, request.user!.id),
					),
				)
				.then(([res]) => !!res);

			if (!isMember) {
				return reply.forbidden();
			}

			const [subscription] = await fastify.db
				.select()
				.from(subscriptions)
				.where(eq(subscriptions.organization, organization.id))
				.orderBy(desc(subscriptions.createdAt))
				.limit(1);

			if (subscription) {
				return reply.status(409).send({ error: "Conflict" });
			}

			const { data: pagarmeSubscription } = await fastify.payment.post(
				"/subscriptions",
				{
					code: generateId(),
					plan_id: "",
					payment_method: "credit_card",
					card: {
						card_token: request.body.card.token,
						billing_address: {
							line_1: `${request.body.card.billingAddress.street}, ${request.body.card.billingAddress.number}, ${request.body.card.billingAddress.neighborhood}`,
							line_2: request.body.card.billingAddress.complement,
							zip_code: request.body.card.billingAddress.zipCode,
							city: request.body.card.billingAddress.city,
							state: request.body.card.billingAddress.state,
							country: "BR",
						},
					},
					installments: 1,
					customer: request.body.customer,
					metadata: {
						organization: organization.id,
					},
				},
			);

			await fastify.db.insert(subscriptions).values({
				organization: organization.id,
				pagarmeId: pagarmeSubscription.id,
			});

			const finalSubscription = await getSubscription(organization.id);

			return reply.send({ data: finalSubscription });
		},
	);

	fastify.delete<{ Params: { id: string } }>(
		"/subscriptions/:subscriptionId",
		async (request, reply) => {
			if (request.user?.id) {
				return reply.unauthorized();
			}

			const [organization] = await fastify.db
				.select()
				.from(organizations)
				.where(eq(organizations.id, request.params.id));

			if (!organization) {
				return reply.callNotFound();
			}

			const isMember = await fastify.db
				.select()
				.from(members)
				.where(
					and(
						eq(members.organizationId, organization.id),
						eq(members.userId, request.user!.id),
					),
				)
				.then(([res]) => !!res);

			if (!isMember) {
				return reply.forbidden();
			}

			const [subscription] = await fastify.db
				.select()
				.from(subscriptions)
				.where(eq(subscriptions.organization, organization.id))
				.orderBy(desc(subscriptions.createdAt))
				.limit(1);

			if (!subscription) {
				return reply.callNotFound();
			}

			await fastify.payment.delete(`/subscriptions/${subscription.pagarmeId}`);

			await fastify.db
				.update(subscriptions)
				.set({ disabledAt: sql`NOW()` })
				.where(eq(subscriptions.id, subscription.id));

			return reply.status(204).send();
		},
	);
}
