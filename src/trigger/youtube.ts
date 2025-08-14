import { task } from "@trigger.dev/sdk/v3";
import axios from "axios";
import { createDb } from "../database/db";
import { youtubeChannelsVideos } from "../database/schema/youtube";
import { IngestYoutubeVideo } from "./ingest";
import { trainingAssets, youtubeVideoAssets } from "../database/schema";
import { eq, and, inArray, getTableColumns } from "drizzle-orm";

const youtubeAPI = axios.create({
	baseURL: "https://www.googleapis.com/youtube/v3",
});

export const MonitorYoutubeChannel = task({
	id: "monitor-youtube-channel",
	run: async (
		payload: {
			persona: string;
			channelID: string;
			url: string;
			createdBy: string;
		},
		// { ctx },
	) => {
		const channelUrl = new URL(payload.url);

		const path = channelUrl.pathname.replace(/^\/+|\/+$/g, "");
		let channelID: string | undefined;

		if (path.startsWith("channel/")) {
			channelID = path.split("/")[1]; // already in format /channel/CHANNEL_ID
		} else {
			const searchQuery = path.startsWith("@")
				? path
				: path.split("/")[1] || path;

			const { data } = await youtubeAPI.get("/search", {
				params: {
					part: "snippet",
					type: "channel",
					q: encodeURIComponent(searchQuery),
					key: process.env.YOUTUBE_API_KEY,
				},
			});

			channelID = data.items[0]?.snippet?.channelId;
		}

		if (!channelID) {
			throw new Error("invalid channel url");
		}

		const { data } = await axios.get("/channels", {
			params: {
				part: "contentDetails",
				id: channelID,
				key: process.env.YOUTUBE_API_KEY,
			},
		});

		const playlistID = data.items[0]?.contentDetails?.relatedPlaylists?.uploads;

		let nextPageToken: string | undefined;

		const channelVideos: {
			videoId: string;
			title: string;
			publishedAt: string;
		}[] = [];

		do {
			const { data } = await axios.get("/playlistItems", {
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

		const { db } = await createDb({
			connectionString: process.env.DATABASE_URL!,
		});

		if (channelVideos.length) {
			const videoRecords = await db.transaction(async (trx) => {
				const insertedRecords = await trx
					.insert(youtubeChannelsVideos)
					.values(
						channelVideos.map((c) => ({
							channel: payload.channelID,
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
							eq(trainingAssets.persona, payload.persona),
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
							persona: payload.persona,
							createdBy: payload.createdBy,
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

			await Promise.all(
				videoRecords.map((vid) => {
					IngestYoutubeVideo.trigger({
						assetID: vid.asset,
						url: vid.url,
					});
				}),
			);
		}
	},
});
