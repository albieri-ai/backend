import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import {
	assetChunks,
	assetSummary,
	trainingAssets,
	youtubeVideoAssets,
} from "../database/schema";
import {
	and,
	cosineDistance,
	desc,
	eq,
	gte,
	inArray,
	isNotNull,
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
		const similarAssets = await fastify.db
			.select({ id: trainingAssets.id, summary: assetSummary.summary })
			.from(trainingAssets)
			.leftJoin(assetSummary, eq(assetSummary.asset, trainingAssets.id))
			.where(
				and(
					and(
						eq(trainingAssets.persona, persona),
						eq(trainingAssets.enabled, true),
					),
					gte(sql`1 - ${cosineDistance(assetSummary.embeddings, embed)}`, 0.6),
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
						inArray(
							assetChunks.asset,
							similarAssets.map((s) => s.id),
						),
						gte(
							sql`1 - ${cosineDistance(assetSummary.embeddings, embed)}`,
							0.5,
						),
					),
				)
				.orderBy(
					desc(
						gte(
							sql`1 - ${cosineDistance(assetSummary.embeddings, embed)}`,
							0.6,
						),
					),
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
				gte(sql`1 - ${cosineDistance(assetSummary.embeddings, embed)}`, 0.5),
			)
			.orderBy(
				desc(
					gte(sql`1 - ${cosineDistance(assetSummary.embeddings, embed)}`, 0.6),
				),
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
						eq(trainingAssets.persona, persona),
						eq(trainingAssets.enabled, true),
					),
					gte(sql`1 - ${cosineDistance(assetSummary.embeddings, embed)}`, 0.6),
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
					inArray(
						assetChunks.asset,
						similarAssets.map((s) => s.id),
					),
					gte(sql`1 - ${cosineDistance(assetSummary.embeddings, embed)}`, 0.5),
				),
			)
			.orderBy(
				desc(
					gte(sql`1 - ${cosineDistance(assetSummary.embeddings, embed)}`, 0.6),
				),
			)) as { id: string; title: string; summary: string; url: string }[];

		return chunks;
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
		},
	};

	fastify.decorate("ai", ai);
};

export default fp(aiPlugin, {
	name: "ai",
	fastify: ">=4.0.0",
	dependencies: ["@fastify/env"],
});
