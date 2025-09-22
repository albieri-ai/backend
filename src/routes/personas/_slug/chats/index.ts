import type { FastifyInstance, FastifyServerOptions } from "fastify";
import {
	convertToModelMessages,
	generateText,
	streamText,
	tool,
	embed,
	type UIMessage,
	stepCountIs,
} from "ai";
import { threads } from "../../../../database/schema";
import { eq, and, sql, isNull, count, ilike } from "drizzle-orm";
import { personaLoader } from "../../../../lib/personaLoader";
import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";
import { withTracing } from "@posthog/ai";
import { buildSystemPrompt } from "../../../../lib/buildSystemPrompt";

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

			const persona = await fastify.db.query.personas.findFirst({
				with: {
					topics: {
						columns: {},
						with: {
							topic: {
								columns: { name: true },
							},
						},
					},
				},
				where: (p, { eq }) => eq(p.id, request.persona!.id),
			});

			if (!persona) {
				return reply.callNotFound();
			}

			const [chat] = await fastify.db
				.select()
				.from(threads)
				.where(
					and(
						eq(threads.id, request.params!.chatID),
						eq(threads.persona, persona.id),
					),
				);

			const gptOss = withTracing(
				fastify.ai.providers.groq("openai/gpt-oss-120b"),
				fastify.posthog,
				{
					posthogDistinctId: request.user?.id,
					posthogProperties: { chat_id: chat?.id },
					posthogPrivacyMode: false,
					posthogGroups: { persona: request.persona!.id },
				},
			);

			const conversationModel = withTracing(
				fastify.ai.providers.openai("gpt-5-mini"),
				fastify.posthog,
				{
					posthogDistinctId: request.user?.id,
					posthogProperties: { chat_id: chat?.id },
					posthogPrivacyMode: false,
					posthogGroups: { persona: request.persona!.id },
				},
			);

			if (!chat) {
				const { text: title } = await generateText({
					model: gptOss,
					system: `\n
        - você gerará um título curto com base na primeira mensagem com a qual o usuário inicia a conversa
        - certifique-se de que não tenha mais de 80 caracteres
        - o título deve ser um resumo da mensagem do usuário
        - não use aspas ou dois pontos`,
					prompt: JSON.stringify(
						request.body.messages[request.body.messages.length - 1].parts
							.map((p) => (p.type === "text" ? p.text : ""))
							.join("\n"),
					),
				});

				const [thread] = await fastify.db
					.insert(threads)
					.values({
						id: request.params.chatID,
						persona: request.persona!.id,
						title,
						author: request.user.id,
						messages: request.body.messages,
						model: "gemini-2.5-pro",
					})
					.returning({ id: threads.id });

				fastify.posthog.capture({
					event: "thread created",
					distinctId: request.user.id,
					properties: {
						organization: persona.organization,
						persona: persona.id,
						thread: thread.id,
						model: conversationModel.modelId,
					},
				});
			}

			const result = streamText({
				model: conversationModel,
				messages: convertToModelMessages(request.body.messages),
				system: buildSystemPrompt({ persona: request.persona! }),
				tools: {
					retrieve_content: tool({
						description:
							"Retrieves a set of content related to the query. Use this to search for relevant information.",
						inputSchema: z.object({
							query: z.string().min(1),
						}),
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

							if (!context.length) {
								return `Nenhum conteúdo foi encontrado para: ${query}`;
							}

							return context
								.map(
									(content) =>
										`\n

						Resumo do Conteúdo: ${content.chunk}
					`,
								)
								.join(
									`\n

						----------
						`,
								);
						},
					}),
					retrieve_youtube_video: tool({
						description:
							"Retrieves youtube videos related to the query. Use this to search videos that matches the content you're looking for.",
						inputSchema: z.object({ query: z.string() }),
						execute: async ({ query }) => {
							const { embedding: queryEmbed } = await embed({
								model: fastify.ai.providers.openai.embedding(
									"text-embedding-3-small",
								),
								value: query,
							});

							return fastify.ai.handlers
								.retrieveYoutubeVideo(request.persona!.id, queryEmbed)
								.then((res) =>
									res.length
										? res
												.map(
													(video) =>
														`\n

							Título do Vídeo: ${video.title}

							URL do Vídeo: ${video.url}

							Resumo do Vídeo: ${video.summary}
						`,
												)
												.join(
													`\n

							----------
							`,
												)
										: `Nenhum conteúdo foi encontrado para: ${query}`,
								);
						},
					}),
					retrive_course: tool({
						description:
							"Retrieves courses related to the query. Use this to search through courses that have contents that matches what you're looking for.",
						inputSchema: z.object({ query: z.string() }),
						execute: async ({ query }) => {
							const { embedding: queryEmbed } = await embed({
								model: fastify.ai.providers.openai.embedding(
									"text-embedding-3-small",
								),
								value: query,
							});

							return fastify.ai.handlers
								.retrieveCourse(request.persona!.id, queryEmbed)
								.then((res) =>
									res.length
										? res
												.map(
													(course) =>
														`\n
							Curso: ${course.name}

							Resumo do Curso: ${course.summary}
						`,
												)
												.join(
													`\n

							----------
							`,
												)
										: `Nenhum conteúdo foi encontrado para: ${query}`,
								);
						},
					}),
					retrieve_course_module: tool({
						description:
							"Retrieves courses modules related to the query. Use this to search through courses modules that have contents that matches what you're looking for.",
						inputSchema: z.object({ query: z.string() }),
						execute: async ({ query }) => {
							const { embedding: queryEmbed } = await embed({
								model: fastify.ai.providers.openai.embedding(
									"text-embedding-3-small",
								),
								value: query,
							});

							return fastify.ai.handlers
								.retrieveCourseModule(request.persona!.id, queryEmbed)
								.then((res) =>
									res.length
										? res
												.map(
													(module) =>
														`\n

								Módulo: ${module.name}

								Curso: ${module.course}

								Resumo do Módulo: ${module.summary}
							`,
												)
												.join(
													`\n

								----------
								`,
												)
										: `Nenhum conteúdo foi encontrado para: ${query}`,
								);
						},
					}),
					retrieve_course_lessons: tool({
						description:
							"Retrieves lessons related to the query. Use this to search through lessons that have contents that matches what you're looking for.",
						inputSchema: z.object({ query: z.string() }),
						execute: async ({ query }) => {
							const { embedding: queryEmbed } = await embed({
								model: fastify.ai.providers.openai.embedding(
									"text-embedding-3-small",
								),
								value: query,
							});

							return fastify.ai.handlers
								.retrieveCourseLesson(request.persona!.id, queryEmbed)
								.then((res) =>
									res.length
										? res
												.map(
													(lesson) =>
														`\n

									Aula: ${lesson.name}

									Módulo: ${lesson.module}
									Curso: ${lesson.course}

									Resumo da Aula: ${lesson.summary}
								`,
												)
												.join(
													`\n

									----------
									`,
												)
										: `Nenhum conteúdo foi encontrado para: ${query}`,
								);
						},
					}),
				},
				stopWhen: stepCountIs(20),
			});

			reply.header("X-Vercel-AI-Data-Stream", "v1");
			reply.header("Content-Type", "text/plain; charset=utf-8");

			return reply.send(
				result.toUIMessageStreamResponse({
					generateMessageId: () => createId(),
					originalMessages: request.body.messages,
					onFinish: async ({ messages }) => {
						await fastify.db
							.update(threads)
							.set({
								messages: messages,
								updatedAt: sql`NOW()`,
							})
							.where(eq(threads.id, request.params.chatID));
					},
				}),
			);
		},
	);
}
