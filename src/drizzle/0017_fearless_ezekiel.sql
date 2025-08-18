CREATE TYPE "public"."subscription_limit" AS ENUM('messages', 'words');--> statement-breakpoint
CREATE TABLE "subscription_limits" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscription" integer NOT NULL,
	"key" "subscription_limit" NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_usage_track_workflow" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscription" integer NOT NULL,
	"workflow_id" text NOT NULL,
	CONSTRAINT "subscription_usage_track_workflow_subscription_unique" UNIQUE("subscription"),
	CONSTRAINT "subscription_usage_track_workflow_workflowId_unique" UNIQUE("workflow_id")
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "owner" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_limits" ADD CONSTRAINT "subscription_limits_subscription_subscriptions_id_fk" FOREIGN KEY ("subscription") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_limits_subscription_key_index" ON "subscription_limits" USING btree ("subscription","key");