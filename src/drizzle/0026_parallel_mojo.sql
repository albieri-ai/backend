CREATE TABLE "hotmart_course_modules_summary" (
	"id" serial PRIMARY KEY NOT NULL,
	"module" text NOT NULL,
	"summary" text NOT NULL,
	"embeddings" vector(1536) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hotmart_courses_summary" (
	"id" serial PRIMARY KEY NOT NULL,
	"course" text NOT NULL,
	"summary" text NOT NULL,
	"embeddings" vector(1536) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "merchant_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"stripe_id" text NOT NULL,
	"user" text NOT NULL,
	CONSTRAINT "merchant_accounts_user_unique" UNIQUE("user")
);
--> statement-breakpoint
ALTER TABLE "hotmart_course_modules_summary" ADD CONSTRAINT "hotmart_course_modules_summary_module_hotmart_course_modules_id_fk" FOREIGN KEY ("module") REFERENCES "public"."hotmart_course_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotmart_courses_summary" ADD CONSTRAINT "hotmart_courses_summary_course_hotmart_courses_id_fk" FOREIGN KEY ("course") REFERENCES "public"."hotmart_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_accounts" ADD CONSTRAINT "merchant_accounts_user_users_id_fk" FOREIGN KEY ("user") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hotmart_course_modules_summary_module_index" ON "hotmart_course_modules_summary" USING btree ("module");--> statement-breakpoint
CREATE UNIQUE INDEX "hotmart_courses_summary_course_index" ON "hotmart_courses_summary" USING btree ("course");