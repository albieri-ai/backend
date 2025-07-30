import { task, logger } from "@trigger.dev/sdk/v3";
import { createDb } from "../database/db";
import { YoutubeLoader } from "@langchain/community/document_loaders/web/youtube";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { embed, embedMany, generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGroq } from "@ai-sdk/groq";
import { assetChunks, assetSummary, trainingAssets } from "../database/schema";

export const IngestYoutubeVideo = task({
	id: "ingest-youtube-video",
	run: async (payload: { url: string; assetID: string }, { ctx }) => {
		const loader = YoutubeLoader.createFromUrl(payload.url, {
			language: "pt-BR",
			addVideoInfo: true,
		});

		const docs = await loader.load();

		logger.info(`docs loaded for ${payload.assetID}`);

		console.log("doc content: ", docs);

		const textSplitter = new RecursiveCharacterTextSplitter({
			chunkSize: 256,
			chunkOverlap: 10,
		});
		const docOutput = await textSplitter.splitDocuments(docs);

		logger.info(`docs splitted for ${payload.assetID}`);

		const openai = createOpenAI({
			apiKey: process.env.OPENAI_API_KEY,
		});
		const groq = createGroq({
			apiKey: process.env.GROQ_API_KEY,
		});

		const { text: summary } = await generateText({
			model: groq("llama-3.3-70b-versatile"),
			system: `\n
      - você gerará um resumo curto e conciso do texto fornecido
      - o resumo deve conter no máximo 500 caracteres
      - o texto fornecido é uma transcrição de vídeo de um curso online
      - o resumo deve ser claro e direto, capturando os principais pontos abordados no vídeo
      - evite jargões técnicos ou termos complexos
      - use uma linguagem simples e acessível
      - não use aspas ou dois pontos
      `,
			prompt: docs[0].pageContent,
		});

		const { embedding: summaryEmbedding } = await embed({
			model: openai.embedding("text-embedding-3-large"),
			value: summary,
		});

		const { embeddings } = await embedMany({
			model: openai.embedding("text-embedding-3-large"),
			values: docOutput.map((d) => d.pageContent),
		});

		logger.info(`embeddings generated for ${payload.assetID}`);

		const { db } = await createDb({
			connectionString: process.env.DATABASE_URL!,
		});

		await db.transaction(async (trx) => {
			await trx.update(trainingAssets).set({
				enabled: true,
				status: "ready",
			});

			await trx.insert(assetSummary).values({
				asset: payload.assetID,
				summary,
				embeddings: summaryEmbedding,
				version: 1,
			});

			await trx.insert(assetChunks).values(
				docOutput.map((d, index) => ({
					asset: payload.assetID,
					text: d.pageContent,
					embeddings: embeddings[index]!,
				})),
			);
		});
	},
});

export const IngestPdfDocument = task({
	id: "ingest-pdf-document",
	run: async (payload: { url: string; assetID: string }, { ctx }) => {
		const loader = new PDFLoader(payload.url);

		const docs = await loader.load();

		logger.info(`docs loaded for ${payload.assetID}`);

		const textSplitter = new RecursiveCharacterTextSplitter({
			chunkSize: 256,
			chunkOverlap: 10,
		});
		const docOutput = await textSplitter.splitDocuments(docs);

		logger.info(`docs splitted for ${payload.assetID}`);

		const openai = createOpenAI({
			apiKey: process.env.OPENAI_API_KEY,
		});
		const groq = createGroq({
			apiKey: process.env.GROQ_API_KEY,
		});

		const { text: summary } = await generateText({
			model: groq("llama-3.3-70b-versatile"),
			system: `\n
      - você gerará um resumo curto e conciso do texto fornecido
      - o resumo deve conter no máximo 500 caracteres
      - o texto fornecido é uma transcrição de vídeo de um curso online
      - o resumo deve ser claro e direto, capturando os principais pontos abordados no vídeo
      - evite jargões técnicos ou termos complexos
      - use uma linguagem simples e acessível
      - não use aspas ou dois pontos
      `,
			prompt: docs[0].pageContent,
		});

		const { embedding: summaryEmbedding } = await embed({
			model: openai.embedding("text-embedding-3-large"),
			value: summary,
		});

		const { embeddings } = await embedMany({
			model: openai.embedding("text-embedding-3-large"),
			values: docOutput.map((d) => d.pageContent),
		});

		logger.info(`embeddings generated for ${payload.assetID}`);

		const { db } = await createDb({
			connectionString: process.env.DATABASE_URL!,
		});

		await db.transaction(async (trx) => {
			await trx.update(trainingAssets).set({
				enabled: true,
				status: "ready",
			});

			await trx.insert(assetSummary).values({
				asset: payload.assetID,
				summary,
				embeddings: summaryEmbedding,
				version: 1,
			});

			await trx.insert(assetChunks).values(
				docOutput.map((d, index) => ({
					asset: payload.assetID,
					text: d.pageContent,
					embeddings: embeddings[index]!,
				})),
			);
		});
	},
});
