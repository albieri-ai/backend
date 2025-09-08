ALTER TYPE "public"."training_asset_type" ADD VALUE 'rss_feed';--> statement-breakpoint
CREATE TABLE "rss_feeds" (
	"id" text PRIMARY KEY NOT NULL,
	"persona" text NOT NULL,
	"url" text NOT NULL,
	"keep_synced" boolean DEFAULT false NOT NULL,
	"name" text,
	"trigger_id" varchar,
	"created_by" text NOT NULL,
	"disabled_by" text,
	"created_at" timestamp DEFAULT now(),
	"disabled_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "rss_feed_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"feed" text NOT NULL,
	"asset" text NOT NULL,
	"title" text NOT NULL,
	"rss_guid" text NOT NULL
);
--> statement-breakpoint
DROP VIEW "public"."hotmart_course_lesson_count";--> statement-breakpoint
DROP VIEW "public"."hotmart_course_video_count";--> statement-breakpoint
DROP VIEW "public"."youtube_channels_video_count";--> statement-breakpoint
DROP INDEX "training_assets_persona_enabled_index";--> statement-breakpoint
ALTER TABLE "vimeo_video_assets" ADD COLUMN "title" text DEFAULT 'Título não disponível' NOT NULL;--> statement-breakpoint
ALTER TABLE "rss_feeds" ADD CONSTRAINT "rss_feeds_persona_personas_id_fk" FOREIGN KEY ("persona") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rss_feeds" ADD CONSTRAINT "rss_feeds_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rss_feeds" ADD CONSTRAINT "rss_feeds_disabled_by_users_id_fk" FOREIGN KEY ("disabled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rss_feed_assets" ADD CONSTRAINT "rss_feed_assets_feed_rss_feeds_id_fk" FOREIGN KEY ("feed") REFERENCES "public"."rss_feeds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rss_feed_assets" ADD CONSTRAINT "rss_feed_assets_asset_training_assets_id_fk" FOREIGN KEY ("asset") REFERENCES "public"."training_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rss_feeds_persona_index" ON "rss_feeds" USING btree ("persona") WHERE "rss_feeds"."disabled_at" is null;--> statement-breakpoint
CREATE INDEX "rss_feed_assets_feed_index" ON "rss_feed_assets" USING btree ("feed");--> statement-breakpoint
CREATE INDEX "rss_feed_assets_asset_index" ON "rss_feed_assets" USING btree ("asset");--> statement-breakpoint
CREATE UNIQUE INDEX "file_assets_file_id_index" ON "file_assets" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "hotmart_video_assets_asset_index" ON "hotmart_video_assets" USING btree ("asset");--> statement-breakpoint
CREATE UNIQUE INDEX "hotmart_video_assets_lesson_index" ON "hotmart_video_assets" USING btree ("lesson");--> statement-breakpoint
CREATE INDEX "training_assets_persona_enabled_index" ON "training_assets" USING btree ("persona","enabled") WHERE "training_assets"."deleted_at" is null;--> statement-breakpoint
CREATE VIEW "public"."rss_feed_asset_count" AS (select "rss_feeds"."id", count("rss_feed_assets"."id") as "count" from "rss_feed_assets" left join "rss_feeds" on "rss_feeds"."id" = "rss_feed_assets"."feed" left join "training_assets" on "training_assets"."id" = "rss_feed_assets"."asset" where "training_assets"."deleted_at" is null group by "rss_feeds"."id");--> statement-breakpoint
CREATE VIEW "public"."hotmart_course_lesson_count" AS (select "hotmart_course_modules"."course", count("hotmart_course_lessons"."id") as "count" from "hotmart_course_lessons" left join "hotmart_course_modules" on "hotmart_course_modules"."id" = "hotmart_course_lessons"."module" left join "training_assets" on "hotmart_video_assets"."asset" = "training_assets"."id" where "training_assets"."deleted_at" is null group by "hotmart_course_modules"."course");--> statement-breakpoint
CREATE VIEW "public"."hotmart_course_video_count" AS (select "hotmart_course_modules"."course", count("hotmart_video_assets"."id") as "count" from "hotmart_video_assets" left join "hotmart_course_lessons" on "hotmart_course_lessons"."id" = "hotmart_video_assets"."lesson" left join "hotmart_course_modules" on "hotmart_course_modules"."id" = "hotmart_course_lessons"."module" left join "training_assets" on "hotmart_video_assets"."asset" = "training_assets"."id" where "training_assets"."deleted_at" is null group by "hotmart_course_modules"."course");--> statement-breakpoint
CREATE VIEW "public"."youtube_channels_video_count" AS (select "youtube_channels_videos"."channel", count("youtube_channels_videos"."id") as "count" from "youtube_channels_videos" left join "youtube_video_assets" on "youtube_channels_videos"."id" = "youtube_video_assets"."channel_video" left join "training_assets" on "training_assets"."id" = "youtube_video_assets"."asset" where "training_assets"."deleted_at" is null group by "youtube_channels_videos"."channel");