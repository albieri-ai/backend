ALTER TABLE "file_assets" RENAME COLUMN "url" TO "file_id";--> statement-breakpoint
ALTER TABLE "youtube_video_assets" ADD COLUMN "video_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "youtube_video_assets" ADD COLUMN "channel_video" text;--> statement-breakpoint
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_video_assets" ADD CONSTRAINT "youtube_video_assets_channel_video_youtube_channels_videos_id_fk" FOREIGN KEY ("channel_video") REFERENCES "public"."youtube_channels_videos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_fileId_unique" UNIQUE("file_id");