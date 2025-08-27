ALTER TABLE "hotmart_course_lessons" DROP CONSTRAINT "hotmart_course_lessons_module_hotmart_courses_id_fk";
--> statement-breakpoint
ALTER TABLE "hotmart_course_lessons" ADD CONSTRAINT "hotmart_course_lessons_module_hotmart_course_modules_id_fk" FOREIGN KEY ("module") REFERENCES "public"."hotmart_course_modules"("id") ON DELETE cascade ON UPDATE no action;