import { and, desc, isNull, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyServerOptions } from "fastify";
import { personas, threads } from "../../database/schema";

export default function (
  fastify: FastifyInstance,
  _opts: FastifyServerOptions,
) {
  fastify.get<{ Params: { personaSlug: string } }>(
    "/:personaSlug/threads",
    {
      preValidation: (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: "Unauthorized" });
        }
      },
    },
    async (request, reply) => {
      const personaSlug = request.params.personaSlug;
      const [persona] = await fastify.db
        .select({ id: personas.id })
        .from(personas)
        .where(and(eq(personas.slug, personaSlug), isNull(personas.deletedAt)));

      if (!persona) {
        return reply.code(404).send({ error: "Persona not found" });
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

  fastify.get<{ Params: { personaSlug: string; threadId: string } }>(
    "/:personaSlug/threads/:threadId",
    {
      preValidation: (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: "Unauthorized" });
        }
      },
    },
    async (request, reply) => {
      const personaSlug = request.params.personaSlug;

      const [persona] = await fastify.db
        .select({ id: personas.id })
        .from(personas)
        .where(and(eq(personas.slug, personaSlug), isNull(personas.deletedAt)));

      if (!persona) {
        return reply.code(404).send({ error: "Persona not found" });
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
        return reply.code(404).send({ error: "Thread not found" });
      }

      reply.send({ data: thread });
    },
  );

  fastify.delete<{ Params: { personaSlug: string; threadId: string } }>(
    "/:personaSlug/threads/:threadId",
    {
      preValidation: (request, reply) => {
        if (!request.user) {
          return reply.code(401).send({ error: "Unauthorized" });
        }
      },
    },
    async (request, reply) => {
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
        reply.code(404).send({ error: "Persona not found" });
        return;
      }

      await fastify.db
        .update(threads)
        .set({ deletedAt: new Date(), deletedBy: request.user!.id })
        .where(eq(threads.id, thread.id));

      reply.status(204).send();
    },
  );
}
