import type { FastifyInstance, FastifyServerOptions } from "fastify";
import { z } from "zod";
import { and, count, countDistinct, eq, gte, lt, sql } from "drizzle-orm";
import { userMessages, threads } from "../../../../database/schema";
import { adminOnly } from "../../../../lib/adminOnly";
import { StatisticsQueryParams } from "./overral";

const TimeseriesStatisticsQueryParams = StatisticsQueryParams.extend({
	interval: z.enum(["hour", "day", "week", "month"]),
});

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	fastify.get<{
		Params: { slug: string };
		Querystring: z.infer<typeof TimeseriesStatisticsQueryParams>;
	}>(
		"/active-users/timeseries",
		{
			schema: {
				params: z.object({ slug: z.string() }),
				querystring: TimeseriesStatisticsQueryParams,
			},
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			const hours = fastify.db.$with("hours").as(
				fastify.db
					.select({
						date: sql`generate_series`.as("date"),
					})
					.from(
						sql`generate_series(DATE_TRUNC(${request.query.interval}::TEXT, ${request.query.from}::TIMESTAMP), DATE_TRUNC(${request.query.interval}::TEXT, ${request.query.to}::TIMESTAMP) + ${"1 " + request.query.interval}::INTERVAL, ${"1 " + request.query.interval}::INTERVAL)`,
					),
			);

			const personaUserMessages = fastify.db.$with("persona_user_messages").as(
				fastify.db
					.select({
						author: userMessages.author,
						date: sql`DATE_TRUNC(${request.query.interval}::TEXT, ${userMessages.date}::TIMESTAMP)`.as(
							"trunc_date",
						),
					})
					.from(userMessages)
					.where(eq(userMessages.persona, request.persona!.id)),
			);

			const timeseries = await fastify.db
				.with(hours, personaUserMessages)
				.select({
					date: hours.date,
					count: countDistinct(personaUserMessages.author).as("count"),
				})
				.from(hours)
				.leftJoin(personaUserMessages, eq(hours.date, personaUserMessages.date))
				.where(
					and(
						gte(sql`${hours.date}::TIMESTAMP`, request.query.from),
						lt(sql`${hours.date}::TIMESTAMP`, request.query.to),
					),
				)
				.groupBy(hours.date);

			return reply.send({ data: timeseries });
		},
	);

	fastify.get<{
		Params: { slug: string };
		Querystring: z.infer<typeof TimeseriesStatisticsQueryParams>;
	}>(
		"/message-count/timeseries",
		{
			schema: {
				params: z.object({ slug: z.string() }),
				querystring: TimeseriesStatisticsQueryParams,
			},
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			const hours = fastify.db.$with("hours").as(
				fastify.db
					.select({
						date: sql`generate_series`.as("date"),
					})
					.from(
						sql`generate_series(DATE_TRUNC(${request.query.interval}::TEXT, ${new Date(request.query.from)}::TIMESTAMP), DATE_TRUNC(${request.query.interval}::TEXT, ${new Date(request.query.to)}::TIMESTAMP) + ${"1 " + request.query.interval}::INTERVAL, ${"1 " + request.query.interval}::INTERVAL)`,
					),
			);

			const personaUserMessages = fastify.db.$with("persona_user_messages").as(
				fastify.db
					.select({
						author: userMessages.author,
						date: sql`DATE_TRUNC(${request.query.interval}::TEXT, ${userMessages.date}::TIMESTAMP)`.as(
							"trunc_date",
						),
					})
					.from(userMessages)
					.where(eq(userMessages.persona, request.persona!.id)),
			);

			const timeseries = await fastify.db
				.with(hours, personaUserMessages)
				.select({
					date: hours.date,
					count: count(personaUserMessages.author).as("count"),
				})
				.from(hours)
				.leftJoin(personaUserMessages, eq(personaUserMessages.date, hours.date))
				.where(
					and(
						gte(sql`${hours.date}::TIMESTAMP`, request.query.from),
						lt(sql`${hours.date}::TIMESTAMP`, request.query.to),
					),
				)
				.groupBy(hours.date);

			return reply.send({ data: timeseries });
		},
	);

	fastify.get<{
		Params: { slug: string };
		Querystring: z.infer<typeof TimeseriesStatisticsQueryParams>;
	}>(
		"/new-threads/timeseries",
		{
			schema: {
				params: z.object({ slug: z.string() }),
				querystring: TimeseriesStatisticsQueryParams,
			},
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			const hours = fastify.db.$with("hours").as(
				fastify.db
					.select({
						date: sql`generate_series`.as("date"),
					})
					.from(
						sql`generate_series(DATE_TRUNC(${request.query.interval}::TEXT, ${new Date(request.query.from)}::TIMESTAMP), DATE_TRUNC(${request.query.interval}::TEXT, ${new Date(request.query.to)}::TIMESTAMP) + ${"1 " + request.query.interval}::INTERVAL, ${"1 " + request.query.interval}::INTERVAL)`,
					),
			);

			const personaThreads = fastify.db.$with("persona_threads").as(
				fastify.db
					.select({
						id: threads.id,
						createdAt:
							sql`DATE_TRUNC(${request.query.interval}::TEXT, ${threads.createdAt})`.as(
								"created_at",
							),
					})
					.from(threads)
					.where(eq(threads.persona, request.persona!.id)),
			);

			const timeseries = await fastify.db
				.with(hours, personaThreads)
				.select({
					date: hours.date,
					count: countDistinct(personaThreads.id).as("count"),
				})
				.from(hours)
				.leftJoin(personaThreads, eq(personaThreads.createdAt, hours.date))
				.where(
					and(
						gte(sql`${hours.date}::TIMESTAMP`, request.query.from),
						lt(sql`${hours.date}::TIMESTAMP`, request.query.to),
					),
				)
				.groupBy(hours.date);

			return reply.send({ data: timeseries });
		},
	);

	fastify.get<{
		Params: { slug: string };
		Querystring: z.infer<typeof TimeseriesStatisticsQueryParams>;
	}>(
		"/messages-per-user/timeseries",
		{
			schema: {
				params: z.object({ slug: z.string() }),
				querystring: TimeseriesStatisticsQueryParams,
			},
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			const hours = fastify.db.$with("hours").as(
				fastify.db
					.select({
						date: sql`generate_series`.as("date"),
					})
					.from(
						sql`generate_series(DATE_TRUNC(${request.query.interval}::TEXT, ${new Date(request.query.from)}::TIMESTAMP), DATE_TRUNC(${request.query.interval}::TEXT, ${new Date(request.query.to)}::TIMESTAMP) + ${"1 " + request.query.interval}::INTERVAL, ${"1 " + request.query.interval}::INTERVAL)`,
					),
			);

			const personaUserMessages = fastify.db.$with("persona_user_messages").as(
				fastify.db
					.select({
						author: userMessages.author,
						createdAt:
							sql`DATE_TRUNC(${request.query.interval}::TEXT, ${userMessages.date})`.as(
								"created_at",
							),
					})
					.from(userMessages)
					.where(eq(userMessages.persona, request.persona!.id)),
			);

			const partialTimeseries = fastify.db.$with("partial_timeseries").as(
				fastify.db
					.select({
						date: hours.date,
						users: countDistinct(personaUserMessages.author).as("users"),
						count: count().as("count"),
					})
					.from(hours)
					.leftJoin(
						personaUserMessages,
						eq(personaUserMessages.createdAt, hours.date),
					)
					.where(
						and(
							gte(sql`${hours.date}::TIMESTAMP`, request.query.from),
							lt(sql`${hours.date}::TIMESTAMP`, request.query.to),
						),
					)
					.groupBy(hours.date),
			);

			const timeseries = await fastify.db
				.with(hours, personaUserMessages, partialTimeseries)
				.select({
					date: partialTimeseries.date,
					count:
						sql`(CASE WHEN ${partialTimeseries.users} IS NULL OR ${partialTimeseries.users} = 0 THEN 0 ELSE ${partialTimeseries.count} / ${partialTimeseries.users} END)::INTEGER`.as(
							"count",
						),
				})
				.from(partialTimeseries);

			return reply.send({ data: timeseries });
		},
	);
}
