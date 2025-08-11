import { pgTable, date } from "drizzle-orm/pg-core";

export const calendarDays = pgTable("calendar_days", {
	date: date().primaryKey(),
});
