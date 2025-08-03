import type { FastifyInstance, FastifyServerOptions } from "fastify";
import {
	appendResponseMessages,
	convertToCoreMessages,
	generateText,
	streamText,
	type UIMessage,
} from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { personas, threads } from "../../../../database/schema";
import { eq, isNull, and } from "drizzle-orm";
import { createGroq } from "@ai-sdk/groq";

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	const googleProvider = createGoogleGenerativeAI({
		apiKey: fastify.config.GEMINI_API_KEY,
	});
	const groqProvider = createGroq({
		apiKey: fastify.config.GROQ_API_KEY,
	});

	fastify.post<{
		Params: { slug: string; chatID: string };
		Body: { messages: UIMessage[] };
	}>("/:chatID/complete", async (request, reply) => {
		const persona = await fastify.db
			.select()
			.from(personas)
			.where(
				and(eq(personas.slug, request.params.slug), isNull(personas.deletedAt)),
			)
			.then(([res]) => res);

		if (!persona) {
			reply.status(404).send({ error: "Persona not found" });
			return;
		}

		const model = {
			name: "gemini-2.0-flash",
			provider: googleProvider("gemini-2.0-flash"),
		};

		let [chat] = await fastify.db
			.select()
			.from(threads)
			.where(eq(threads.id, request.params.chatID));

		if (!chat) {
			const { text: title } = await generateText({
				model: groqProvider("llama-3.1-8b-instant"),
				system: `\n
          - você gerará um título curto com base na primeira mensagem com a qual o usuário inicia a conversa
          - certifique-se de que não tenha mais de 80 caracteres
          - o título deve ser um resumo da mensagem do usuário
          - não use aspas ou dois pontos`,
				prompt: JSON.stringify(request.body.messages),
			});

			chat = await fastify.db
				.insert(threads)
				.values({
					id: request.params.chatID,
					persona: persona.id,
					title: title,
					author: request.user!.id,
					messages: request.body.messages,
					model: model.name,
				})
				.returning()
				.then(([res]) => res);
		}

		const result = streamText({
			model: model.provider,
			system: "",
			messages: convertToCoreMessages(request.body.messages),
			onFinish: async (message) => {
				const updateMessages = appendResponseMessages({
					messages: chat.messages,
					responseMessages: message.response.messages,
				});

				await fastify.db
					.update(threads)
					.set({
						messages: updateMessages,
					})
					.where(eq(threads.id, request.params.chatID));
			},
		});

		reply.header("X-Vercel-AI-Data-Stream", "v1");
		reply.header("Content-Type", "text/plain; charset=utf-8");

		return reply.send(result.toDataStream());
	});
}
