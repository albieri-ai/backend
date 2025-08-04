import type { FastifyInstance, FastifyServerOptions } from "fastify";
import { IngestYoutubeVideo } from "../../../trigger/ingest";

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	fastify.post("/assets", async (request, reply) => {
		if (!request.user) {
			return reply.unauthorized();
		}

		await IngestYoutubeVideo.trigger({
			assetID: "abc123",
			url: "https://www.youtube.com/watch?v=HRzbU3M1Wts",
		});

		reply.code(204).send();
	});
}
