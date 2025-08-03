import { generateText, streamText } from "ai";
import type { FastifyInstance, FastifyServerOptions } from "fastify";
import { createGroq } from "@ai-sdk/groq";
import { z } from "zod";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { and, eq, isNull } from "drizzle-orm";
import { personas, threads } from "../../database/schema";

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	const groq = createGroq({
		apiKey: fastify.config.GROQ_API_KEY,
	});
	const gemini = createGoogleGenerativeAI({
		apiKey: fastify.config.GEMINI_API_KEY,
	});

	fastify.post<{ Body: { text: string } }>(
		"/objective",
		{
			schema: {
				body: z.object({
					text: z.string(),
				}),
			},
		},
		async (request, reply) => {
			const { text } = await generateText({
				model: groq("llama-3.1-8b-instant"),
				system: `\n
      Com base nas informações que o usuário fornece, você gerará uma frase curta que resumirá o objetivo do usuário.
      Essa frase será usada como prompt para um modelo de linguagem que responderá seguindo as diretrizes do usuário.
      Escreva uma única frase condensando tudo que o usuário enviou

      - certifique-se de que não tenha mais de 500 caracteres
      - não use aspas ou dois pontos
      - responda apenas com a frase gerada e nada mais`,
				prompt: request.body.text,
			});

			reply.send({ data: { objective: text } });
		},
	);

	fastify.post<{ Params: { personaSlug: string; chatID: string } }>(
		"/:personaSlug/chats/:chatID",
		{
			schema: {
				params: z.object({
					personaSlug: z.string(),
					chatID: z.string(),
				}),
			},
		},
		async (request, reply) => {
			const persona = await fastify.db
				.select()
				.from(personas)
				.where(
					and(
						eq(personas.slug, request.params!.personaSlug),
						isNull(personas.deletedAt),
					),
				)
				.then(([res]) => res);

			if (!persona) {
				reply.status(404).send({ error: "Persona not found" });

				return;
			}

			const chat = await fastify.db
				.select()
				.from(threads)
				.where(
					and(
						eq(threads.id, request.params!.chatID),
						eq(threads.persona, persona.id),
					),
				);

			if (!chat) {
			}

			const result = streamText({
				model: gemini("gemini-2.5-flash"),
				prompt: "Hello, world!",
			});

			reply.header("X-Vercel-AI-Data-Stream", "v1");
			reply.header("Content-Type", "text/plain; charset=utf-8");

			return reply.send(result.toDataStream());
		},
	);

	// fastify.post("/goal", {}, async (request, reply) => {
	// 	const result = await generateText({
	// 		model: "gpt-3.5-turbo",
	// 		prompt: "",
	// 	});

	// 	reply.send({ data: { goal: result.text } });
	// });
}
