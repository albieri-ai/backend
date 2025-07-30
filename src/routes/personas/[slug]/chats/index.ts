import type { FastifyInstance, FastifyServerOptions } from "fastify";
import {
	convertToCoreMessages,
	generateText,
	streamText,
	type UIMessage,
} from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { personas, threads } from "../../../../database/schema";
import { eq, isNull, and } from "drizzle-orm";

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	const googleProvider = createGoogleGenerativeAI({
		apiKey: fastify.config.GEMINI_API_KEY,
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

		const result = streamText({
			model: googleProvider("gemini-2.5-flash"),
			system: "",
			messages: convertToCoreMessages(request.body.messages),
			onFinish: async ({}) => {
				const messages = [];

				await fastify.db
					.insert(threads)
					.values({
						id: request.params.chatID,
						persona: persona.id,
						title: "New Chat",
						author: request.user!.id,
						messages,
						model: "gemini-2.5-flash",
					})
					.onConflictDoUpdate({
						target: [threads.id],
						set: {
							messages,
						},
					});
			},
		});

		reply.header("X-Vercel-AI-Data-Stream", "v1");
		reply.header("Content-Type", "text/plain; charset=utf-8");

		return reply.send(result.toDataStream());
	});
}
