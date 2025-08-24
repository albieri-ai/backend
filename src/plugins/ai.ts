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
import { embed, type UIMessage } from "ai";

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
				gte(sql`1 - (${cosineDistance(assetSummary.embeddings, embed)})`, 0.5),
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

	async function enhanceMessagePartsWithContext(
		persona: string,
		parts: UIMessage["parts"],
	): Promise<UIMessage["parts"]> {
		const content = parts
			.map((p) => (p.type === "text" ? p.text : ""))
			.filter((p) => p.length > 0)
			.join("\n");

		const { embedding } = await embed({
			model: openai.embedding("text-embedding-3-small"),
			value: content,
		});

		const similarContent = await retrieveContent(persona, embedding);

		if (!similarContent.length) {
			return parts;
		}

		return [
			{
				type: "text",
				text: `
		  ${content}

			<context>
			${similarContent
				.slice(0, 3)
				.map(
					(c) =>
						`Conteúdo: ${c.asset}\nResumo: ${c.summary}\nConteúdo: ${c.chunk}`,
				)
				.join("\n\n\n")}
			</context>
		`,
			},
		];
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
			enhanceMessagePartsWithContext,
		},
	};

	fastify.decorate("ai", ai);
};

export default fp(aiPlugin, {
	name: "ai",
	fastify: ">=4.0.0",
	dependencies: ["@fastify/env"],
});
