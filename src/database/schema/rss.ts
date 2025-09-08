import { createId } from "@paralleldrive/cuid2";
import {
	pgTable,
	text,
	varchar,
	boolean,
	timestamp,
	index,
} from "drizzle-orm/pg-core";
import { isNull } from "drizzle-orm";
import { personas } from "./personas";
import { users } from "./auth";

export const rssFeeds = pgTable(
	"rss_feeds",
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
		triggerId: varchar(),
		createdBy: text()
			.notNull()
			.references(() => users.id, { onDelete: "set null" }),
		disabledBy: text().references(() => users.id, { onDelete: "set null" }),
		createdAt: timestamp().defaultNow(),
		disabledAt: timestamp(),
	},
	(table) => ({
		rssFeedPersonaIdx: index()
			.on(table.persona)
			.where(isNull(table.disabledAt)),
	}),
);
