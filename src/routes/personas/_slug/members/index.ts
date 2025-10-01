import type { FastifyInstance, FastifyServerOptions } from "fastify";
import { adminOnly } from "../../../../lib/adminOnly";
import { threads, userMessages, users } from "../../../../database/schema";
import {
	and,
	asc,
	count,
	countDistinct,
	desc,
	eq,
	isNotNull,
	isNull,
	max,
	min,
	sum,
} from "drizzle-orm";
import { z } from "zod";

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	fastify.get<{
		Params: { slug: string };
		Querystring: {
			limit: number;
			page: number;
			orderBy:
				| "name:asc"
				| "name:desc"
				| "email:asc"
				| "email:desc"
				| "messageCount:asc"
				| "messageCount:desc"
				| "wordCount:asc"
				| "wordCount:desc"
				| "lastMessage:asc"
				| "lastMessage:desc"
				| "threadCount:asc"
				| "threadCount:desc"
				| "firstMessage:asc"
				| "firstMessage:desc";
		};
	}>(
		"/",
		{
			preHandler: [adminOnly(fastify)],
			schema: {
				querystring: z.object({
					limit: z.coerce.number().int().positive().default(1),
					page: z.coerce.number().int().positive().default(1),
					orderBy: z.enum([
						"name:asc",
						"name:desc",
						"email:asc",
						"email:desc",
						"messageCount:asc",
						"messageCount:desc",
						"wordCount:asc",
						"wordCount:desc",
						"threadCount:asc",
						"threadCount:desc",
						"firstMessage:asc",
						"firstMessage:desc",
						"lastMessage:asc",
						"lastMessage:desc",
					]),
				}),
			},
		},
		async (request, reply) => {
			const personaMembers = fastify.db.$with("persona_members").as(
				fastify.db
					.selectDistinct({
						author: threads.author,
						persona: threads.persona,
					})
					.from(threads)
					.where(eq(threads.persona, request.persona!.id)),
			);

			const userStatistics = fastify.db.$with("user_statistics").as(
				fastify.db
					.select({
						author: userMessages.author,
						persona: userMessages.persona,
						count: count().as("count"),
						words: sum(userMessages.wordCount).as("word_count"),
						lastMessage: max(userMessages.date).as("last_message"),
						firstMessage: min(userMessages.date).as("first_message"),
						threadCount: countDistinct(userMessages.thread).as("thread_count"),
					})
					.from(userMessages)
					.where(eq(userMessages.persona, request.persona!.id))
					.groupBy(userMessages.author, userMessages.persona),
			);

			let order = [asc(users.name)];

			switch (request.query.orderBy) {
				case "email:asc":
					order = [asc(users.name)];
					break;
				case "email:desc":
					order = [desc(users.name)];
					break;
				case "lastMessage:asc":
					order = [asc(userStatistics.lastMessage), asc(users.name)];
					break;
				case "lastMessage:desc":
					order = [desc(userStatistics.lastMessage), asc(users.name)];
					break;
				case "firstMessage:asc":
					order = [asc(userStatistics.firstMessage), asc(users.name)];
					break;
				case "firstMessage:desc":
					order = [desc(userStatistics.firstMessage), asc(users.name)];
					break;
				case "threadCount:asc":
					order = [asc(userStatistics.threadCount), asc(users.name)];
					break;
				case "threadCount:desc":
					order = [desc(userStatistics.threadCount), asc(users.name)];
					break;
				case "messageCount:asc":
					order = [asc(userStatistics.count), asc(users.name)];
					break;
				case "messageCount:desc":
					order = [desc(userStatistics.count), asc(users.name)];
					break;
				case "wordCount:asc":
					order = [asc(userStatistics.words), asc(users.name)];
					break;
				case "wordCount:desc":
					order = [desc(userStatistics.words), asc(users.name)];
					break;
				case "name:desc":
					order = [desc(users.name), asc(users.name)];
					break;
				// case "name:asc":
				default:
					order = [asc(users.name), asc(users.name)];
					break;
			}

			const personaUsers = await fastify.db
				.with(personaMembers, userStatistics)
				.select({
					id: users.id,
					name: users.name,
					isAnonymous: users.isAnonymous,
					email: users.email,
					emailVerified: users.emailVerified,
					createdAt: users.createdAt,
					updatedAt: users.updatedAt,
					messageCount: userStatistics.count,
					wordCount: userStatistics.words,
					lastMessage: userStatistics.lastMessage,
					firstMessage: userStatistics.firstMessage,
					threadCount: userStatistics.threadCount,
				})
				.from(personaMembers)
				.leftJoin(
					userStatistics,
					and(
						eq(userStatistics.author, personaMembers.author),
						eq(userStatistics.persona, personaMembers.persona),
					),
				)
				.leftJoin(users, eq(personaMembers.author, users.id))
				.where(
					and(
						isNotNull(userStatistics.author),
						isNotNull(personaMembers.author),
					),
				)
				.limit(request.query.limit)
				.offset((request.query.page - 1) * request.query.limit)
				.orderBy(...order);

			const userCount = await fastify.db
				.with(personaMembers)
				.select({ count: countDistinct(personaMembers.author).as("count") })
				.from(personaMembers)
				.then((res) => res?.[0]?.count || 0);

			const hasNextPage = userCount > request.query.limit * request.query.page;
			const previousPage = Math.min(
				request.query.page - 1,
				Math.ceil(userCount / request.query.limit),
			);
			const hasPreviousPage =
				previousPage > 0 && previousPage < request.query.page;

			return reply.send({
				data: personaUsers,
				pagination: {
					totalRecords: userCount,
					totalPages: Math.ceil(userCount / request.query.limit),
					currentPage: request.query.page,
					pageSize: request.query.limit,
					nextPage: hasNextPage ? request.query.page + 1 : null,
					previousPage: hasPreviousPage ? request.query.page - 1 : null,
				},
			});
		},
	);

	fastify.get<{
		Querystring: {
			page: number;
			limit: number;
			orderBy: "createdAt:desc" | "createdAt:asc";
		};
		Params: { slug: string };
	}>(
		"/threads",
		{
			schema: {
				querystring: z.object({
					page: z.coerce.number().int().positive().default(1),
					limit: z.coerce.number().int().positive().default(10),
					orderBy: z
						.enum(["createdAt:desc", "createdAt:asc"])
						.default("createdAt:desc"),
				}),
			},
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			const { persona } = request;

			if (!persona?.id) {
				return reply.status(404).send({ error: "Persona not found" });
			}

			const memberThreads = await fastify.db.query.threads.findMany({
				columns: {
					persona: false,
					author: false,
					model: false,
					deletedAt: false,
					deletedBy: false,
				},
				with: {
					persona: {
						columns: {
							id: true,
							name: true,
							slug: true,
						},
					},
					author: {
						columns: {
							id: true,
							name: true,
							isAnonymous: true,
						},
					},
				},
				where: (p, { eq, and, isNull }) =>
					and(eq(p.persona, persona.id), isNull(p.deletedAt)),
				orderBy: (p, { desc, asc }) => {
					if (request.query.orderBy === "createdAt:desc") {
						return desc(p.createdAt);
					}
					return asc(p.createdAt);
				},
				limit: request.query.limit,
				offset: (request.query.page - 1) * request.query.limit,
			});

			const threadCount = await fastify.db
				.select({ count: count().as("count") })
				.from(threads)
				.where(and(eq(threads.persona, persona.id), isNull(threads.deletedAt)))
				.then((res) => res?.[0]?.count);
			const hasNextPage =
				threadCount > request.query.limit * request.query.page;
			const previousPage = Math.min(
				request.query.page - 1,
				Math.ceil(threadCount / request.query.limit),
			);
			const hasPreviousPage =
				previousPage > 0 && previousPage < request.query.page;

			const threadData = memberThreads.map((t) => ({
				...t,
				lastMessage: t.messages[t.messages.length - 1],
				messages: undefined,
			}));

			return reply.send({
				data: threadData,
				pagination: {
					pagination: {
						totalRecords: threadCount,
						totalPages: Math.ceil(threadCount / request.query.limit),
						currentPage: request.query.page,
						pageSize: request.query.limit,
						nextPage: hasNextPage ? request.query.page + 1 : null,
						previousPage: hasPreviousPage ? request.query.page - 1 : null,
					},
				},
			});
		},
	);
}
