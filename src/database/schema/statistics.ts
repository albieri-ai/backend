import { pgView, timestamp, text, integer } from "drizzle-orm/pg-core";

export const userMessages = pgView("user_messages", {
	author: text(),
	persona: text(),
	date: timestamp(),
	thread: text(),
	message: text(),
	wordCount: integer(),
}).existing();
