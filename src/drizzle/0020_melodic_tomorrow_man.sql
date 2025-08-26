CREATE TABLE "hotmart_course_lessons" (
	"id" text PRIMARY KEY NOT NULL,
	"module" text NOT NULL,
	"name" text NOT NULL,
	"hotmart_id" text
);
--> statement-breakpoint
CREATE TABLE "hotmart_course_modules" (
	"id" text PRIMARY KEY NOT NULL,
	"course" text NOT NULL,
	"hotmart_id" text NOT NULL,
	"name" text NOT NULL,
	"paid" boolean,
	"public" boolean,
	"extra" boolean
);
--> statement-breakpoint
CREATE TABLE "hotmart_courses" (
	"id" text PRIMARY KEY NOT NULL,
	"persona" text NOT NULL,
	"course_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"url" text,
	"created_by" text NOT NULL,
	"disabled_by" text,
	"created_at" timestamp DEFAULT now(),
	"disabled_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "hotmart_video_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset" text NOT NULL,
	"lesson" text,
	"hotmart_id" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "training_assets" ADD COLUMN "deleted_by" text;--> statement-breakpoint
ALTER TABLE "training_assets" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "youtube_channels" ADD COLUMN "disabled_by" text;--> statement-breakpoint
ALTER TABLE "hotmart_course_lessons" ADD CONSTRAINT "hotmart_course_lessons_module_hotmart_courses_id_fk" FOREIGN KEY ("module") REFERENCES "public"."hotmart_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotmart_course_modules" ADD CONSTRAINT "hotmart_course_modules_course_hotmart_courses_id_fk" FOREIGN KEY ("course") REFERENCES "public"."hotmart_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotmart_courses" ADD CONSTRAINT "hotmart_courses_persona_personas_id_fk" FOREIGN KEY ("persona") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotmart_courses" ADD CONSTRAINT "hotmart_courses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotmart_courses" ADD CONSTRAINT "hotmart_courses_disabled_by_users_id_fk" FOREIGN KEY ("disabled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotmart_video_assets" ADD CONSTRAINT "hotmart_video_assets_asset_training_assets_id_fk" FOREIGN KEY ("asset") REFERENCES "public"."training_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotmart_video_assets" ADD CONSTRAINT "hotmart_video_assets_lesson_hotmart_course_lessons_id_fk" FOREIGN KEY ("lesson") REFERENCES "public"."hotmart_course_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hotmart_course_lessons_module_hotmart_id_index" ON "hotmart_course_lessons" USING btree ("module","hotmart_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hotmart_course_modules_course_hotmart_id_index" ON "hotmart_course_modules" USING btree ("course","hotmart_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hotmart_courses_persona_course_id_index" ON "hotmart_courses" USING btree ("persona","course_id");--> statement-breakpoint
ALTER TABLE "training_assets" ADD CONSTRAINT "training_assets_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_channels" ADD CONSTRAINT "youtube_channels_disabled_by_users_id_fk" FOREIGN KEY ("disabled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;