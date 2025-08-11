import type { FastifyInstance, FastifyServerOptions } from "fastify";
import { and, countDistinct, eq, count, gte, lt } from "drizzle-orm";
import { threads, userMessages } from "../../../../../database/schema";
import _ from "lodash";
import { adminOnly } from "../../../../../lib/adminOnly";
import { z } from "zod";
import { subMilliseconds, differenceInMilliseconds } from "date-fns";

export const StatisticsQueryParams = z.object({
	from: z.coerce.date(),
	to: z.coerce.date(),
});

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	const getActiveMembersOverral = async (
		persona: string,
		{ from, to }: { from: Date; to: Date },
	) => {
		const [{ count }] = await fastify.db
			.select({ count: countDistinct(userMessages.author) })
			.from(userMessages)
			.where(
				and(
					eq(userMessages.persona, persona),
					gte(userMessages.date, from),
					lt(userMessages.date, to),
				),
			);

		return count;
	};

	const getMessageCountOverral = async (
		persona: string,
		{ from, to }: { from: Date; to: Date },
	) => {
		const [{ count: messageCount }] = await fastify.db
			.select({ count: count().as("count") })
			.from(userMessages)
			.where(
				and(
					eq(userMessages.persona, persona),
					gte(userMessages.date, from),
					lt(userMessages.date, to),
				),
			);

		return messageCount;
	};

	const getNewThreadsOverral = async (
		persona: string,
		{ from, to }: { from: Date; to: Date },
	) => {
		const [{ count: threadCount }] = await fastify.db
			.select({ count: count().as("count") })
			.from(threads)
			.where(
				and(
					eq(threads.persona, persona),
					gte(threads.createdAt, from),
					lt(threads.createdAt, to),
				),
			);

		return threadCount;
	};

	const getMessagesPerUserOverral = async (
		persona: string,
		{ from, to }: { from: Date; to: Date },
	) => {
		const usersMessageCount = await fastify.db
			.select({ author: userMessages.author, count: count().as("count") })
			.from(userMessages)
			.where(
				and(
					eq(userMessages.persona, persona),
					gte(userMessages.date, from),
					lt(userMessages.date, to),
				),
			)
			.groupBy(userMessages.author);

		if (!usersMessageCount.length) {
			return 0;
		}

		const messagesPerUser =
			_.sum(usersMessageCount.map((u) => u.count)) / usersMessageCount.length;

		return messagesPerUser;
	};

	fastify.get<{
		Params: { slug: string };
		Querystring: z.infer<typeof StatisticsQueryParams>;
	}>(
		"/active-users",
		{
			schema: {
				params: z.object({ slug: z.string() }),
				querystring: StatisticsQueryParams,
			},
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			const count = await getActiveMembersOverral(request.persona!.id, {
				from: request.query.from,
				to: request.query.to,
			});

			const previousPeriodStart = subMilliseconds(
				request.query.from,
				Math.abs(
					differenceInMilliseconds(request.query.from, request.query.to),
				),
			);

			const previousCount = await getActiveMembersOverral(request.persona!.id, {
				from: previousPeriodStart,
				to: request.query.from,
			});

			return reply.send({
				data: {
					activeUsers: count,
					change: previousCount ? count / previousCount - 1 : 0,
				},
			});
		},
	);

	fastify.get<{
		Params: { slug: string };
		Querystring: z.infer<typeof StatisticsQueryParams>;
	}>(
		"/message-count",
		{
			schema: {
				params: z.object({ slug: z.string() }),
				querystring: StatisticsQueryParams,
			},
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			const messageCount = await getMessageCountOverral(request.persona!.id, {
				from: request.query.from,
				to: request.query.to,
			});

			const previousPeriodStart = subMilliseconds(
				request.query.from,
				Math.abs(
					differenceInMilliseconds(request.query.from, request.query.to),
				),
			);

			const previousCount = await getMessageCountOverral(request.persona!.id, {
				from: previousPeriodStart,
				to: request.query.from,
			});

			return reply.send({
				data: {
					messageCount,
					change: previousCount ? messageCount / previousCount - 1 : 0,
				},
			});
		},
	);

	fastify.get<{
		Params: { slug: string };
		Querystring: z.infer<typeof StatisticsQueryParams>;
	}>(
		"/new-threads",
		{
			schema: {
				params: z.object({ slug: z.string() }),
				querystring: StatisticsQueryParams,
			},
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			const threadCount = await getNewThreadsOverral(request.persona!.id, {
				from: request.query.from,
				to: request.query.to,
			});

			const previousPeriodStart = subMilliseconds(
				request.query.from,
				Math.abs(
					differenceInMilliseconds(request.query.from, request.query.to),
				),
			);

			const previousCount = await getNewThreadsOverral(request.persona!.id, {
				from: previousPeriodStart,
				to: request.query.from,
			});

			return reply.send({
				data: {
					threads: threadCount,
					change: previousCount ? threadCount / previousCount - 1 : 0,
				},
			});
		},
	);

	fastify.get<{
		Params: { slug: string };
		Querystring: z.infer<typeof StatisticsQueryParams>;
	}>(
		"/messages-per-user",
		{
			schema: {
				params: z.object({ slug: z.string() }),
				querystring: StatisticsQueryParams,
			},
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			const messagesPerUser = await getMessagesPerUserOverral(
				request.persona!.id,
				{
					from: request.query.from,
					to: request.query.to,
				},
			);

			const previousPeriodStart = subMilliseconds(
				request.query.from,
				Math.abs(
					differenceInMilliseconds(request.query.from, request.query.to),
				),
			);

			const previousCount = await getMessagesPerUserOverral(
				request.persona!.id,
				{
					from: previousPeriodStart,
					to: request.query.from,
				},
			);

			return reply.send({
				data: {
					messagesPerUser,
					change: previousCount ? messagesPerUser / previousCount - 1 : 0,
				},
			});
		},
	);
}
