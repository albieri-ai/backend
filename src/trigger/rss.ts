import { schedules, task } from "@trigger.dev/sdk";
import Parser from "rss-parser";
import { createDb } from "../database/db";
import { and, eq, inArray } from "drizzle-orm";
import { rssFeedAssets, rssFeeds, trainingAssets } from "../database/schema";
import { IngestAudioFile } from "./ingest";

export const ParseRssFeed = task({
	id: "parse-rss-feed",
	run: async ({ feedId, url }: { feedId: string; url: string }) => {
		const parser = new Parser();

		const feed = await parser.parseURL(url);

		const name = feed.title;

		const audioUrls = feed.items
			.map((item) => ({
				id: item.guid,
				title: item.title || "Título não disponível",
				url: item.enclosure && item.enclosure.url,
			}))
			.filter(({ id, url }) => id && url) as {
			id: string;
			url: string;
			title: string;
		}[];

		const { db } = await createDb({
			connectionString: process.env.DATABASE_URL!,
		});

		const dbFeed = await db
			.update(rssFeeds)
			.set({ name })
			.where(eq(rssFeeds.id, feedId))
			.returning()
			.then(([res]) => res);

		const audioGuids = audioUrls.map((au) => au.id);

		const existingItems = (await db
			.select({ id: rssFeedAssets.rssGuid })
			.from(trainingAssets)
			.leftJoin(rssFeedAssets, eq(rssFeedAssets.asset, trainingAssets.id))
			.where(
				and(
					eq(trainingAssets.persona, dbFeed.persona),
					inArray(rssFeedAssets.rssGuid, audioGuids),
				),
			)) as { id: string }[];

		const existingItemsMap = existingItems.reduce<Record<string, boolean>>(
			(acc, item) => {
				acc[item.id] = true;

				return acc;
			},
			{},
		);

		const newItems = audioUrls.filter((au) => !existingItemsMap[au.id]);

		const newAssets = await db.transaction(async (trx) => {
			const newTrainingAssets = newItems.map(() => ({
				type: "rss_feed" as const,
				status: "pending" as const,
				enabled: true as const,
				persona: dbFeed.persona,
				createdBy: dbFeed.createdBy,
			}));

			const assets = await trx
				.insert(trainingAssets)
				.values(newTrainingAssets)
				.returning({ id: trainingAssets.id });

			const newRssFeedAssets = newItems.map((item, index) => ({
				feed: dbFeed.id,
				asset: assets[index].id,
				rssGuid: item.id,
				title: item.title,
			})) as { feed: string; asset: string; rssGuid: string; title: string }[];

			return trx.insert(rssFeedAssets).values(newRssFeedAssets).returning({
				asset: rssFeedAssets.asset,
				rssId: rssFeedAssets.rssGuid,
			});
		});

		const audioUrlsMap = Object.fromEntries(
			audioUrls.map((item) => [item.id, item.url]),
		);

		let index = 0;

		while (index <= newAssets.length) {
			const assetSlice = newAssets.slice(0, 500);

			if (!assetSlice.length) {
				break;
			}

			await IngestAudioFile.batchTrigger(
				assetSlice.map((ast) => ({
					payload: {
						assetID: ast.asset,
						url: audioUrlsMap[ast.rssId],
					},
				})),
			);

			index += 500;
		}
	},
});

export const MonitorRssFeed = schedules.task({
	id: "monitor-rss-feed",
	run: async (payload) => {
		if (!payload.externalId) {
			throw new Error("invalid schedule");
		}

		const { db } = await createDb({
			connectionString: process.env.DATABASE_URL!,
		});

		const feed = await db.query.rssFeeds.findFirst({
			where: (rs, { eq, and, isNull }) =>
				and(eq(rs.id, payload.externalId!), isNull(rs.disabledBy)),
		});

		if (!feed) {
			throw new Error("rss feed not found");
		}

		await ParseRssFeed.trigger({
			feedId: feed.id,
			url: feed.url,
		});
	},
});
