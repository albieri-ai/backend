ALTER TYPE "public"."training_asset_type" ADD VALUE 'vimeo_file';--> statement-breakpoint
CREATE TABLE "vimeo_video_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset" text NOT NULL,
	"vimeo_id" text NOT NULL,
	"vimeo_account" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vimeo_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"persona" text NOT NULL,
	"code" text,
	"state" text NOT NULL,
	"token" text,
	"created_by" text NOT NULL,
	"disabled_by" text,
	"created_at" timestamp DEFAULT now(),
	"disabled_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "vimeo_video_assets" ADD CONSTRAINT "vimeo_video_assets_asset_training_assets_id_fk" FOREIGN KEY ("asset") REFERENCES "public"."training_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vimeo_video_assets" ADD CONSTRAINT "vimeo_video_assets_vimeo_account_vimeo_accounts_id_fk" FOREIGN KEY ("vimeo_account") REFERENCES "public"."vimeo_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vimeo_accounts" ADD CONSTRAINT "vimeo_accounts_persona_personas_id_fk" FOREIGN KEY ("persona") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vimeo_accounts" ADD CONSTRAINT "vimeo_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vimeo_accounts" ADD CONSTRAINT "vimeo_accounts_disabled_by_users_id_fk" FOREIGN KEY ("disabled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vimeo_video_assets_asset_index" ON "vimeo_video_assets" USING btree ("asset");--> statement-breakpoint
CREATE INDEX "vimeo_video_assets_vimeo_account_index" ON "vimeo_video_assets" USING btree ("vimeo_account");--> statement-breakpoint
CREATE UNIQUE INDEX "vimeo_accounts_persona_index" ON "vimeo_accounts" USING btree ("persona");