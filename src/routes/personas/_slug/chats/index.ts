import type { FastifyInstance, FastifyServerOptions } from "fastify";
import {
	appendResponseMessages,
	embed,
	generateText,
	streamText,
	type UIMessage,
} from "ai";
import { threads } from "../../../../database/schema";
import { eq, and, sql, isNull, count, ilike } from "drizzle-orm";
import { personaLoader } from "../../../../lib/personaLoader";
import { z } from "zod";

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	fastify.get<{
		Querystring: { page: number; limit: number; query?: string };
		Params: { slug: string };
	}>(
		"/",
		{
			preHandler: [personaLoader(fastify)],
			schema: {
				params: z.object({
					slug: z.string(),
				}),
				querystring: z.object({
					page: z.coerce.number().int().positive().default(1),
					limit: z.coerce.number().int().positive().default(10),
					query: z.string().optional(),
				}),
			},
		},
		async (request, reply) => {
			if (!request.user?.id) {
				return reply.forbidden();
			}

			let baseQuery = and(
				eq(threads.persona, request.persona!.id),
				eq(threads.author, request.user!.id),
				isNull(threads.deletedAt),
			);

			if (request.query.query) {
				baseQuery = and(
					baseQuery,
					ilike(threads.title, "%" + request.query.query + "%"),
				);
			}

			const threadCount = await fastify.db
				.select({ count: count() })
				.from(threads)
				.where(baseQuery)
				.then(([res]) => res?.count || 0);

			const userThreads = await fastify.db.query.threads.findMany({
				columns: {
					author: false,
					persona: false,
					messages: false,
					model: false,
					deletedBy: false,
					deletedAt: false,
				},
				with: {
					author: {
						columns: {
							id: true,
							name: true,
							isAnonymous: true,
						},
					},
					persona: {
						columns: {
							id: true,
							name: true,
							slug: true,
						},
					},
				},
				where: () => baseQuery,
				limit: request.query.limit,
				offset: (request.query.page - 1) * request.query.limit,
			});

			const hasNextPage =
				threadCount > request.query.limit * request.query.page;
			const previousPage = Math.min(
				request.query.page - 1,
				Math.ceil(threadCount / request.query.limit),
			);
			const hasPreviousPage =
				previousPage > 0 && previousPage < request.query.page;

			return reply.send({
				data: userThreads,
				pagination: {
					totalRecords: threadCount,
					totalPages: Math.ceil(threadCount / request.query.limit),
					currentPage: request.query.page,
					pageSize: request.query.limit,
					nextPage: hasNextPage ? request.query.page + 1 : null,
					previousPage: hasPreviousPage ? request.query.page - 1 : null,
				},
			});
		},
	);

	fastify.get<{
		Params: { slug: string; chatID: string };
	}>(
		"/:chatID",
		{
			preHandler: [personaLoader(fastify)],
			schema: {
				params: z.object({
					slug: z.string(),
					chatID: z.string(),
				}),
			},
		},
		async (request, reply) => {
			if (!request.user?.id) {
				return reply.forbidden();
			}

			const thread = await fastify.db.query.threads.findFirst({
				columns: {
					author: false,
					persona: false,
					model: false,
					deletedBy: false,
					deletedAt: false,
				},
				with: {
					author: {
						columns: {
							id: true,
							name: true,
							isAnonymous: true,
						},
					},
					persona: {
						columns: {
							id: true,
							name: true,
							slug: true,
						},
					},
				},
				where: () =>
					and(
						eq(threads.persona, request.persona!.id),
						eq(threads.author, request.user!.id),
						eq(threads.id, request.params.chatID),
						isNull(threads.deletedAt),
					),
			});

			return reply.send({
				data: thread,
			});
		},
	);

	fastify.post<{
		Params: { slug: string; chatID: string };
		Body: { messages: UIMessage[] };
	}>(
		"/:chatID/complete",
		{ preHandler: [personaLoader(fastify)] },
		async (request, reply) => {
			if (!request.user?.id) {
				return reply.forbidden();
			}

			const [chat] = await fastify.db
				.select()
				.from(threads)
				.where(
					and(
						eq(threads.id, request.params!.chatID),
						eq(threads.persona, request.persona!.id),
					),
				);

			if (!chat) {
				const { text: title } = await generateText({
					model: fastify.ai.providers.groq("llama-3.1-8b-instant"),
					system: `\n
        - você gerará um título curto com base na primeira mensagem com a qual o usuário inicia a conversa
        - certifique-se de que não tenha mais de 80 caracteres
        - o título deve ser um resumo da mensagem do usuário
        - não use aspas ou dois pontos`,
					prompt: JSON.stringify(request.body.messages.slice(-1)),
				});

				await fastify.db.insert(threads).values({
					id: request.params.chatID,
					persona: request.persona!.id,
					title,
					author: request.user.id,
					messages: request.body.messages,
					model: "gemini-2.0-flash",
				});
			}

			const result = streamText({
				model: fastify.ai.providers.gemini("gemini-2.0-flash"),
				messages: request.body.messages,
				tools: {
					retrieve_content: {
						description:
							"Retrieves a set of content related to the query. Use this to search for relevant information.",
						parameters: z.object({ query: z.string() }),
						execute: async ({ query }) => {
							const { embedding: queryEmbed } = await embed({
								model: fastify.ai.providers.openai.embedding(
									"text-embedding-3-small",
								),
								value: query,
							});

							const context = await fastify.ai.handlers.retrieveContent(
								request.persona!.id,
								queryEmbed,
							);

							return context.map((c) => ({ content: c.chunk }));
						},
					},
				},
				onFinish: async (message) => {
					const finalMessages = appendResponseMessages({
						messages: request.body.messages as UIMessage[],
						responseMessages: message.response.messages,
					});

					await fastify.db
						.update(threads)
						.set({
							messages: finalMessages,
							updatedAt: sql`NOW()`,
						})
						.where(eq(threads.id, request.params.chatID));
				},
			});

			reply.header("X-Vercel-AI-Data-Stream", "v1");
			reply.header("Content-Type", "text/plain; charset=utf-8");

			return reply.send(result.toDataStream());
		},
	);
}
