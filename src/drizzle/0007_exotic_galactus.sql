ALTER TYPE "public"."training_asset_type" ADD VALUE 'video_file' BEFORE 'youtube_video';--> statement-breakpoint
ALTER TYPE "public"."training_asset_type" ADD VALUE 'hotmart';--> statement-breakpoint
ALTER TABLE "web_page_assets" ADD COLUMN "title" text NOT NULL;--> statement-breakpoint
ALTER TABLE "youtube_video_assets" ADD COLUMN "title" text NOT NULL;