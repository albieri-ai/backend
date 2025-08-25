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
} from "drizzle-orm/pg-core";
import { personas } from "./personas";
import { users } from "./auth";
import { files } from "./storage";
import { youtubeChannelsVideos } from "./youtube";
import { createId } from "@paralleldrive/cuid2";

export const TrainingAssetType = pgEnum("training_asset_type", [
	"file",
	"video_file",
	"youtube_video",
	"webpage",
	"hotmart",
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
		trainigAssetsPersonaIdx: index().on(table.persona, table.enabled),
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
