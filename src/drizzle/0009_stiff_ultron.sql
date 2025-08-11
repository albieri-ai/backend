CREATE TABLE "calendar_days" (
	"date" date PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "youtube_video_assets" ALTER COLUMN "title" SET DEFAULT 'Título não disponível';