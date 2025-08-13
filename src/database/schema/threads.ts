import {
	jsonb,
	pgTable,
	text,
	varchar,
	timestamp,
	index,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { personas } from "./personas";
import { desc, relations } from "drizzle-orm";
import type { Message } from "ai";
import { createId } from "@paralleldrive/cuid2";

export const threads = pgTable(
	"threads",
	{
		id: text()
			.primaryKey()
			.$default(() => createId()),
		persona: text()
			.notNull()
			.references(() => personas.id, { onDelete: "cascade" }),
		title: text().notNull(),
		author: text()
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		messages: jsonb().notNull().$type<Message[]>(),
		model: varchar().notNull(),

		deletedBy: varchar().references(() => users.id),

		createdAt: timestamp().notNull().defaultNow(),
		updatedAt: timestamp()
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
		deletedAt: timestamp(),
	},
	(table) => ({
		threadPersonaAuthorIdx: index("thread_persona_author_idx").on(
			table.persona,
			table.author,
			desc(table.createdAt),
			table.deletedAt,
		),
	}),
);

export const threadRelations = relations(threads, ({ one }) => ({
	author: one(users, {
		fields: [threads.author],
		references: [users.id],
	}),
	persona: one(personas, {
		fields: [threads.persona],
		references: [personas.id],
	}),
}));
