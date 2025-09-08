import {
	pgEnum,
	pgTable,
	text,
	boolean,
	varchar,
	timestamp,
	serial,
	vector,
	integer,
	index,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { personas } from "./personas";
import { users } from "./auth";
import { files } from "./storage";
import { youtubeChannelsVideos } from "./youtube";
import { createId } from "@paralleldrive/cuid2";
import { hotmartCourseLessons } from "./hotmart";
import { vimeoAccounts } from "./vimeo";
import { rssFeeds } from "./rss";
import { isNull } from "drizzle-orm";

export const TrainingAssetType = pgEnum("training_asset_type", [
	"file",
	"video_file",
	"youtube_video",
	"webpage",
	"hotmart",
	"vimeo_file",
	"rss_feed",
]);

export const TrainingAssetStatus = pgEnum("training_asset_status", [
	"pending",
	"error",
	"ready",
]);

export const trainingAssets = pgTable(
	"training_assets",
	{
		id: text()
			.primaryKey()
			.$default(() => createId()),
		type: TrainingAssetType("asset_type").notNull(),
		status: TrainingAssetStatus("status").notNull().default("pending"),
		enabled: boolean().notNull().default(false),
		persona: varchar().references(() => personas.id, { onDelete: "cascade" }),
		createdBy: text()
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		createdAt: timestamp().defaultNow(),

		deletedBy: text().references(() => users.id, { onDelete: "cascade" }),
		deletedAt: timestamp(),
	},
	(table) => ({
		trainigAssetsPersonaIdx: index()
			.on(table.persona, table.enabled)
			.where(isNull(table.deletedAt)),
	}),
);

export const youtubeVideoAssets = pgTable(
	"youtube_video_assets",
	{
		id: serial().primaryKey(),
		asset: text()
			.notNull()
			.references(() => trainingAssets.id, { onDelete: "cascade" }),
		url: text().notNull(),
		videoId: text().notNull(),
		title: text().default("Título não disponível").notNull(),
		channelVideo: integer().references(() => youtubeChannelsVideos.id, {
			onDelete: "set null",
		}),
	},
	(table) => ({
		youtubeVideoAssetsAssetIdx: index().on(table.asset),
	}),
);

export const vimeoVideoAssets = pgTable(
	"vimeo_video_assets",
	{
		id: serial().primaryKey(),
		asset: text()
			.notNull()
			.references(() => trainingAssets.id, { onDelete: "cascade" }),
		title: text().default("Título não disponível").notNull(),
		vimeoId: text().notNull(),
		vimeoAccount: text()
			.notNull()
			.references(() => vimeoAccounts.id, { onDelete: "cascade" }),
	},
	(table) => ({
		vimeoVideoAssetAssetIdx: uniqueIndex().on(table.asset),
		vimeoVideoAccountIdIdx: index().on(table.vimeoAccount),
	}),
);

export const rssFeedAssets = pgTable(
	"rss_feed_assets",
	{
		id: serial().primaryKey(),
		feed: text()
			.notNull()
			.references(() => rssFeeds.id, { onDelete: "cascade" }),
		asset: text()
			.notNull()
			.references(() => trainingAssets.id, { onDelete: "cascade" }),
		title: text().notNull(),
		rssGuid: text().notNull(),
	},
	(table) => ({
		rssFeedAssetsFeedIdx: index().on(table.feed),
		rssFeedAssetsAssetIdx: index().on(table.asset),
	}),
);

export const hotmartVideoAssets = pgTable(
	"hotmart_video_assets",
	{
		id: serial().primaryKey(),
		asset: text()
			.notNull()
			.references(() => trainingAssets.id, { onDelete: "cascade" }),
		lesson: text().references(() => hotmartCourseLessons.id, {
			onDelete: "cascade",
		}),
		hotmartId: text().notNull(),
		name: text().notNull(),
	},
	(table) => ({
		hotmartVideoAssetsAssetIdx: index().on(table.asset),
		hotmartVideoAssetsLessonIdx: uniqueIndex().on(
			table.lesson,
			table.hotmartId,
		),
	}),
);

export const fileAssets = pgTable(
	"file_assets",
	{
		id: serial().primaryKey(),
		asset: text()
			.notNull()
			.references(() => trainingAssets.id, { onDelete: "cascade" }),
		fileId: text()
			.references(() => files.id, { onDelete: "cascade" })
			.unique(),
	},
	(table) => ({
		fileAssetsAssetIdx: index().on(table.asset),
		fileAssetsFileIdIdx: uniqueIndex().on(table.fileId),
	}),
);

export const webPageAssets = pgTable(
	"web_page_assets",
	{
		id: serial().primaryKey(),
		asset: text()
			.notNull()
			.references(() => trainingAssets.id, { onDelete: "cascade" }),
		title: text().notNull(),
		url: text().notNull(),
	},
	(table) => ({
		webPageAssetsAssetIdx: index().on(table.asset),
	}),
);

export const assetSummary = pgTable(
	"asset_summary",
	{
		id: serial().primaryKey(),
		asset: text()
			.notNull()
			.references(() => trainingAssets.id, { onDelete: "cascade" }),
		version: integer().notNull(),
		summary: text().notNull(),
		embeddings: vector({ dimensions: 1536 }).notNull(),
		createdAt: timestamp().defaultNow(),
	},
	(table) => ({
		assetSummaryAssetIdx: index().on(table.asset),
	}),
);

export const assetChunks = pgTable(
	"asset_chunks",
	{
		id: serial().primaryKey(),
		asset: text()
			.notNull()
			.references(() => trainingAssets.id, { onDelete: "cascade" }),
		text: text().notNull(),
		embeddings: vector({ dimensions: 1536 }).notNull(),
		createdAt: timestamp().defaultNow(),
	},
	(table) => ({
		assetChunksAssetIdx: index().on(table.asset),
	}),
);
