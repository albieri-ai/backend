import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { generateId } from "better-auth";
import { organizations } from "./auth";

export const plans = pgTable("plans", {
	id: serial().primaryKey(),
});

export const subscriptions = pgTable("subscriptions", {
	id: text()
		.primaryKey()
		.$default(() => generateId()),
	organization: text()
		.notNull()
		.references(() => organizations.id, { onDelete: "cascade" }),
	pagarmeId: text().notNull(),
	createdAt: timestamp().defaultNow(),
	disabledAt: timestamp(),
});
