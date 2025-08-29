import { createId } from "@paralleldrive/cuid2";
import { pgTable, text } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const merchantAccounts = pgTable("merchant_accounts", {
	id: text()
		.primaryKey()
		.$default(() => createId()),
	stripeId: text().notNull(),
	user: text()
		.notNull()
		.references(() => users.id, { onDelete: "cascade" })
		.unique(),
});
