CREATE TABLE "subscription_plan_limits" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan" integer NOT NULL,
	"key" "subscription_limit" NOT NULL,
	"value" integer NOT NULL,
	"stripe_id" text NOT NULL,
	"stripe_meter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"stripe_id" text NOT NULL,
	"stripe_product_id" text NOT NULL,
	CONSTRAINT "subscription_plans_stripeId_unique" UNIQUE("stripe_id")
);
--> statement-breakpoint
ALTER TABLE "subscription_limits" ADD COLUMN "limit" integer;--> statement-breakpoint
ALTER TABLE "training_assets" ADD COLUMN "word_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_plan_limits" ADD CONSTRAINT "subscription_plan_limits_plan_subscription_plans_id_fk" FOREIGN KEY ("plan") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_limits" ADD CONSTRAINT "subscription_limits_limit_subscription_plan_limits_id_fk" FOREIGN KEY ("limit") REFERENCES "public"."subscription_plan_limits"("id") ON DELETE cascade ON UPDATE no action;