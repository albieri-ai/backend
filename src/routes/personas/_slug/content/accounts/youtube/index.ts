import type { FastifyInstance, FastifyServerOptions } from "fastify";
import {
	trainingAssets,
	youtubeChannelsVideoCount,
	youtubeVideoAssets,
} from "../../../../../../database/schema";
import { personas } from "../../../../../../database/schema";
import { and, isNull, eq, sql, inArray, getTableColumns } from "drizzle-orm";
import { z } from "zod";
import {
	youtubeChannels,
	youtubeChannelsVideos,
} from "../../../../../../database/schema/youtube";
import {
	ParseYoutubeChannel,
	MonitorYoutubeChannelSchedule,
} from "../../../../../../trigger/youtube";
import { schedules } from "@trigger.dev/sdk";
import { adminOnly } from "../../../../../../lib/adminOnly";
import axios from "axios";

const youtubeAPI = axios.create({
	baseURL: "https://www.googleapis.com/youtube/v3",
});

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	fastify.get<{ Params: { slug: string } }>(
		"/",
		{
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			const channels = await fastify.db
				.select({
					...getTableColumns(youtubeChannels),
					assetCount:
						sql`COALESCE(${youtubeChannelsVideoCount.count}, 0)::INTEGER`.as(
							"asset_count",
						),
				})
				.from(youtubeChannels)
				.leftJoin(
					youtubeChannelsVideoCount,
					eq(youtubeChannelsVideoCount.channel, youtubeChannels.id),
				)
				.where(
					and(
						eq(youtubeChannels.persona, request.persona!.id),
						isNull(youtubeChannels.disabledAt),
					),
				);

			return reply.send({ data: channels });
		},
	);

	fastify.post<{
		Params: { slug: string };
		Body: { channelID: string; keepSynced: boolean };
	}>(
		"/",
		{
			schema: {
				params: z.object({
					slug: z.string(),
				}),
				body: z.object({
					channelID: z.string(),
					keepSynced: z.boolean(),
				}),
			},
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			const { persona } = request;

			if (!persona) {
				return reply.callNotFound();
			}

			const { data } = await youtubeAPI.get<{
				items: {
					kind: string;
					etag: string;
					id: string;
					snippet: {
						title: string;
						description: string;
						customUrl: string;
						publishedAt: string;
						thumbnails: {
							default: {
								url: string;
								width: number;
								height: number;
							};
							medium: {
								url: string;
								width: number;
								height: number;
							};
							high: {
								url: string;
								width: number;
								height: number;
							};
						};
						localized: {
							title: string;
							description: string;
						};
						country: string;
					};
				}[];
			}>("/channels", {
				params: {
					part: "snippet,contentDetails",
					id: request.body.channelID,
					key: process.env.YOUTUBE_API_KEY,
				},
			});

			if (
				!data.items.length ||
				!data.items.find((d) => d.id === request.body.channelID)
			) {
				return reply.callNotFound();
			}

			const channel = await fastify.db.transaction(async (trx) => {
				const [channel] = await trx
					.insert(youtubeChannels)
					.values({
						persona: request.persona!.id,
						url: `https://www.youtube.com/${data.items[0].snippet.customUrl}`,
						name: data.items[0].snippet.title,
						channelID: request.body.channelID,
						thumbnailUrl:
							data.items[0].snippet.thumbnails.high.url ||
							data.items[0].snippet.thumbnails.default.url,
						keepSynced: request.body.keepSynced,
						createdBy: request.user!.id,
					})
					.returning();

				await ParseYoutubeChannel.trigger(
					{
						id: channel.id,
						persona: persona.id,
						channelID: channel.channelID,
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
		"/:accountId",
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
		"/:accountId",
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
											eq(
												youtubeChannelsVideos.id,
												youtubeVideoAssets.channelVideo,
											),
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
