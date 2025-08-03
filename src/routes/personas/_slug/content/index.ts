import type { FastifyInstance, FastifyServerOptions } from "fastify";
import {
	IngestYoutubeVideo,
	IngestPdfDocument,
} from "../../../../trigger/ingest";
import {
	trainingAssets,
	youtubeVideoAssets,
	fileAssets,
	files,
	members,
} from "../../../../database/schema";
import { personas } from "../../../../database/schema";
import { and, isNull, eq, sql } from "drizzle-orm";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod";
import { youtubeChannels } from "../../../../database/schema/youtube";
import { MonitorYoutubeChannel } from "../../../../trigger/youtube";
import { schedules } from "@trigger.dev/sdk/v3";

function extractYouTubeVideoId(urlString: string): string | null {
	try {
		const url = new URL(urlString);
		const hostname = url.hostname.replace(/^www\./, "");

		if (hostname === "youtu.be") {
			// Shortened URL: youtu.be/VIDEO_ID
			return url.pathname.slice(1);
		}

		if (
			hostname === "youtube.com" ||
			hostname === "m.youtube.com" ||
			hostname === "music.youtube.com"
		) {
			const path = url.pathname;

			// Standard URL: /watch?v=VIDEO_ID
			if (path === "/watch") {
				return url.searchParams.get("v");
			}

			// Embed URL: /embed/VIDEO_ID
			if (path.startsWith("/embed/")) {
				return path.split("/")[2];
			}

			// Shorts URL: /shorts/VIDEO_ID
			if (path.startsWith("/shorts/")) {
				return path.split("/")[2];
			}
		}

		return null; // Not a recognized video URL
	} catch {
		return null; // Invalid URL
	}
}

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	fastify.post<{ Params: { slug: string }; Body: { url: string } }>(
		"/assets/youtube-video",
		{
			schema: {
				params: z.object({
					slug: z.string(),
				}),
				body: z.object({
					url: z.string().url(),
				}),
			},
		},
		async (request, reply) => {
			if (!request.user) {
				return reply.code(401).send({ error: "Unauthorized" });
			}

			const [persona] = await fastify.db
				.select()
				.from(personas)
				.where(
					and(
						eq(personas.slug, request.params.slug),
						isNull(personas.deletedAt),
					),
				);

			if (!persona) {
				return reply.code(404).send({ error: "Not Found" });
			}

			const [organizationMember] = await fastify.db
				.select()
				.from(members)
				.where(
					and(
						eq(members.organizationId, persona.organization),
						eq(members.userId, request.user!.id),
					),
				);

			if (!organizationMember) {
				return reply.status(403).send({ error: "Forbidden" });
			}

			const asset = await fastify.db.transaction(async (trx) => {
				const asset = await trx
					.insert(trainingAssets)
					.values({
						type: "youtube_video",
						status: "pending",
						enabled: true,
						persona: persona.id,
						createdBy: request.user!.id,
					})
					.returning({ id: trainingAssets.id })
					.then(([res]) => res);

				const videoId = extractYouTubeVideoId(request.body.url);

				if (!videoId) {
					throw new Error("invalid url");
				}

				await trx.insert(youtubeVideoAssets).values({
					asset: asset.id,
					url: request.body.url,
					videoId,
				});

				return { id: asset.id, url: request.body.url };
			});

			await IngestYoutubeVideo.trigger({
				assetID: asset.id,
				url: asset.url,
			});

			reply.code(204).send();
		},
	);

	fastify.post<{ Params: { slug: string }; Body: { fileId: string } }>(
		"/assets/pdf",
		{
			schema: {
				params: z.object({
					slug: z.string(),
				}),
				body: z.object({
					fileId: z.string(),
				}),
			},
		},
		async (request, reply) => {
			if (!request.user) {
				return reply.code(401).send({ error: "Unauthorized" });
			}

			const [persona] = await fastify.db
				.select()
				.from(personas)
				.where(
					and(
						eq(personas.slug, request.params.slug),
						isNull(personas.deletedAt),
					),
				);

			if (!persona) {
				return reply.code(404).send({ error: "Not Found" });
			}

			const [organizationMember] = await fastify.db
				.select()
				.from(members)
				.where(
					and(
						eq(members.organizationId, persona.organization),
						eq(members.userId, request.user!.id),
					),
				);

			if (!organizationMember) {
				return reply.status(403).send({ error: "Forbidden" });
			}

			const asset = await fastify.db.transaction(async (trx) => {
				const asset = await trx
					.insert(trainingAssets)
					.values({
						type: "youtube_video",
						status: "pending",
						enabled: true,
						persona: persona.id,
						createdBy: request.user!.id,
					})
					.returning({ id: trainingAssets.id })
					.then(([res]) => res);

				await trx.insert(fileAssets).values({
					asset: asset.id,
					fileId: request.body.fileId,
				});

				const [file] = await trx
					.select()
					.from(files)
					.where(eq(files.id, request.body.fileId));

				return { id: asset.id, file };
			});

			const command = new GetObjectCommand({
				Bucket: fastify.config.AWS_S3_BUCKET,
				Key: asset.file.name,
			});

			const url = await getSignedUrl(fastify.s3, command, {
				expiresIn: 259200,
			});

			await IngestPdfDocument.trigger({
				assetID: asset.id,
				url: url,
			});

			reply.code(204).send();
		},
	);

	fastify.get<{ Params: { slug: string } }>(
		"/accounts/youtube",
		async (request, reply) => {
			if (!request.user) {
				return reply.code(401).send({ error: "Unauthorized" });
			}

			const [persona] = await fastify.db
				.select()
				.from(personas)
				.where(
					and(
						eq(personas.slug, request.params.slug),
						isNull(personas.deletedAt),
					),
				);

			if (!persona) {
				return reply.code(404).send({ error: "Not Found" });
			}

			const [organizationMember] = await fastify.db
				.select()
				.from(members)
				.where(
					and(
						eq(members.organizationId, persona.organization),
						eq(members.userId, request.user!.id),
					),
				);

			if (!organizationMember) {
				return reply.status(403).send({ error: "Forbidden" });
			}

			const channels = await fastify.db
				.select()
				.from(youtubeChannels)
				.where(
					and(
						eq(youtubeChannels.persona, persona.id),
						isNull(youtubeChannels.disabledAt),
					),
				);

			return reply.send({ data: channels });
		},
	);

	fastify.post<{ Params: { slug: string }; Body: { url: string } }>(
		"/accounts/youtube",
		{
			schema: {
				params: z.object({
					slug: z.string(),
				}),
				body: z.object({
					url: z.string().url(),
				}),
			},
		},
		async (request, reply) => {
			if (!request.user) {
				return reply.code(401).send({ error: "Unauthorized" });
			}

			const [persona] = await fastify.db
				.select()
				.from(personas)
				.where(
					and(
						eq(personas.slug, request.params.slug),
						isNull(personas.deletedAt),
					),
				);

			if (!persona) {
				return reply.code(404).send({ error: "Not Found" });
			}

			const [organizationMember] = await fastify.db
				.select()
				.from(members)
				.where(
					and(
						eq(members.organizationId, persona.organization),
						eq(members.userId, request.user!.id),
					),
				);

			if (!organizationMember) {
				return reply.status(403).send({ error: "Forbidden" });
			}

			const [channel] = await fastify.db
				.insert(youtubeChannels)
				.values({
					persona: persona.id,
					url: request.body.url,
					createdBy: request.user!.id,
				})
				.returning();

			const scheduledTask = await MonitorYoutubeChannel.trigger(
				{
					persona: persona.id,
					channelID: channel.id,
					url: channel.url,
					createdBy: channel.createdBy,
				},
				{
					idempotencyKey: `monitor-youtube-channel-${persona.id}-${channel.id}`,
				},
			);

			const schedule = await schedules.create({
				task: scheduledTask.id,
				externalId: `monitor-youtube-channel-${persona.id}-${channel.id}`,
				cron: "0 */5 * * *",
				timezone: "America/Sao_Paulo",
				deduplicationKey: `monitor-youtube-channel-${persona.id}-${channel.id}`,
			});

			await fastify.db
				.update(youtubeChannels)
				.set({
					triggerId: schedule.id,
				})
				.where(eq(youtubeChannels.id, channel.id));

			reply.send({ data: channel });
		},
	);

	fastify.delete<{
		Params: {
			slug: string;
			accountId: string;
		};
	}>(
		"/accounts/youtube/:accountId",
		{
			schema: {
				params: z.object({
					slug: z.string(),
					accountId: z.string(),
				}),
			},
		},
		async (request, reply) => {
			if (!request.user) {
				return reply.code(401).send({ error: "Unauthorized" });
			}

			const [persona] = await fastify.db
				.select()
				.from(personas)
				.where(
					and(
						eq(personas.slug, request.params.slug),
						isNull(personas.deletedAt),
					),
				);

			if (!persona) {
				return reply.code(404).send({ error: "Not Found" });
			}

			const [organizationMember] = await fastify.db
				.select()
				.from(members)
				.where(
					and(
						eq(members.organizationId, persona.organization),
						eq(members.userId, request.user!.id),
					),
				);

			if (!organizationMember) {
				return reply.status(403).send({ error: "Forbidden" });
			}

			const channel = await fastify.db
				.select()
				.from(youtubeChannels)
				.where(eq(youtubeChannels.id, request.params.accountId))
				.then(([res]) => res);

			await fastify.db
				.update(youtubeChannels)
				.set({
					disabledAt: sql`NOW()`,
				})
				.where(
					and(
						eq(youtubeChannels.id, request.params.accountId),
						eq(youtubeChannels.persona, persona.id),
						isNull(youtubeChannels.disabledAt),
					),
				);

			if (channel.triggerId) {
				await schedules.deactivate(channel.triggerId!);
			}

			return reply.status(204).send();
		},
	);
}
