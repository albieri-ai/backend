import {
	pgTable,
	serial,
	text,
	uniqueIndex,
	timestamp,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";

export const stripeCustomerId = pgTable(
	"stripe_customer_id",
	{
		id: serial().primaryKey(),
		user: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		stripeId: text().notNull(),
	},
	(table) => ({
		stripeCustomerIdUserIdx: uniqueIndex().on(table.user),
	}),
);

export const subscriptions = pgTable("subscriptions", {
	id: serial().primaryKey(),
	owner: text().references(() => users.id, { onDelete: "cascade" }),
	organization: text().references(() => organizations.id, {
		onDelete: "set null",
	}),
	stripeId: text().notNull(),
	createdAt: timestamp("created_at"),
	endAt: timestamp("end_at"),
});
