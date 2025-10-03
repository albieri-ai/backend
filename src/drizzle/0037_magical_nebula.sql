CREATE TABLE "help_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"message" text NOT NULL,
	"original_message" text NOT NULL,
	"thread" text NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "human_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"message" text NOT NULL,
	"author" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "help_requests" ADD CONSTRAINT "help_requests_thread_threads_id_fk" FOREIGN KEY ("thread") REFERENCES "public"."threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_responses" ADD CONSTRAINT "human_responses_author_users_id_fk" FOREIGN KEY ("author") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;