import { pgView, timestamp, text } from "drizzle-orm/pg-core";

export const userMessages = pgView("user_messages", {
	author: text(),
	persona: text(),
	date: timestamp(),
}).existing();
