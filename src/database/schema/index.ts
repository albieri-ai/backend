import { pgTable, serial } from "drizzle-orm/pg-core";

export const AccountsTable = pgTable("accounts", {
  id: serial().primaryKey(),
});
