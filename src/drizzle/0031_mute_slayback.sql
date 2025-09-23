CREATE TABLE "thread_shared_ids" (
	"id" text PRIMARY KEY NOT NULL,
	"thread" text NOT NULL,
	"disabled_at" timestamp,
	CONSTRAINT "thread_shared_ids_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "thread_shared_ids" ADD CONSTRAINT "thread_shared_ids_thread_threads_id_fk" FOREIGN KEY ("thread") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "thread_shared_ids_id_index" ON "thread_shared_ids" USING btree ("id");--> statement-breakpoint
CREATE UNIQUE INDEX "thread_shared_ids_thread_index" ON "thread_shared_ids" USING btree ("thread") WHERE "thread_shared_ids"."disabled_at" is null;