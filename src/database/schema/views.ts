import { pgView } from "drizzle-orm/pg-core";
import { count, eq } from "drizzle-orm";
import { hotmartCourseModules, hotmartCourseLessons } from "./hotmart";
import { hotmartVideoAssets } from "./training";

export const hotmartCourseLessonCount = pgView(
	"hotmart_course_lesson_count",
).as((qb) =>
	qb
		.select({
			course: hotmartCourseModules.course,
			count: count(hotmartCourseLessons.id).as("count"),
		})
		.from(hotmartCourseLessons)
		.leftJoin(
			hotmartCourseModules,
			eq(hotmartCourseModules.id, hotmartCourseLessons.module),
		)
		.groupBy(hotmartCourseModules.course),
);

export const hotmartCourseVideoCount = pgView("hotmart_course_video_count").as(
	(qb) =>
		qb
			.select({
				course: hotmartCourseModules.course,
				count: count(hotmartVideoAssets.id).as("count"),
			})
			.from(hotmartVideoAssets)
			.leftJoin(
				hotmartCourseLessons,
				eq(hotmartCourseLessons.id, hotmartVideoAssets.lesson),
			)
			.leftJoin(
				hotmartCourseModules,
				eq(hotmartCourseModules.id, hotmartCourseLessons.module),
			)
			.groupBy(hotmartCourseModules.course),
);
