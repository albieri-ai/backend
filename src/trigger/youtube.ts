import { schedules, task } from "@trigger.dev/sdk";
import axios from "axios";
import { createDb } from "../database/db";
import {
	youtubeChannels,
	youtubeChannelsVideos,
} from "../database/schema/youtube";
import { IngestYoutubeVideo } from "./ingest";
import { trainingAssets, youtubeVideoAssets } from "../database/schema";
import {
	eq,
	and,
	inArray,
	getTableColumns,
	isNull,
	type InferSelectModel,
} from "drizzle-orm";

const youtubeAPI = axios.create({
	baseURL: "https://www.googleapis.com/youtube/v3",
});

export const ParseYoutubeChannel = task({
	id: "parse-youtube-channel-task",
	run: async (
		channel: Pick<
			InferSelectModel<typeof youtubeChannels>,
			"id" | "persona" | "channelID" | "createdBy"
		>,
	) => {
		if (!channel.channelID) {
			throw new Error("invalid channel url");
		}

		const { data } = await youtubeAPI.get("/channels", {
			params: {
				part: "snippet,contentDetails",
				id: channel.channelID,
				key: process.env.YOUTUBE_API_KEY,
			},
		});

		if (!data.items.length) {
			throw new Error("invalid channel id");
		}

		const { db } = await createDb({
			connectionString: process.env.DATABASE_URL!,
		});

		await db
			.update(youtubeChannels)
			.set({
				name: data.items[0].snippet.title,
				thumbnailUrl:
					data.items[0].snippet.thumbnails.high.url ||
					data.items[0].snippet.thumbnails.default.url,
			})
			.where(eq(youtubeChannels.id, channel.id));

		const playlistID = data.items[0]?.contentDetails?.relatedPlaylists?.uploads;

		let nextPageToken: string | undefined;

		const channelVideos: {
			videoId: string;
			title: string;
			publishedAt: string;
		}[] = [];

		do {
			const { data } = await youtubeAPI.get("/playlistItems", {
				params: {
					part: "snippet",
					playlistId: playlistID,
					maxResults: 50,
					pageToken: nextPageToken,
					key: process.env.YOUTUBE_API_KEY,
				},
			});

			channelVideos.push(
				...data.items.map(
					(it: {
						snippet: {
							title: string;
							resourceId: { videoId: string };
							publishedAt: string;
						};
					}) => ({
						videoId: it.snippet.resourceId.videoId,
						title: it.snippet.title,
						publishedAt: it.snippet.publishedAt,
					}),
				),
			);

			nextPageToken = data.nextPageToken || "";
		} while (nextPageToken);

		if (channelVideos.length) {
			const videoRecords = await db.transaction(async (trx) => {
				const insertedRecords = await trx
					.insert(youtubeChannelsVideos)
					.values(
						channelVideos.map((c) => ({
							channel: channel.id,
							videoId: c.videoId,
							title: c.title,
							publishedAt: new Date(c.publishedAt),
						})),
					)
					.onConflictDoNothing({
						target: [
							youtubeChannelsVideos.channel,
							youtubeChannelsVideos.videoId,
						],
					})
					.returning();

				const videosAlreadyAdded = await trx
					.select({ ...getTableColumns(youtubeVideoAssets) })
					.from(youtubeVideoAssets)
					.leftJoin(
						trainingAssets,
						eq(trainingAssets.id, youtubeVideoAssets.asset),
					)
					.where(
						and(
							eq(trainingAssets.persona, channel.persona),
							inArray(
								youtubeVideoAssets.videoId,
								insertedRecords.map((i) => i.videoId),
							),
						),
					);

				const videosAlreadyAddedMap = videosAlreadyAdded.reduce<
					Record<string, number>
				>((acc, vid) => {
					if (vid.videoId) {
						acc[vid.videoId] = vid.id;
					}

					return acc;
				}, {});

				const previousUploadedVideosWithoutChannelId =
					videosAlreadyAdded.filter((v) => !v.channelVideo);

				const newVideos = insertedRecords.filter(
					(i) => !videosAlreadyAddedMap[i.videoId],
				);

				const assets = await trx
					.insert(trainingAssets)
					.values(
						newVideos.map(() => ({
							type: "youtube_video" as const,
							status: "pending" as const,
							enabled: true,
							persona: channel.persona,
							createdBy: channel.createdBy,
						})),
					)
					.returning();

				const channelVideoIdMap = insertedRecords.reduce<
					Record<string, number>
				>((acc, vid) => {
					acc[vid.videoId] = vid.id;

					return acc;
				}, {});

				const videoRecords = await trx
					.insert(youtubeVideoAssets)
					.values(
						newVideos.map((v, index) => ({
							asset: assets[index].id,
							url: `https://www.youtube.com/watch?v=${v.videoId}`,
							title: v.title || "Título não disponível",
							videoId: v.videoId,
							channelVideo: channelVideoIdMap[v.videoId],
						})),
					)
					.returning();

				if (previousUploadedVideosWithoutChannelId.length) {
					for (const vid of previousUploadedVideosWithoutChannelId) {
						await trx
							.update(youtubeVideoAssets)
							.set({
								channelVideo: channelVideoIdMap[vid.videoId],
							})
							.where(eq(youtubeVideoAssets.id, vid.id));
					}
				}

				return videoRecords;
			});

			if (videoRecords.length) {
				let index = 0;
				const step = 500;

				while (index <= videoRecords.length) {
					const chunk = videoRecords.slice(index, index + step);

					if (chunk.length > 0) {
						await IngestYoutubeVideo.batchTrigger(
							chunk.map((vid) => ({
								payload: {
									assetID: vid.asset,
									url: vid.url,
								},
							})),
						);
					}

					index += step;
				}
			}
		}
	},
});

export const MonitorYoutubeChannelSchedule = schedules.task({
	id: "monitor-youtube-channel-schedule",
	run: async (payload) => {
		if (!payload.externalId) {
			throw new Error("invalid schedule");
		}

		const { db } = await createDb({
			connectionString: process.env.DATABASE_URL!,
		});

		const [channel] = await db
			.select()
			.from(youtubeChannels)
			.where(
				and(
					eq(youtubeChannels.id, payload.externalId!),
					isNull(youtubeChannels.disabledAt),
				),
			);

		if (!channel) {
			throw new Error("channel not found");
		}

		if (!channel.channelID) {
			throw new Error("invalid channel url");
		}

		await ParseYoutubeChannel.trigger(channel);
	},
});
