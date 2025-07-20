import {
  text,
  pgTable,
  varchar,
  timestamp,
  pgEnum,
  integer,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { generateId } from "better-auth";

const Storages = pgEnum("storages", ["aws"]);
const FileStatus = pgEnum("file_status", ["pending", "ready"]);
const FileVisibility = pgEnum("file_visibility", ["public", "private"]);

export const files = pgTable("files", {
  id: text()
    .primaryKey()
    .$default(() => generateId()),
  name: varchar().notNull(),
  originalName: varchar().notNull(),
  mimeType: varchar().notNull(),
  storage: Storages().default("aws"),
  bucket: varchar().notNull(),
  visibility: FileVisibility().default("private"),
  status: FileStatus().default("pending"),
  size: integer(),
  checksum: text(),
  createdBy: text()
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp().defaultNow(),
});
