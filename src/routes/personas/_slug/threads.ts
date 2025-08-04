import { and, desc, isNull, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyServerOptions } from "fastify";
import { personas, threads } from "../../../database/schema";
import type { PersonaBySlugSchema } from "./";
import type { z } from "zod";

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	fastify.get<{ Params: z.infer<typeof PersonaBySlugSchema> }>(
		"/threads",
		async (request, reply) => {
			if (!request.user) {
				return reply.unauthorized();
			}

			const personaSlug = request.params.slug;
			const [persona] = await fastify.db
				.select({ id: personas.id })
				.from(personas)
				.where(and(eq(personas.slug, personaSlug), isNull(personas.deletedAt)));

			if (!persona) {
				return reply.callNotFound();
			}

			const userThreads = await fastify.db.query.threads.findMany({
				columns: {
					id: true,
					title: true,
					createdAt: true,
					updatedAt: true,
				},
				with: {
					author: {
						columns: {
							id: true,
							name: true,
						},
					},
				},
				where: (threads) =>
					and(
						eq(threads.author, request.user!.id),
						eq(threads.persona, persona.id),
						isNull(threads.deletedAt),
					),
				orderBy: desc(threads.updatedAt),
			});

			reply.send({ data: userThreads });
		},
	);

	fastify.get<{
		Params: z.infer<typeof PersonaBySlugSchema> & { threadId: string };
	}>("/threads/:threadId", async (request, reply) => {
		if (!request.user) {
			return reply.unauthorized();
		}

		const personaSlug = request.params.slug;

		const [persona] = await fastify.db
			.select({ id: personas.id })
			.from(personas)
			.where(and(eq(personas.slug, personaSlug), isNull(personas.deletedAt)));

		if (!persona) {
			return reply.callNotFound();
		}

		const [thread] = await fastify.db
			.select()
			.from(threads)
			.where(
				and(
					eq(threads.persona, persona.id),
					eq(threads.author, request.user!.id),
					eq(threads.id, request.params.threadId),
					isNull(threads.deletedAt),
				),
			);

		if (!thread) {
			return reply.callNotFound();
		}

		reply.send({ data: thread });
	});

	fastify.delete<{
		Params: z.infer<typeof PersonaBySlugSchema> & { threadId: string };
	}>("/threads/:threadId", async (request, reply) => {
		if (!request.user) {
			return reply.unauthorized();
		}

		const [thread] = await fastify.db
			.select()
			.from(threads)
			.where(
				and(
					eq(threads.id, request.params.threadId),
					eq(threads.author, request.user!.id),
					isNull(threads.deletedAt),
				),
			);

		if (!thread) {
			return reply.callNotFound();
		}

		await fastify.db
			.update(threads)
			.set({ deletedAt: new Date(), deletedBy: request.user!.id })
			.where(eq(threads.id, thread.id));

		reply.status(204).send();
	});
}
