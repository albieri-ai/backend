CREATE TABLE "youtube_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"persona" text NOT NULL,
	"url" text NOT NULL,
	"trigger_id" varchar,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"disabled_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "youtube_channels_videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"video_id" varchar NOT NULL,
	"title" text,
	"published_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "file_assets" ADD COLUMN IF NOT EXISTS "file_id" text;--> statement-breakpoint
ALTER TABLE "youtube_video_assets" ADD COLUMN IF NOT EXISTS "video_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "youtube_video_assets" ADD COLUMN IF NOT EXISTS "channel_video" integer;--> statement-breakpoint
ALTER TABLE "youtube_channels" ADD CONSTRAINT "youtube_channels_persona_personas_id_fk" FOREIGN KEY ("persona") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_channels" ADD CONSTRAINT "youtube_channels_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_channels_videos" ADD CONSTRAINT "youtube_channels_videos_channel_youtube_channels_id_fk" FOREIGN KEY ("channel") REFERENCES "public"."youtube_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "youtube_channels_persona_index" ON "youtube_channels" USING btree ("persona");--> statement-breakpoint
CREATE UNIQUE INDEX "youtube_channels_videos_channel_video_id_index" ON "youtube_channels_videos" USING btree ("channel","video_id");--> statement-breakpoint
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_video_assets" ADD CONSTRAINT "youtube_video_assets_channel_video_youtube_channels_videos_id_fk" FOREIGN KEY ("channel_video") REFERENCES "public"."youtube_channels_videos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_assets" DROP COLUMN IF EXISTS "url";--> statement-breakpoint
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_fileId_unique" UNIQUE("file_id");
