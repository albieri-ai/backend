import type { FastifyInstance, FastifyServerOptions } from "fastify";
import { IngestYoutubeVideo } from "../../../../trigger/ingest";
import {
	trainingAssets,
	youtubeVideoAssets,
} from "../../../../database/schema";
import { personas } from "../../../../database/schema";
import { and, isNull, eq, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import {
	youtubeChannels,
	youtubeChannelsVideos,
} from "../../../../database/schema/youtube";
import {
	MonitorYoutubeChannel,
	MonitorYoutubeChannelSchedule,
} from "../../../../trigger/youtube";
import { schedules } from "@trigger.dev/sdk";
import axios from "axios";
import { adminOnly } from "../../../../lib/adminOnly";

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
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			const [persona] = await fastify.db
				.select()
				.from(personas)
				.where(
					and(
						eq(personas.slug, request.params.slug),
						isNull(personas.deletedAt),
					),
				);

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

				const { data } = await axios.get(
					`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`,
				);

				const title = data.items[0].snippet.title;

				await trx.insert(youtubeVideoAssets).values({
					asset: asset.id,
					url: request.body.url,
					title,
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

	fastify.get<{ Params: { slug: string } }>(
		"/accounts/youtube",
		{
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			const [persona] = await fastify.db
				.select()
				.from(personas)
				.where(
					and(
						eq(personas.slug, request.params.slug),
						isNull(personas.deletedAt),
					),
				);

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

	fastify.post<{
		Params: { slug: string };
		Body: { url: string; keepSynced: boolean };
	}>(
		"/accounts/youtube",
		{
			schema: {
				params: z.object({
					slug: z.string(),
				}),
				body: z.object({
					url: z.string().url(),
					keepSynced: z.boolean(),
				}),
			},
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			const [persona] = await fastify.db
				.select()
				.from(personas)
				.where(
					and(
						eq(personas.slug, request.params.slug),
						isNull(personas.deletedAt),
					),
				);

			const channel = await fastify.db.transaction(async (trx) => {
				const [channel] = await trx
					.insert(youtubeChannels)
					.values({
						persona: persona.id,
						url: request.body.url,
						keepSynced: request.body.keepSynced,
						createdBy: request.user!.id,
					})
					.returning();

				await MonitorYoutubeChannel.trigger(
					{
						id: channel.id,
						persona: persona.id,
						url: channel.url,
						createdBy: channel.createdBy,
					},
					{
						idempotencyKey: `monitor-youtube-channel-${persona.id}-${channel.id}`,
					},
				);

				if (request.body.keepSynced) {
					const schedule = await schedules.create({
						task: MonitorYoutubeChannelSchedule.id,
						externalId: channel.id,
						cron: "0 */5 * * *",
						timezone: "America/Sao_Paulo",
						deduplicationKey: `monitor-youtube-channel-${persona.id}-${channel.id}`,
					});

					await trx
						.update(youtubeChannels)
						.set({
							triggerId: schedule.id,
						})
						.where(eq(youtubeChannels.id, channel.id));
				}

				return channel;
			});

			reply.send({ data: channel });
		},
	);

	fastify.patch<{
		Params: {
			slug: string;
			accountId: string;
		};
		Body: {
			keepSynced: boolean;
		};
	}>(
		"/accounts/youtube/:accountId",
		{
			schema: {
				params: z.object({
					slug: z.string(),
					accountId: z.string(),
				}),
				body: z.object({
					keepSynced: z.boolean(),
				}),
			},
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			if (!request.user) {
				return reply.unauthorized();
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

			const [oldChannel] = await fastify.db
				.select()
				.from(youtubeChannels)
				.where(
					and(
						eq(youtubeChannels.id, request.params.accountId),
						eq(youtubeChannels.persona, persona.id),
						isNull(youtubeChannels.disabledAt),
					),
				);

			const [updatedChannel] = await fastify.db
				.update(youtubeChannels)
				.set({
					...request.body,
				})
				.where(
					and(
						eq(youtubeChannels.id, request.params.accountId),
						eq(youtubeChannels.persona, persona.id),
						isNull(youtubeChannels.disabledAt),
					),
				)
				.returning();

			if (!updatedChannel) {
				return reply.callNotFound();
			}

			if (updatedChannel.keepSynced && !oldChannel.keepSynced) {
				if (updatedChannel.triggerId) {
					await schedules.activate(updatedChannel.triggerId);
				} else {
					const schedule = await schedules.create({
						task: MonitorYoutubeChannelSchedule.id,
						externalId: updatedChannel.id,
						cron: "0 */5 * * *",
						timezone: "America/Sao_Paulo",
						deduplicationKey: `monitor-youtube-channel-${persona.id}-${updatedChannel.id}`,
					});

					await fastify.db
						.update(youtubeChannels)
						.set({
							triggerId: schedule.id,
						})
						.where(eq(youtubeChannels.id, updatedChannel.id));
				}
			} else if (!updatedChannel.keepSynced && oldChannel.keepSynced) {
				if (updatedChannel.triggerId) {
					await schedules.deactivate(updatedChannel.triggerId);
				}
			}

			return reply.status(204).send();
		},
	);

	fastify.delete<{
		Params: {
			slug: string;
			accountId: string;
		};
		Querystring: {
			remove_content: boolean;
		};
	}>(
		"/accounts/youtube/:accountId",
		{
			schema: {
				params: z.object({
					slug: z.string(),
					accountId: z.string(),
				}),
				querystring: z.object({
					remove_content: z.coerce.boolean().default(false),
				}),
			},
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			if (!request.user) {
				return reply.unauthorized();
			}

			const { persona } = request;

			if (!persona) {
				return reply.status(404).send({ error: "Persona not found" });
			}

			await fastify.db.transaction(async (trx) => {
				const channel = await trx
					.select()
					.from(youtubeChannels)
					.where(eq(youtubeChannels.id, request.params.accountId))
					.then(([res]) => res);

				await trx
					.update(youtubeChannels)
					.set({
						disabledBy: request.user!.id,
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
					await schedules.deactivate(channel.triggerId);
				}

				if (request.query.remove_content) {
					await trx
						.update(trainingAssets)
						.set({ deletedAt: sql`NOW()`, deletedBy: request.user!.id })
						.where(
							and(
								isNull(trainingAssets.deletedAt),
								inArray(
									trainingAssets.id,
									trx
										.select({ id: youtubeVideoAssets.asset })
										.from(youtubeVideoAssets)
										.leftJoin(
											youtubeChannelsVideos,
											eq(youtubeChannelsVideos.id, youtubeVideoAssets.videoId),
										)
										.where(
											eq(
												youtubeChannelsVideos.channel,
												request.params.accountId,
											),
										),
								),
							),
						);
				}
			});

			return reply.status(204).send();
		},
	);
}
