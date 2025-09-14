import { task, logger } from "@trigger.dev/sdk";
import { createDb } from "../database/db";
import { YoutubeLoader } from "@langchain/community/document_loaders/web/youtube";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { embedMany, generateObject } from "ai";
import { assetChunks, assetSummary, trainingAssets } from "../database/schema";
import axios from "axios";
import fs from "node:fs";
import { createId } from "@paralleldrive/cuid2";
import ffmpeg from "fluent-ffmpeg";
import {
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import Groq from "groq-sdk";
import z from "zod";
import { gptOss120, openai, embed } from "./common";

export const IngestYoutubeVideo = task({
	id: "ingest-youtube-video",
	run: async (payload: { url: string; assetID: string }, { ctx }) => {
		const loader = YoutubeLoader.createFromUrl(payload.url, {
			language: "pt-BR",
			addVideoInfo: true,
		});

		const docs = await loader.load();

		logger.info(`docs loaded for ${payload.assetID}`);

		const textSplitter = new RecursiveCharacterTextSplitter({
			chunkSize: 1000,
			chunkOverlap: 100,
		});
		const docOutput = await textSplitter.splitDocuments(docs);

		logger.info(`docs splitted for ${payload.assetID}`);

		const {
			object: { summary },
		} = await generateObject({
			model: gptOss120(),
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
			schema: z.object({
				summary: z.string(),
				tags: z.array(z.string()),
			}),
		});

		logger.info(`summary generated for ${payload.assetID}`);

		const { db } = await createDb({
			connectionString: process.env.DATABASE_URL!,
		});

		const asset = await db.query.trainingAssets.findFirst({
			columns: { persona: true },
			where: (ta, { eq }) => eq(ta.id, payload.assetID),
		});

		if (!asset) {
			logger.error(`not asset found for id: ${payload.assetID}`);

			throw new Error(`not asset found for id: ${payload.assetID}`);
		}

		const { embedding: summaryEmbedding } = await embed(summary, {
			traceId: ctx.task.id,
			distinctId: `embed_yt_video_${payload.assetID}`,
			spanId: `embed_yt_video_${payload.assetID}`,
			spanName: "index_yt_video",
			persona: asset!.persona!,
		});

		const { embeddings } = await embedMany({
			model: openai.embedding("text-embedding-3-small"),
			values: docOutput.map((d) => d.pageContent),
		});

		logger.info(`embeddings generated for ${payload.assetID}`);

		await db.transaction(async (trx) => {
			await trx.update(trainingAssets).set({
				enabled: true,
				status: "ready",
			});

			await trx
				.insert(assetSummary)
				.values({
					asset: payload.assetID,
					summary,
					embeddings: summaryEmbedding,
					version: 1,
				})
				.catch((err) => {
					console.error(err);
					throw err;
				});

			await trx.insert(assetChunks).values(
				docOutput.map((d, index) => ({
					asset: payload.assetID,
					text: d.pageContent,
					embeddings: embeddings[index]!,
				})),
			);
		});

		logger.info(`infos saved in db for: ${payload.assetID}`);
	},
});

export const IngestPdfDocument = task({
	id: "ingest-pdf-document",
	run: async (payload: { url: string; assetID: string }, { ctx }) => {
		const { data: blob } = await axios.get(payload.url, {
			responseType: "arraybuffer",
		});

		const id = createId();
		const filePath = `/tmp/${id}.pdf`;

		fs.writeFileSync(filePath, blob);

		const loader = new PDFLoader(filePath, {
			splitPages: false,
		});

		const docs = await loader.load();

		logger.info(`docs loaded for ${payload.assetID}`);

		const textSplitter = new RecursiveCharacterTextSplitter({
			chunkSize: 1000,
			chunkOverlap: 100,
		});
		const docOutput = await textSplitter.splitDocuments(docs);

		logger.info(`docs splitted for ${payload.assetID}`);

		const {
			object: { summary },
		} = await generateObject({
			model: gptOss120(),
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
			schema: z.object({
				summary: z.string(),
				tags: z.array(z.string()),
			}),
		});

		const { db } = await createDb({
			connectionString: process.env.DATABASE_URL!,
		});

		const asset = await db.query.trainingAssets.findFirst({
			columns: { persona: true },
			where: (ta, { eq }) => eq(ta.id, payload.assetID),
		});

		const { embedding: summaryEmbedding } = await embed(summary, {
			traceId: ctx.task.id,
			distinctId: `embed_pdf_document_${payload.assetID}`,
			spanId: `embed_pdf_document_${payload.assetID}`,
			spanName: "index_pdf_document",
			persona: asset!.persona!,
		});

		const { embeddings } = await embedMany({
			model: openai.embedding("text-embedding-3-small"),
			values: docOutput.map((d) => d.pageContent),
		});

		logger.info(`embeddings generated for ${payload.assetID}`);

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

		logger.info(`infos saved in db for: ${payload.assetID}`);

		fs.unlinkSync(filePath);
	},
});

export const IngestAudioFile = task({
	id: "ingest-audio-file",
	run: async (payload: { assetID: string; url: string }, { ctx }) => {
		const groqSdk = new Groq({
			apiKey: process.env.GROQ_API_KEY,
		});

		const transcription = (await groqSdk.audio.transcriptions.create({
			model: "whisper-large-v3-turbo",
			url: payload.url,
			response_format: "verbose_json",
		})) as unknown as {
			segments: {
				id: number;
				seek: number;
				start: number;
				end: number;
				text: string;
				tokens: number[];
				temperature: number;
				avg_logprob: number;
				compression_ratio: number;
				no_speech_prob: number;
			}[];
		};

		const segments = transcription.segments;

		const fullText = segments.map((s) => s.text).join(" ");

		const {
			object: { summary },
		} = await generateObject({
			model: gptOss120(),
			system: `\n
      - você gerará um resumo curto e conciso do texto fornecido
      - o resumo deve conter no máximo 500 caracteres
      - o texto fornecido é uma transcrição de vídeo de um curso online
      - o resumo deve ser claro e direto, capturando os principais pontos abordados no vídeo
      - evite jargões técnicos ou termos complexos
      - use uma linguagem simples e acessível
      - não use aspas ou dois pontos
      `,
			prompt: fullText,
			schema: z.object({
				summary: z.string(),
				// tags: z.array(z.string()),
			}),
		});

		const { db } = await createDb({
			connectionString: process.env.DATABASE_URL!,
		});

		const asset = await db.query.trainingAssets.findFirst({
			columns: { persona: true },
			where: (ta, { eq }) => eq(ta.id, payload.assetID),
		});

		const { embedding: summaryEmbedding } = await embed(summary, {
			traceId: ctx.task.id,
			distinctId: `embed_audio_file_${payload.assetID}`,
			spanId: `embed_audio_file_${payload.assetID}`,
			spanName: "index_audio_file",
			persona: asset!.persona!,
		});

		const textSplitter = new RecursiveCharacterTextSplitter({
			chunkSize: 1000,
			chunkOverlap: 100,
		});
		const docOutput = await textSplitter.splitText(fullText);

		const { embeddings } = await embedMany({
			model: openai.embedding("text-embedding-3-small"),
			values: docOutput,
		});

		logger.info(`embeddings generated for ${payload.assetID}`);

		await db.transaction(async (trx) => {
			await trx.update(trainingAssets).set({
				enabled: true,
				status: "ready",
			});

			await trx
				.insert(assetSummary)
				.values({
					asset: payload.assetID,
					summary,
					embeddings: summaryEmbedding,
					version: 1,
				})
				.catch((err) => {
					console.error(err);
					throw err;
				});

			if (docOutput.length) {
				await trx.insert(assetChunks).values(
					docOutput.map((d, index) => ({
						asset: payload.assetID,
						text: d,
						embeddings: embeddings[index]!,
					})),
				);
			}
		});

		logger.info(`infos saved in db for: ${payload.assetID}`);
	},
});

export const IngestVideoFile = task({
	id: "ingest-video-file",
	run: async (payload: { url: string; assetID: string }, { ctx }) => {
		const fileName = `${createId()}.mp3`;
		const outputPath = `/tmp/${fileName}`;

		const extractAudio = async () =>
			new Promise((resolve, reject) => {
				ffmpeg(payload.url)
					.noVideo()
					.audioChannels(1)
					.audioFrequency(16000)
					.audioBitrate("64k")
					.outputFormat("mp3")
					.save(outputPath)
					.on("end", resolve)
					.on("error", reject);
			});

		await extractAudio();

		logger.log("audio file downloaded");

		const s3Client = new S3Client({
			region: "us-east-1",
			credentials: {
				accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
				secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
			},
		});

		const command = new PutObjectCommand({
			Bucket: process.env.AWS_S3_TEMPORARY_BUCKET,
			Key: fileName,
			Body: fs.readFileSync(outputPath),
			ContentType: "audio/mpeg", // important for mp3 files
		});

		await s3Client.send(command);

		const getCommand = new GetObjectCommand({
			Bucket: process.env.AWS_S3_TEMPORARY_BUCKET,
			Key: fileName,
		});

		const url = await getSignedUrl(s3Client, getCommand, {
			expiresIn: 259200,
		});

		logger.log("audio file uploaded");

		await IngestAudioFile.trigger({
			assetID: payload.assetID,
			url,
		});
	},
});
