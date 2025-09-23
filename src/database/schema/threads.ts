import {
	jsonb,
	pgTable,
	text,
	varchar,
	timestamp,
	index,
	pgEnum,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { personas } from "./personas";
import { desc, relations, isNull } from "drizzle-orm";
import type { UIMessage } from "ai";
import { createId } from "@paralleldrive/cuid2";

export const ThreadVisibility = pgEnum("thread_visibility", [
	"public",
	"private",
]);

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

		messages: jsonb().notNull().$type<UIMessage[]>(),
		model: varchar().notNull(),
		visibility: ThreadVisibility().notNull().default("private"),

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

export const threadShareIds = pgTable(
	"thread_shared_ids",
	{
		id: text()
			.primaryKey()
			.unique()
			.$default(() => createId()),
		thread: text()
			.notNull()
			.references(() => threads.id, { onDelete: "cascade" }),
		lastMessage: text(),
		disabledAt: timestamp(),
	},
	(table) => ({
		threadShareIdsIdx: uniqueIndex().on(table.id),
		threadShareIdsThreadIdx: uniqueIndex()
			.on(table.thread)
			.where(isNull(table.disabledAt)),
	}),
);

export const threadRelations = relations(threads, ({ one, many }) => ({
	author: one(users, {
		fields: [threads.author],
		references: [users.id],
	}),
	persona: one(personas, {
		fields: [threads.persona],
		references: [personas.id],
	}),
	shareIds: many(threadShareIds),
}));

export const threadShareIdsRelations = relations(threadShareIds, ({ one }) => ({
	thread: one(threads, {
		fields: [threadShareIds.thread],
		references: [threads.id],
	}),
}));
