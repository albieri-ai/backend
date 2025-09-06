import { createId } from "@paralleldrive/cuid2";
import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { personas } from "./personas";
import { users } from "./auth";

export const vimeoAccounts = pgTable(
	"vimeo_accounts",
	{
		id: text()
			.primaryKey()
			.$default(() => createId()),
		persona: text()
			.notNull()
			.references(() => personas.id, { onDelete: "cascade" }),

		code: text(),
		state: text().notNull(),
		token: text(),

		createdBy: text()
			.notNull()
			.references(() => users.id, { onDelete: "set null" }),
		disabledBy: text().references(() => users.id, { onDelete: "set null" }),
		createdAt: timestamp().defaultNow(),
		disabledAt: timestamp(),
	},
	(table) => ({
		vimeoAccountsPersonaIdx: uniqueIndex().on(table.persona),
	}),
);
