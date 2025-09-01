import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import {
	assetChunks,
	assetSummary,
	hotmartCourseLessons,
	hotmartCourseModules,
	hotmartCourseModulesSummary,
	hotmartCourses,
	hotmartCoursesSummary,
	hotmartVideoAssets,
	trainingAssets,
	youtubeVideoAssets,
} from "../database/schema";
import {
	and,
	cosineDistance,
	desc,
	eq,
	gt,
	gte,
	inArray,
	isNotNull,
	isNull,
	or,
	sql,
} from "drizzle-orm";

const aiPlugin: FastifyPluginAsync<{}> = async (fastify: FastifyInstance) => {
	const gemini = createGoogleGenerativeAI({
		apiKey: fastify.config.GEMINI_API_KEY,
	});
	const groq = createGroq({
		apiKey: fastify.config.GROQ_API_KEY,
	});
	const openai = createOpenAI({
		apiKey: process.env.OPENAI_API_KEY,
	});

	async function retrieveContent(persona: string, embed: number[]) {
		const summarySimilarity = sql`1 - (${cosineDistance(assetSummary.embeddings, embed)})`;

		const similarAssets = await fastify.db
			.select({ id: trainingAssets.id, summary: assetSummary.summary })
			.from(trainingAssets)
			.leftJoin(assetSummary, eq(assetSummary.asset, trainingAssets.id))
			.where(
				and(
					isNull(trainingAssets.deletedAt),
					eq(trainingAssets.persona, persona),
					eq(trainingAssets.enabled, true),
					gte(summarySimilarity, 0.6),
				),
			);

		if (similarAssets.length) {
			const chunks = await fastify.db
				.select({
					asset: assetChunks.asset,
					summary: assetSummary.summary,
					chunk: assetChunks.text,
				})
				.from(assetChunks)
				.leftJoin(trainingAssets, eq(trainingAssets.id, assetChunks.asset))
				.leftJoin(assetSummary, eq(assetSummary.asset, trainingAssets.id))
				.where(
					and(
						isNull(trainingAssets.deletedAt),
						inArray(
							assetChunks.asset,
							similarAssets.map((s) => s.id),
						),
						gte(
							sql`1 - (${cosineDistance(assetSummary.embeddings, embed)})`,
							0.5,
						),
					),
				)
				.orderBy(
					desc(sql`1 - (${cosineDistance(assetSummary.embeddings, embed)})`),
				);

			return chunks;
		}

		const chunks = await fastify.db
			.select({
				asset: assetChunks.asset,
				summary: assetSummary.summary,
				chunk: assetChunks.text,
			})
			.from(assetChunks)
			.leftJoin(trainingAssets, eq(trainingAssets.id, assetChunks.asset))
			.leftJoin(assetSummary, eq(assetSummary.asset, trainingAssets.id))
			.where(
				and(
					isNull(trainingAssets.deletedAt),
					gte(
						sql`1 - (${cosineDistance(assetSummary.embeddings, embed)})`,
						0.5,
					),
				),
			)
			.orderBy(
				desc(sql`1 - (${cosineDistance(assetSummary.embeddings, embed)})`),
			);

		return chunks;
	}

	async function retrieveYoutubeVideo(
		persona: string,
		embed: number[],
	): Promise<{ id: string; title: string; url: string; summary: string }[]> {
		const similarAssets = await fastify.db
			.select({
				id: trainingAssets.id,
				title: youtubeVideoAssets.title,
				summary: assetSummary.summary,
				url: youtubeVideoAssets.url,
			})
			.from(trainingAssets)
			.leftJoin(assetSummary, eq(assetSummary.asset, trainingAssets.id))
			.leftJoin(
				youtubeVideoAssets,
				eq(youtubeVideoAssets.asset, trainingAssets.id),
			)
			.where(
				and(
					and(
						isNotNull(youtubeVideoAssets.url),
						isNull(trainingAssets.deletedAt),
						eq(trainingAssets.persona, persona),
						eq(trainingAssets.enabled, true),
					),
					gte(
						sql`1 - (${cosineDistance(assetSummary.embeddings, embed)})`,
						0.6,
					),
				),
			);

		if (!similarAssets.length) {
			return [];
		}

		const chunks = (await fastify.db
			.select({
				id: trainingAssets.id,
				title: youtubeVideoAssets.title,
				summary: assetSummary.summary,
				chunk: assetChunks.text,
				url: youtubeVideoAssets.url,
			})
			.from(assetChunks)
			.leftJoin(trainingAssets, eq(trainingAssets.id, assetChunks.asset))
			.leftJoin(assetSummary, eq(assetSummary.asset, trainingAssets.id))
			.leftJoin(
				youtubeVideoAssets,
				eq(youtubeVideoAssets.asset, trainingAssets.id),
			)
			.where(
				and(
					isNotNull(youtubeVideoAssets.url),
					isNull(trainingAssets.deletedAt),
					inArray(
						assetChunks.asset,
						similarAssets.map((s) => s.id),
					),
					gte(
						sql`1 - (${cosineDistance(assetSummary.embeddings, embed)})`,
						0.5,
					),
				),
			)
			.orderBy(
				desc(sql`1 - (${cosineDistance(assetSummary.embeddings, embed)})`),
			)) as { id: string; title: string; summary: string; url: string }[];

		return chunks;
	}

	async function retrieveCourse(persona: string, embed: number[]) {
		const courseSummarySimilarity = sql`1 - (${cosineDistance(hotmartCoursesSummary.embeddings, embed)})`;
		const courseModuleSummarySimilarity = sql`1 - (${cosineDistance(hotmartCourseModulesSummary.embeddings, embed)})`;
		const courseLessonSummarySimilarity = sql`1 - (${cosineDistance(assetSummary.embeddings, embed)})`;

		const courses = (await fastify.db
			.select({
				id: hotmartCourses.id,
				name: hotmartCourses.name,
				summary: hotmartCoursesSummary.summary,
			})
			.from(assetChunks)
			.leftJoin(
				hotmartVideoAssets,
				eq(hotmartVideoAssets.asset, assetChunks.asset),
			)
			.leftJoin(trainingAssets, eq(trainingAssets.id, hotmartVideoAssets.asset))
			.leftJoin(assetSummary, eq(assetSummary.asset, hotmartVideoAssets.asset))
			.leftJoin(
				hotmartCourseLessons,
				eq(hotmartCourseLessons.id, hotmartVideoAssets.lesson),
			)
			.leftJoin(
				hotmartCourseModules,
				eq(hotmartCourseModules.id, hotmartCourseLessons.module),
			)
			.leftJoin(
				hotmartCourses,
				eq(hotmartCourses.id, hotmartCourseModules.course),
			)
			.leftJoin(
				hotmartCourseModulesSummary,
				eq(hotmartCourseModulesSummary.module, hotmartCourseModules.id),
			)
			.leftJoin(
				hotmartCoursesSummary,
				eq(hotmartCoursesSummary.course, hotmartCourseModules.course),
			)
			.where(
				and(
					isNotNull(hotmartCourses.id),
					isNotNull(hotmartVideoAssets.id),
					eq(trainingAssets.persona, persona),
					or(
						gt(courseSummarySimilarity, 0.6),
						gt(courseModuleSummarySimilarity, 0.75),
						gt(courseLessonSummarySimilarity, 0.8),
					),
				),
			)
			.orderBy(
				desc(courseSummarySimilarity),
				desc(courseModuleSummarySimilarity),
				desc(courseLessonSummarySimilarity),
			)
			.limit(5)) as {
			id: string;
			name: string;
			summary: string;
		}[];

		return courses;
	}

	async function retrieveCourseModule(persona: string, embed: number[]) {
		const courseModuleSummarySimilarity = sql`1 - (${cosineDistance(hotmartCourseModulesSummary.embeddings, embed)})`;
		const courseLessonSummarySimilarity = sql`1 - (${cosineDistance(assetSummary.embeddings, embed)})`;

		const modules = (await fastify.db
			.select({
				id: hotmartCourseModules.id,
				name: hotmartCourseModules.name,
				course: hotmartCourses.name,
				summary: hotmartCourseModulesSummary.summary,
			})
			.from(assetChunks)
			.leftJoin(
				hotmartVideoAssets,
				eq(hotmartVideoAssets.asset, assetChunks.asset),
			)
			.leftJoin(trainingAssets, eq(trainingAssets.id, hotmartVideoAssets.asset))
			.leftJoin(assetSummary, eq(assetSummary.asset, hotmartVideoAssets.asset))
			.leftJoin(
				hotmartCourseLessons,
				eq(hotmartCourseLessons.id, hotmartVideoAssets.lesson),
			)
			.leftJoin(
				hotmartCourseModules,
				eq(hotmartCourseModules.id, hotmartCourseLessons.module),
			)
			.leftJoin(
				hotmartCourses,
				eq(hotmartCourses.id, hotmartCourseModules.course),
			)
			.leftJoin(
				hotmartCourseModulesSummary,
				eq(hotmartCourseModulesSummary.module, hotmartCourseModules.id),
			)
			.where(
				and(
					isNotNull(hotmartCourseModules.id),
					isNotNull(hotmartVideoAssets.id),
					eq(trainingAssets.persona, persona),
					or(
						gt(courseModuleSummarySimilarity, 0.6),
						gt(courseLessonSummarySimilarity, 0.75),
					),
				),
			)
			.orderBy(
				desc(courseModuleSummarySimilarity),
				desc(courseLessonSummarySimilarity),
			)
			.limit(5)) as {
			id: string;
			name: string;
			course: string;
			summary: string;
		}[];

		return modules;
	}

	async function retrieveCourseLesson(persona: string, embed: number[]) {
		const courseLessonSummarySimilarity = sql`1 - (${cosineDistance(assetSummary.embeddings, embed)})`;

		const lessons = (await fastify.db
			.select({
				id: hotmartCourseModules.id,
				name: hotmartCourseLessons.name,
				course: hotmartCourses.name,
				module: hotmartCourseModules.name,
				summary: assetSummary.summary,
			})
			.from(assetChunks)
			.leftJoin(
				hotmartVideoAssets,
				eq(hotmartVideoAssets.asset, assetChunks.asset),
			)
			.leftJoin(trainingAssets, eq(trainingAssets.id, hotmartVideoAssets.asset))
			.leftJoin(assetSummary, eq(assetSummary.asset, hotmartVideoAssets.asset))
			.leftJoin(
				hotmartCourseLessons,
				eq(hotmartCourseLessons.id, hotmartVideoAssets.lesson),
			)
			.leftJoin(
				hotmartCourseModules,
				eq(hotmartCourseModules.id, hotmartCourseLessons.module),
			)
			.leftJoin(
				hotmartCourses,
				eq(hotmartCourses.id, hotmartCourseModules.course),
			)
			.where(
				and(
					isNotNull(hotmartCourseLessons.id),
					isNotNull(hotmartVideoAssets.id),
					eq(trainingAssets.persona, persona),
					gt(courseLessonSummarySimilarity, 0.6),
				),
			)
			.orderBy(desc(courseLessonSummarySimilarity))
			.limit(5)) as {
			id: string;
			name: string;
			course: string;
			module: string;
			summary: string;
		}[];

		return lessons;
	}

	const ai = {
		providers: {
			groq,
			gemini,
			openai,
		},
		handlers: {
			retrieveContent,
			retrieveYoutubeVideo,
			retrieveCourse,
			retrieveCourseModule,
			retrieveCourseLesson,
		},
	};

	fastify.decorate("ai", ai);
};

export default fp(aiPlugin, {
	name: "ai",
	fastify: ">=4.0.0",
	dependencies: ["@fastify/env", "database"],
});
