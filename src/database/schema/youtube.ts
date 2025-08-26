import {
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
	varchar,
	boolean,
} from "drizzle-orm/pg-core";
import { personas } from "./personas";
import { users } from "./auth";
import { createId } from "@paralleldrive/cuid2";

export const youtubeChannels = pgTable(
	"youtube_channels",
	{
		id: text()
			.primaryKey()
			.$default(() => createId()),
		persona: text()
			.notNull()
			.references(() => personas.id, { onDelete: "cascade" }),
		url: text().notNull(),
		keepSynced: boolean().notNull().default(false),
		name: text(),
		thumbnailUrl: text(),
		triggerId: varchar(),
		createdBy: text()
			.notNull()
			.references(() => users.id, { onDelete: "set null" }),
		disabledBy: text().references(() => users.id, { onDelete: "set null" }),
		createdAt: timestamp().defaultNow(),
		disabledAt: timestamp(),
	},
	(table) => ({
		youtubeChannelsPersonaIdx: uniqueIndex().on(table.persona),
	}),
);

export const youtubeChannelsVideos = pgTable(
	"youtube_channels_videos",
	{
		id: serial().primaryKey(),
		channel: text()
			.notNull()
			.references(() => youtubeChannels.id, { onDelete: "cascade" }),
		videoId: varchar().notNull(),
		title: text(),
		publishedAt: timestamp(),
	},
	(table) => ({
		youtubeChannelsVideoIdIdx: uniqueIndex().on(table.channel, table.videoId),
	}),
);
