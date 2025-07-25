import type { FastifyInstance, FastifyServerOptions } from "fastify";
import {
  members,
  organizations,
  personas,
  personaTopics,
  topics,
} from "../../database/schema";
import { z } from "zod";
import { and, isNull, eq, getTableColumns, notInArray } from "drizzle-orm";

const PersonaBySlugSchema = z.object({
  personaSlug: z.string(),
});

const PersonaCreateSchema = z.object({
  name: z.string().min(3).max(64),
  slug: z.string().min(3).max(64),
  photo: z.string(),
  title: z.string().min(3).max(64).optional(),
  description: z.string().optional(),
});

const PersonaUpdateSchema = z.object({});

export default function (
  fastify: FastifyInstance,
  _opts: FastifyServerOptions,
) {
  const getPersonaBySlug = async (slug: string) => {
    const persona = await fastify.db.query.personas.findFirst({
      columns: {
        photo: false,
      },
      with: {
        photo: {
          columns: {
            id: true,
            name: true,
            originalName: true,
            mimeType: true,
            size: true,
            checksum: true,
          },
        },
        topics: {
          columns: {},
          with: {
            topic: {
              columns: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      where: (personas) =>
        and(eq(personas.slug, slug), isNull(personas.deletedAt)),
    });

    if (!persona) {
      return null;
    }

    return {
      ...persona,
      photo: {
        ...persona.photo,
        url: `${fastify.config.SERVICE_URL}/storage/files/${persona.photo.id}`,
      },
      topics: persona.topics.map((t) => t.topic),
    };
  };

  fastify.get("/", (request, reply) => {
    reply.send({ message: "Hello from persona!" });
  });

  // fastify.get<{ Params: z.infer<typeof PersonaBySlugSchema> }>(
  //   "/:personaSlug",
  //   {
  //     schema: {
  //       params: PersonaBySlugSchema,
  //     },
  //   },
  //   async (request, reply) => {
  //     const persona = await getPersonaBySlug(request.params.personaSlug);

  //     if (!persona) {
  //       reply.status(404).send({ message: "Persona not found" });

  //       return;
  //     }

  //     reply.send({
  //       data: persona,
  //     });

  //     reply.send({ message: "Hello from persona!" });
  //   },
  // );

  // fastify.post<{
  //   Body: z.infer<typeof PersonaCreateSchema>;
  // }>(
  //   "/",
  //   {
  //     schema: {
  //       body: z.toJSONSchema(PersonaCreateSchema),
  //     },
  //     preValidation: (request, reply) => {
  //       if (!request.user) {
  //         return reply.code(401).send({ error: "Unauthorized" });
  //       }
  //     },
  //   },
  //   async (request, reply) => {
  //     const userOrganizations = await fastify.db
  //       .select({ ...getTableColumns(organizations) })
  //       .from(members)
  //       .leftJoin(organizations, eq(organizations.id, members.organizationId))
  //       .where(eq(members.userId, request.user!.id));

  //     if (userOrganizations.length > 0) {
  //       reply.code(400).send({ error: "User already has an organization" });

  //       return;
  //     }

  //     await fastify.db.transaction(async (trx) => {
  //       const organization = await fastify.auth.api.createOrganization({
  //         body: {
  //           name: request.body.name,
  //           slug: request.body.slug,
  //           userId: request.user!.id,
  //         },
  //       });

  //       if (!organization) {
  //         reply.code(500).send({ error: "Failed to create organization" });

  //         return;
  //       }

  //       await trx.insert(personas).values({
  //         ...request.body,
  //         organization: organization.id,
  //         createdBy: request.user!.id,
  //       });
  //     });

  //     const createdPersona = await getPersonaBySlug(request.body.slug);

  //     reply.code(201).send({ data: createdPersona });
  //   },
  // );

  // fastify.patch<{
  //   Params: z.infer<typeof PersonaBySlugSchema>;
  //   Body: z.infer<typeof PersonaUpdateSchema>;
  // }>(
  //   "/:personaSlug",
  //   {
  //     schema: {
  //       params: z.toJSONSchema(PersonaBySlugSchema),
  //       body: z.toJSONSchema(PersonaUpdateSchema),
  //     },
  //     preValidation: (request, reply) => {
  //       if (!request.user) {
  //         return reply.code(401).send({ error: "Unauthorized" });
  //       }
  //     },
  //   },
  //   async (request, reply) => {
  //     const isMember = await fastify.db
  //       .select({ id: members.id })
  //       .from(members)
  //       .leftJoin(organizations, eq(organizations.id, members.organizationId))
  //       .leftJoin(personas, eq(personas.organization, personas.id))
  //       .where(
  //         and(
  //           eq(personas.slug, request.params.personaSlug),
  //           isNull(personas.deletedAt),
  //         ),
  //       )
  //       .then((res) => res.length > 0);

  //     if (!isMember) {
  //       return reply.code(403).send({ error: "Forbidden" });
  //     }

  //     await fastify.db.transaction(async (trx) => {
  //       await trx
  //         .update(personas)
  //         .set(request.body)
  //         .where(eq(personas.slug, request.params.personaSlug))
  //         .returning();

  //       if (request.body.name || request.body.slug) {
  //         await trx
  //           .update(organizations)
  //           .set({
  //             ...("name" in request.body ? { name: request.body.name } : {}),
  //             ...("slug" in request.body ? { slug: request.body.slug } : {}),
  //           })
  //           .where(eq(organizations.id, personas.organization))
  //           .returning();
  //       }
  //     });

  //     const updatedPersona = await getPersonaBySlug(request.params.personaSlug);

  //     reply.send({ data: updatedPersona });
  //   },
  // );

  // fastify.put<{
  //   Body: { topics: number[] };
  //   Params: z.infer<typeof PersonaBySlugSchema>;
  // }>(
  //   "/:personaSlug/topics",
  //   {
  //     schema: {
  //       body: z.toJSONSchema(
  //         z.object({
  //           topics: z.array(z.number().positive()),
  //         }),
  //       ),
  //       params: z.toJSONSchema(PersonaBySlugSchema),
  //     },
  //   },
  //   async (request, reply) => {
  //     const updatedTopics = await fastify.db.transaction(async (trx) => {
  //       const [persona] = await trx
  //         .select({ id: personas.id })
  //         .from(personas)
  //         .where(
  //           and(
  //             eq(personas.slug, request.params.personaSlug),
  //             isNull(personas.deletedAt),
  //           ),
  //         );

  //       if (!persona) {
  //         reply.status(404).send({ error: "Persona not found" });

  //         return;
  //       }

  //       await trx
  //         .delete(personaTopics)
  //         .where(
  //           and(
  //             eq(personaTopics.persona, persona.id),
  //             notInArray(personaTopics.topic, request.body.topics),
  //           ),
  //         );

  //       await trx
  //         .insert(personaTopics)
  //         .values(
  //           request.body.topics.map((topic) => ({
  //             persona: persona.id,
  //             topic,
  //           })),
  //         )
  //         .onConflictDoNothing({
  //           target: [personaTopics.persona, personaTopics.topic],
  //         });

  //       return trx
  //         .select({ id: topics.id, name: topics.name })
  //         .from(personaTopics)
  //         .leftJoin(topics, eq(topics.id, personaTopics.topic))
  //         .where(eq(personaTopics.persona, persona.id));
  //     });

  //     return updatedTopics;
  //   },
  // );
}
