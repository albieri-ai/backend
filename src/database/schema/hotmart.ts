import {
	pgTable,
	text,
	timestamp,
	boolean,
	uniqueIndex,
	serial,
	vector,
} from "drizzle-orm/pg-core";
import { personas } from "./personas";
import { createId } from "@paralleldrive/cuid2";
import { users } from "./auth";

export const hotmartCourses = pgTable(
	"hotmart_courses",
	{
		id: text()
			.primaryKey()
			.$default(() => createId()),
		persona: text()
			.notNull()
			.references(() => personas.id, { onDelete: "cascade" }),
		courseId: text().notNull(),
		name: text().notNull(),
		description: text().notNull(),
		url: text(),
		createdBy: text()
			.notNull()
			.references(() => users.id, { onDelete: "set null" }),
		disabledBy: text().references(() => users.id, { onDelete: "set null" }),
		createdAt: timestamp().defaultNow(),
		disabledAt: timestamp(),
	},
	(table) => ({
		hotmartCoursePersonaCourseIdx: uniqueIndex().on(
			table.persona,
			table.courseId,
		),
	}),
);

export const hotmartCourseModules = pgTable(
	"hotmart_course_modules",
	{
		id: text()
			.primaryKey()
			.$default(() => createId()),
		course: text()
			.notNull()
			.references(() => hotmartCourses.id, { onDelete: "cascade" }),
		hotmartId: text().notNull(),
		name: text().notNull(),
		paid: boolean(),
		public: boolean(),
		extra: boolean(),
	},
	(table) => ({
		hotmartCourseModuleCourseIdx: uniqueIndex().on(
			table.course,
			table.hotmartId,
		),
	}),
);

export const hotmartCourseLessons = pgTable(
	"hotmart_course_lessons",
	{
		id: text()
			.primaryKey()
			.$default(() => createId()),
		module: text()
			.notNull()
			.references(() => hotmartCourseModules.id, { onDelete: "cascade" }),
		name: text().notNull(),
		hotmartId: text(),
	},
	(table) => ({
		hotmartCourseLessonModuleIdx: uniqueIndex().on(
			table.module,
			table.hotmartId,
		),
	}),
);

export const hotmartCourseModulesSummary = pgTable(
	"hotmart_course_modules_summary",
	{
		id: serial().primaryKey(),
		module: text()
			.notNull()
			.references(() => hotmartCourseModules.id, { onDelete: "cascade" }),
		summary: text().notNull(),
		embeddings: vector({ dimensions: 1536 }).notNull(),
		createdAt: timestamp().defaultNow(),
		updatedAt: timestamp()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => ({
		hotmartCourseModuleSummaryModuleIdx: uniqueIndex().on(table.module),
	}),
);

export const hotmartCoursesSummary = pgTable(
	"hotmart_courses_summary",
	{
		id: serial().primaryKey(),
		course: text()
			.notNull()
			.references(() => hotmartCourses.id, { onDelete: "cascade" }),
		summary: text().notNull(),
		embeddings: vector({ dimensions: 1536 }).notNull(),
		createdAt: timestamp().defaultNow(),
		updatedAt: timestamp()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => ({
		hotmartCourseSummaryCourseIdx: uniqueIndex().on(table.course),
	}),
);
