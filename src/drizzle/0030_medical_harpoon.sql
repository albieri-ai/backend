CREATE TYPE "public"."thread_visibility" AS ENUM('public', 'private');--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "visibility" "thread_visibility" DEFAULT 'private' NOT NULL;