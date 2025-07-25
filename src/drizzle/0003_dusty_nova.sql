CREATE TYPE "public"."file_status" AS ENUM('pending', 'ready');--> statement-breakpoint
CREATE TYPE "public"."file_visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TYPE "public"."storages" AS ENUM('aws');--> statement-breakpoint
CREATE TYPE "public"."training_asset_status" AS ENUM('pending', 'error', 'ready');--> statement-breakpoint
CREATE TYPE "public"."training_asset_type" AS ENUM('file', 'youtube_video', 'webpage');--> statement-breakpoint
CREATE TABLE "persona_topics" (
	"id" serial PRIMARY KEY NOT NULL,
	"persona" varchar NOT NULL,
	"topic" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personas" (
	"id" text PRIMARY KEY NOT NULL,
	"organization" text NOT NULL,
	"name" varchar NOT NULL,
	"slug" varchar NOT NULL,
	"photo" text NOT NULL,
	"title" text,
	"description" text,
	"created_by" text NOT NULL,
	"modified_by" text,
	"deleted_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"icon" varchar NOT NULL,
	"disabled_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"original_name" varchar NOT NULL,
	"mime_type" varchar NOT NULL,
	"storage" "storages" DEFAULT 'aws',
	"bucket" varchar NOT NULL,
	"visibility" "file_visibility" DEFAULT 'private',
	"status" "file_status" DEFAULT 'pending',
	"size" integer,
	"checksum" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" text PRIMARY KEY NOT NULL,
	"persona" text NOT NULL,
	"title" text NOT NULL,
	"author" text NOT NULL,
	"messages" jsonb NOT NULL,
	"model" varchar NOT NULL,
	"deleted_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "asset_chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset" text NOT NULL,
	"text" text NOT NULL,
	"embeddings" vector(1536) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "asset_summary" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset" text NOT NULL,
	"version" integer NOT NULL,
	"summary" text NOT NULL,
	"embeddings" vector(1536) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "file_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset" text NOT NULL,
	"url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_type" "training_asset_type" NOT NULL,
	"status" "training_asset_status" DEFAULT 'pending' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"persona" varchar,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "web_page_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset" text NOT NULL,
	"url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "youtube_video_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset" text NOT NULL,
	"url" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "persona_topics" ADD CONSTRAINT "persona_topics_persona_personas_id_fk" FOREIGN KEY ("persona") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persona_topics" ADD CONSTRAINT "persona_topics_topic_topics_id_fk" FOREIGN KEY ("topic") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_organization_organizations_id_fk" FOREIGN KEY ("organization") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_photo_files_id_fk" FOREIGN KEY ("photo") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_modified_by_users_id_fk" FOREIGN KEY ("modified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_persona_personas_id_fk" FOREIGN KEY ("persona") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_author_users_id_fk" FOREIGN KEY ("author") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_chunks" ADD CONSTRAINT "asset_chunks_asset_training_assets_id_fk" FOREIGN KEY ("asset") REFERENCES "public"."training_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_summary" ADD CONSTRAINT "asset_summary_asset_training_assets_id_fk" FOREIGN KEY ("asset") REFERENCES "public"."training_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_asset_training_assets_id_fk" FOREIGN KEY ("asset") REFERENCES "public"."training_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_assets" ADD CONSTRAINT "training_assets_persona_personas_id_fk" FOREIGN KEY ("persona") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_assets" ADD CONSTRAINT "training_assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_page_assets" ADD CONSTRAINT "web_page_assets_asset_training_assets_id_fk" FOREIGN KEY ("asset") REFERENCES "public"."training_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_video_assets" ADD CONSTRAINT "youtube_video_assets_asset_training_assets_id_fk" FOREIGN KEY ("asset") REFERENCES "public"."training_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "persona_topics_persona_index" ON "persona_topics" USING btree ("persona");--> statement-breakpoint
CREATE UNIQUE INDEX "persona_topics_persona_topic_index" ON "persona_topics" USING btree ("persona","topic");--> statement-breakpoint
CREATE INDEX "personas_id_index" ON "personas" USING btree ("id");--> statement-breakpoint
CREATE UNIQUE INDEX "personas_organization_index" ON "personas" USING btree ("organization");--> statement-breakpoint
CREATE UNIQUE INDEX "personas_slug_index" ON "personas" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "thread_persona_author_idx" ON "threads" USING btree ("persona","author","created_at" desc,"deleted_at");--> statement-breakpoint
CREATE INDEX "asset_chunks_asset_index" ON "asset_chunks" USING btree ("asset");--> statement-breakpoint
CREATE INDEX "asset_summary_asset_index" ON "asset_summary" USING btree ("asset");--> statement-breakpoint
CREATE INDEX "file_assets_asset_index" ON "file_assets" USING btree ("asset");--> statement-breakpoint
CREATE INDEX "training_assets_persona_enabled_index" ON "training_assets" USING btree ("persona","enabled");--> statement-breakpoint
CREATE INDEX "web_page_assets_asset_index" ON "web_page_assets" USING btree ("asset");--> statement-breakpoint
CREATE INDEX "youtube_video_assets_asset_index" ON "youtube_video_assets" USING btree ("asset");
