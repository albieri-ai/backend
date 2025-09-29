import type { FastifyInstance, FastifyServerOptions } from "fastify";
import {
	rssFeedAssetCount,
	rssFeedAssets,
	rssFeeds,
	trainingAssets,
} from "../../../../../../database/schema";
import { and, isNull, eq, sql, inArray, getTableColumns } from "drizzle-orm";
import { z } from "zod";
import { ParseRssFeed, MonitorRssFeed } from "../../../../../../trigger/rss";
import { schedules } from "@trigger.dev/sdk";
import { adminOnly } from "../../../../../../lib/adminOnly";
import Parser from "rss-parser";

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	fastify.get<{ Params: { slug: string } }>(
		"/",
		{
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			const feeds = await fastify.db
				.select({
					...getTableColumns(rssFeeds),
					assetCount: sql`COALESCE(${rssFeedAssetCount.count}, 0)::INTEGER`.as(
						"asset_count",
					),
				})
				.from(rssFeeds)
				.leftJoin(rssFeedAssetCount, eq(rssFeedAssetCount.channel, rssFeeds.id))
				.where(
					and(
						eq(rssFeeds.persona, request.persona!.id),
						isNull(rssFeeds.disabledAt),
					),
				);

			return reply.send({ data: feeds });
		},
	);

	fastify.post<{
		Params: { slug: string };
		Body: { url: string; keepSynced: boolean };
	}>(
		"/",
		{
			schema: {
				params: z.object({
					slug: z.string(),
				}),
				body: z.object({
					url: z.string(),
					keepSynced: z.boolean(),
				}),
			},
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			const { persona } = request;

			if (!persona) {
				return reply.callNotFound();
			}

			const parser = new Parser();

			const feed = await parser.parseURL(request.body.url);

			const insertedFeed = await fastify.db.transaction(async (trx) => {
				const insertedFeed = await trx
					.insert(rssFeeds)
					.values({
						persona: persona.id,
						url: request.body.url,
						keepSynced: request.body.keepSynced,
						name: feed.title,
						createdBy: request.user!.id,
					})
					.returning()
					.then(([r]) => r);

				await ParseRssFeed.trigger({
					feedId: insertedFeed.id,
					url: request.body.url,
				});

				if (request.body.keepSynced) {
					const schedule = await schedules.create({
						task: MonitorRssFeed.id,
						externalId: insertedFeed.id,
						cron: "0 */5 * * *",
						timezone: "America/Sao_Paulo",
						deduplicationKey: `monitor-rss-feed-${persona.id}-${insertedFeed.id}`,
					});

					await trx
						.update(rssFeeds)
						.set({
							triggerId: schedule.id,
						})
						.where(eq(rssFeeds.id, insertedFeed.id));
				}

				return insertedFeed;
			});

			reply.send({ data: insertedFeed });
		},
	);

	fastify.patch<{
		Params: {
			slug: string;
			accountId: string;
		};
		Body: {
			keepSynced: boolean;
		};
	}>(
		"/:accountId",
		{
			schema: {
				params: z.object({
					slug: z.string(),
					accountId: z.string(),
				}),
				body: z.object({
					keepSynced: z.boolean(),
				}),
			},
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			if (!request.user) {
				return reply.unauthorized();
			}

			const [oldFeed] = await fastify.db
				.select()
				.from(rssFeeds)
				.where(
					and(
						eq(rssFeeds.id, request.params.accountId),
						eq(rssFeeds.persona, request.persona!.id),
						isNull(rssFeeds.disabledAt),
					),
				);

			const [updatedFeed] = await fastify.db
				.update(rssFeeds)
				.set({
					...request.body,
				})
				.where(
					and(
						eq(rssFeeds.id, request.params.accountId),
						eq(rssFeeds.persona, request.persona!.id),
						isNull(rssFeeds.disabledAt),
					),
				)
				.returning();

			if (!updatedFeed) {
				return reply.callNotFound();
			}

			if (updatedFeed.keepSynced && !oldFeed.keepSynced) {
				if (updatedFeed.triggerId) {
					await schedules.activate(updatedFeed.triggerId);
				} else {
					const schedule = await schedules.create({
						task: MonitorRssFeed.id,
						externalId: updatedFeed.id,
						cron: "0 */5 * * *",
						timezone: "America/Sao_Paulo",
						deduplicationKey: `monitor-youtube-channel-${request.persona!.id}-${updatedFeed.id}`,
					});

					await fastify.db
						.update(rssFeeds)
						.set({
							triggerId: schedule.id,
						})
						.where(eq(rssFeeds.id, updatedFeed.id));
				}
			} else if (!updatedFeed.keepSynced && oldFeed.keepSynced) {
				if (updatedFeed.triggerId) {
					await schedules.deactivate(updatedFeed.triggerId).catch(() => null);
				}
			}

			return reply.status(204).send();
		},
	);

	fastify.delete<{
		Params: {
			slug: string;
			accountId: string;
		};
		Querystring: {
			remove_content: boolean;
		};
	}>(
		"/:accountId",
		{
			schema: {
				params: z.object({
					slug: z.string(),
					accountId: z.string(),
				}),
				querystring: z.object({
					remove_content: z.coerce.boolean().default(false),
				}),
			},
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			if (!request.user) {
				return reply.unauthorized();
			}

			const { persona } = request;

			if (!persona) {
				return reply.status(404).send({ error: "Persona not found" });
			}

			await fastify.db.transaction(async (trx) => {
				const channel = await trx
					.select()
					.from(rssFeeds)
					.where(eq(rssFeeds.id, request.params.accountId))
					.then(([res]) => res);

				await trx
					.update(rssFeeds)
					.set({
						disabledBy: request.user!.id,
						disabledAt: sql`NOW()`,
					})
					.where(
						and(
							eq(rssFeeds.id, request.params.accountId),
							eq(rssFeeds.persona, persona.id),
							isNull(rssFeeds.disabledAt),
						),
					);

				if (channel.triggerId) {
					await schedules.deactivate(channel.triggerId).catch(() => null);
				}

				if (request.query.remove_content) {
					await trx
						.update(trainingAssets)
						.set({ deletedAt: sql`NOW()`, deletedBy: request.user!.id })
						.where(
							and(
								isNull(trainingAssets.deletedAt),
								inArray(
									trainingAssets.id,
									trx
										.select({ id: rssFeedAssets.asset })
										.from(rssFeedAssets)
										.where(eq(rssFeedAssets.feed, request.params.accountId)),
								),
							),
						);
				}
			});

			return reply.status(204).send();
		},
	);
}
