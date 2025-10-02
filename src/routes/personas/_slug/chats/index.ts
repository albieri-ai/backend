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
import {
	threads,
	threadShareIds,
	userMessages,
} from "../../../../database/schema";
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
				return reply.status(403).send({ message: "Unauthorized" });
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
					shareIds: {
						columns: {
							id: true,
						},
						where: (si, { isNull }) => isNull(si.disabledAt),
					},
				},
				where: () =>
					and(
						eq(threads.persona, request.persona!.id),
						eq(threads.id, request.params.chatID),
						isNull(threads.deletedAt),
					),
			});

			if (!thread) {
				return reply.send({ data: null });
			}

			const { shareIds, ...threadData } = thread;

			const isVisible =
				thread?.visibility === "public" ||
				thread.author.id === request.user?.id;

			const isAdmin = async () => {
				const member = await fastify.db.query.members.findFirst({
					where: (mem, { and, eq }) =>
						and(
							eq(mem.userId, request.user!.id),
							eq(mem.organizationId, request.persona!.organization),
						),
				});

				return !!member;
			};

			if (isVisible || (await isAdmin())) {
				const activeShareId =
					thread?.visibility === "public" && shareIds.length > 0
						? shareIds[0].id
						: null;

				return reply.send({
					data: {
						...threadData,
						shareUrl: `${fastify.config.APP_URL}/u/${thread.persona.slug}/shared/${activeShareId}`,
					},
				});
			}

			return reply.status(403).send({ error: "Forbidden" });
		},
	);

	fastify.post<{ Params: { slug: string; chatID: string } }>(
		"/:chatID/share",
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
			const { id } = await fastify.db.transaction(async (trx) => {
				const [thread] = await trx
					.update(threads)
					.set({ visibility: "public" })
					.where(eq(threads.id, request.params.chatID))
					.returning({ id: threads.id, messages: threads.messages });

				if (!thread) {
					reply.callNotFound();

					throw new Error("thread not found");
				}

				const lastMessage = thread.messages[thread.messages.length - 1];

				if (!lastMessage) {
					throw new Error("empty thread cannot be shared");
				}

				const lastMessageId = lastMessage.id;

				const [shareId] = await trx
					.insert(threadShareIds)
					.values({
						thread: thread.id,
						lastMessage: lastMessageId,
					})
					.onConflictDoUpdate({
						target: [threadShareIds.id],
						set: {
							lastMessage: lastMessageId,
						},
					})
					.returning();

				if (!shareId) {
					throw new Error("unable to share conversation");
				}

				return shareId;
			});

			return reply.send({
				data: {
					url: `${fastify.config.APP_URL}/u/${request.persona!.slug}/shared/${id}`,
				},
			});
		},
	);

	fastify.post<{ Params: { slug: string; chatID: string } }>(
		"/:chatID/unshare",
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
			await fastify.db.transaction(async (trx) => {
				const [thread] = await trx
					.update(threads)
					.set({ visibility: "private" })
					.where(eq(threads.id, request.params.chatID))
					.returning({ id: threads.id });

				if (!thread) {
					return reply.callNotFound();
				}

				await trx
					.update(threadShareIds)
					.set({ disabledAt: new Date() })
					.where(eq(threadShareIds.thread, thread.id));
			});

			return reply.status(204).send();
		},
	);

	fastify.get<{
		Params: { slug: string; chatID: string };
	}>(
		"/shared/:chatID",
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
			const response = await fastify.db.query.threadShareIds.findFirst({
				columns: { lastMessage: true },
				with: {
					thread: {
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
					},
				},
				where: (tsi, { eq, and, isNull }) =>
					and(eq(tsi.id, request.params.chatID), isNull(tsi.disabledAt)),
			});

			if (!response) {
				return reply.send({ data: null });
			}

			const { thread, lastMessage: lastMessageShared } = response;

			const threadMessages = thread.messages;
			const lastMessageIndex = lastMessageShared
				? threadMessages.findIndex((i) => i.id === lastMessageShared)
				: -1;

			const sharedMessages =
				lastMessageIndex >= 0
					? thread.messages.slice(0, lastMessageIndex + 1)
					: thread.messages;

			return reply.send({
				data: { ...thread, messages: sharedMessages },
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
				// fastify.ai.providers.gemini("gemini-2.0-flash"),
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

			const lastMessage =
				request.body.messages[request.body.messages.length - 1];

			const { embedding: lastMessageEmbed } = await embed({
				model: fastify.ai.providers.openai.embedding("text-embedding-3-small"),
				value: lastMessage.parts.join(" "),
			});

			const lastMessageSimilarContent =
				await fastify.ai.handlers.retrieveContent(
					request.persona!.id,
					lastMessageEmbed,
				);

			const lastMessageContext = lastMessageSimilarContent
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

			const enhancedLastMessage = `
	      Aqui está uma pergunta realizada pelo usuário e o contexto que encontramos relacionado a pergunta realizada:

			  <context>
				${lastMessageContext}
				</context>

				<question>
				${lastMessage.parts.join(" ")}
				</question>
			`;

			const messagesByUser: UIMessage[] = [
				...request.body.messages.slice(0, request.body.messages.length - 1),
				{
					...lastMessage,
					parts: [{ type: "text", text: enhancedLastMessage }],
				},
			];

			const result = streamText({
				model: conversationModel,
				// messages: convertToModelMessages(messagesByUser),
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
					ask_for_help: tool({
						description:
							"Whenever you don't have enough information to answer a question, ask for a humam to help with this question.",
						inputSchema: z.object({
							reason: z.string(),
						}),
						execute: async ({ reason }) => {
							await fastify.db
								.update(threads)
								.set({
									helpNeeded: true,
									helpReason: reason,
								})
								.where(eq(threads.id, request.params.chatID));
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
					messageMetadata: () => ({
						createdAt: new Date().toISOString(),
					}),
					onFinish: async ({ messages }) => {
						await fastify.db
							.update(threads)
							.set({
								messages: messages,
								updatedAt: sql`NOW()`,
							})
							.where(eq(threads.id, request.params.chatID));

						if (request.user?.id) {
							const messageCount = await fastify.db
								.select({ count: count().as("count") })
								.from(userMessages)
								.where(eq(userMessages.author, request.user!.id))
								.then(([res]) => res?.count || 0);

							await fastify.posthog.identifyImmediate({
								distinctId: request.user!.id,
								properties: {
									messages: messageCount,
									nps_ready: messageCount >= 3,
								},
							});
						}
					},
				}),
			);
		},
	);

	fastify.post<{
		Params: { slug: string; chatID: string };
		Body: { message: string };
	}>(
		"/:chatID/admin-message",
		{
			preHandler: [personaLoader(fastify)],
			schema: {
				params: z.object({
					slug: z.string(),
					chatID: z.string(),
				}),
				body: z.object({
					message: z.string().min(1),
				}),
			},
		},
		async (request, reply) => {
			const thread = await fastify.db.query.threads.findFirst({
				where: () =>
					and(
						eq(threads.persona, request.persona!.id),
						eq(threads.id, request.params.chatID),
					),
			});

			if (!thread) {
				return reply.callNotFound();
			}

			const newMessage: UIMessage = {
				id: createId(),
				role: "assistant",
				parts: [
					{
						type: "text",
						text: request.body.message,
					},
				],
				metadata: { createdAt: new Date(), admin: true },
			};

			const updatedMessages = [...thread.messages, newMessage];

			await fastify.db
				.update(threads)
				.set({
					messages: updatedMessages,
					helpNeeded: false,
					helpReason: null,
					updatedAt: sql`NOW()`,
				})
				.where(eq(threads.id, request.params.chatID));

			return reply.send({
				data: {
					message: newMessage,
					messagesCount: updatedMessages.length,
				},
			});
		},
	);
}
