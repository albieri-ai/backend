import {
	pgTable,
	text,
	varchar,
	timestamp,
	serial,
	integer,
	index,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { files } from "./storage";
import { relations } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

export const topics = pgTable("topics", {
	id: serial().primaryKey(),
	name: varchar().notNull(),
	icon: varchar().notNull(),
	disabledAt: timestamp(),
});

export const personas = pgTable(
	"personas",
	{
		id: text()
			.primaryKey()
			.$default(() => createId()),
		organization: text()
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		name: varchar().notNull(),
		slug: varchar().notNull(),
		photo: text()
			.notNull()
			.references(() => files.id, { onDelete: "set null" }),
		title: text(),
		description: text(),
		objective: text(),

		createdBy: text()
			.notNull()
			.references(() => users.id, { onDelete: "set null" }),
		modifiedBy: text().references(() => users.id, { onDelete: "set null" }),
		deletedBy: text().references(() => users.id, { onDelete: "set null" }),

		createdAt: timestamp().defaultNow(),
		updatedAt: timestamp()
			.defaultNow()
			.$onUpdate(() => new Date()),
		deletedAt: timestamp(),
	},
	(table) => ({
		personaIdIdx: index().on(table.id),
		personaOrganizationIdx: uniqueIndex().on(table.organization),
		personaSlugIdx: uniqueIndex().on(table.slug),
	}),
);

export const personaTopics = pgTable(
	"persona_topics",
	{
		id: serial().primaryKey(),
		persona: varchar()
			.notNull()
			.references(() => personas.id, { onDelete: "cascade" }),
		topic: integer()
			.notNull()
			.references(() => topics.id, { onDelete: "cascade" }),
	},
	(table) => ({
		personaTopicsPersonaIdx: index().on(table.persona),
		personaTopicsPersonaTopicIdx: uniqueIndex().on(table.persona, table.topic),
	}),
);

export const personaProfileAttributes = pgTable(
	"persona_attributes",
	{
		id: serial().primaryKey(),
		persona: varchar()
			.notNull()
			.references(() => personas.id, { onDelete: "cascade" }),
		attribute: varchar().notNull(),
		value: text().notNull(),
	},
	(table) => ({
		personaProfileAttributesPersonaIdx: index().on(table.persona),
		personaProfileAttributesAttributeIdx: index().on(table.attribute),
		personaProfileAttributesPersonaAttributeIdx: uniqueIndex().on(
			table.persona,
			table.attribute,
		),
	}),
);

export const personaRelations = relations(personas, ({ one, many }) => ({
	photo: one(files, {
		fields: [personas.photo],
		references: [files.id],
	}),
	organization: one(organizations, {
		fields: [personas.organization],
		references: [organizations.id],
	}),
	topics: many(personaTopics),
}));

export const personaTopicsRelations = relations(personaTopics, ({ one }) => ({
	persona: one(personas, {
		fields: [personaTopics.persona],
		references: [personas.id],
	}),
	topic: one(topics, {
		fields: [personaTopics.topic],
		references: [topics.id],
	}),
}));
