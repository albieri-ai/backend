import type { FastifyInstance, FastifyServerOptions } from "fastify";
import { IngestYoutubeVideo } from "../../../trigger/ingest";

export default function (
  fastify: FastifyInstance,
  _opts: FastifyServerOptions,
) {
  fastify.get("/", (_request, reply) => {
    reply.send({ message: "Hello from persona training!" });
  });

  fastify.post(
    "/assets",
    // {
    //   preValidation: (request, reply) => {
    //     if (!request.user) {
    //       return reply.code(401).send({ error: "Unauthorized" });
    //     }
    //   },
    // },
    async (request, reply) => {
      await IngestYoutubeVideo.trigger({
        assetID: "abc123",
        url: "https://www.youtube.com/watch?v=HRzbU3M1Wts",
      });

      reply.code(204).send();
    },
  );
}
