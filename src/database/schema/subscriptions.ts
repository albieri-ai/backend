import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { createId } from "@paralleldrive/cuid2";

export const plans = pgTable("plans", {
	id: serial().primaryKey(),
});

export const subscriptions = pgTable("subscriptions", {
	id: text()
		.primaryKey()
		.$default(() => createId()),
	organization: text()
		.notNull()
		.references(() => organizations.id, { onDelete: "cascade" }),
	pagarmeId: text().notNull(),
	createdAt: timestamp().defaultNow(),
	disabledAt: timestamp(),
});
