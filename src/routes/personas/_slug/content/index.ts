import type { FastifyInstance, FastifyServerOptions } from "fastify";
import {
	IngestYoutubeVideo,
	IngestPdfDocument,
	IngestVideoFile,
} from "../../../../trigger/ingest";
import {
	trainingAssets,
	youtubeVideoAssets,
	fileAssets,
	files,
	webPageAssets,
} from "../../../../database/schema";
import { personas } from "../../../../database/schema";
import { and, isNull, eq, sql, count, asc, desc, ilike } from "drizzle-orm";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod";
import { youtubeChannels } from "../../../../database/schema/youtube";
import {
	MonitorYoutubeChannel,
	MonitorYoutubeChannelSchedule,
} from "../../../../trigger/youtube";
import { schedules } from "@trigger.dev/sdk/v3";
import axios from "axios";
import { PersonaBySlugSchema } from "..";
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

const ListAssetSchema = z.object({
	page: z.coerce.number().int().positive().default(1),
	limit: z.coerce.number().int().positive().default(10),
	query: z.string().optional(),
	orderBy: z
		.enum([
			"name:asc",
			"name:desc",
			"createdAt:asc",
			"createdAt:desc",
			"status:asc",
			"status:desc",
		])
		.optional()
		.default("name:asc"),
});

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	fastify.get<{
		Params: { slug: string };
		Querystring: z.infer<typeof ListAssetSchema>;
	}>(
		"/assets",
		{
			schema: {
				querystring: ListAssetSchema,
			},
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			if (!request.user) {
				return reply.unauthorized();
			}

			const assetList = fastify.db.$with("asset_list").as(
				fastify.db
					.select({
						id: trainingAssets.id,
						source: trainingAssets.type,
						name: sql`COALESCE(${youtubeVideoAssets.title}, ${files.originalName}, ${files.name}, ${webPageAssets.title})`.as(
							"name",
						),
						enabled: trainingAssets.enabled,
						status: trainingAssets.status,
						createdAt: trainingAssets.createdAt,
					})
					.from(trainingAssets)
					.leftJoin(
						youtubeVideoAssets,
						eq(youtubeVideoAssets.asset, trainingAssets.id),
					)
					.leftJoin(fileAssets, eq(fileAssets.asset, trainingAssets.id))
					.leftJoin(files, eq(files.id, fileAssets.fileId))
					.leftJoin(webPageAssets, eq(webPageAssets.asset, trainingAssets.id)),
			);

			let orderFn = [asc(assetList.name)];

			switch (request.query.orderBy) {
				case "name:desc":
					orderFn = [desc(assetList.name)];
					break;
				case "createdAt:asc":
					orderFn = [asc(assetList.createdAt), asc(assetList.name)];
					break;
				case "createdAt:desc":
					orderFn = [desc(assetList.createdAt), asc(assetList.name)];
					break;
				case "status:asc":
					orderFn = [asc(assetList.status), asc(assetList.name)];
					break;
				case "status:desc":
					orderFn = [desc(assetList.status), asc(assetList.name)];
					break;
				default:
					orderFn = [asc(assetList.name)];
					break;
			}

			const query = request.query.query
				? fastify.db
						.with(assetList)
						.select()
						.from(assetList)
						.where(ilike(assetList.name, `%${request.query.query}%`))
				: fastify.db.with(assetList).select().from(assetList);

			const assetCountQuery = request.query.query
				? fastify.db
						.with(assetList)
						.select({ count: count().as("count") })
						.from(assetList)
						.where(ilike(assetList.name, `%${request.query.query}%`))
				: fastify.db
						.with(assetList)
						.select({ count: count().as("count") })
						.from(assetList);

			const assets = await query
				.orderBy(...orderFn)
				.limit(request.query.limit)
				.offset(request.query.limit * (request.query.page - 1));

			const assetCount = await assetCountQuery.then((res) => res?.[0]?.count);

			const hasNextPage = assetCount > request.query.limit * request.query.page;
			const previousPage = Math.min(
				request.query.page - 1,
				Math.ceil(assetCount / request.query.limit),
			);
			const hasPreviousPage =
				previousPage > 0 && previousPage < request.query.page;

			return reply.send({
				data: assets,
				pagination: {
					totalRecords: assetCount,
					totalPages: Math.ceil(assetCount / request.query.limit),
					currentPage: request.query.page,
					pageSize: request.query.limit,
					nextPage: hasNextPage ? request.query.page + 1 : null,
					previousPage: hasPreviousPage ? request.query.page - 1 : null,
				},
			});
		},
	);

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

	fastify.post<{ Params: { slug: string }; Body: { fileId: string } }>(
		"/assets/file",
		{
			schema: {
				params: z.object({
					slug: z.string(),
				}),
				body: z.object({
					fileId: z.string(),
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
				const file = await fastify.db
					.select()
					.from(files)
					.where(eq(files.id, request.body.fileId))
					.then(([res]) => res);

				if (!file) {
					throw new Error("File not found");
				}

				const asset = await trx
					.insert(trainingAssets)
					.values({
						type: file.mimeType?.includes("video") ? "video_file" : "file",
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

				return { id: asset.id, file };
			});

			const command = new GetObjectCommand({
				Bucket: fastify.config.AWS_S3_BUCKET,
				Key: asset.file.name,
			});

			const url = await getSignedUrl(fastify.s3, command, {
				expiresIn: 259200,
			});

			if (asset.file.mimeType === "application/pdf") {
				await IngestPdfDocument.trigger({
					assetID: asset.id,
					url,
				});
			} else if (asset.file.mimeType.startsWith("video/")) {
				await IngestVideoFile.trigger({
					assetID: asset.id,
					url,
				});
			}

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
		Params: { slug: string; id: string };
		Body: { enabled: boolean };
	}>(
		"/assets/:id",
		{
			schema: {
				params: PersonaBySlugSchema.extend({
					id: z.string(),
				}),
				body: z.object({
					enabled: z.boolean(),
				}),
			},
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			const updatedAsset = await fastify.db
				.update(trainingAssets)
				.set(request.body)
				.where(and(eq(trainingAssets.id, request.params.id)))
				.returning()
				.then(([res]) => res);

			if (!updatedAsset) {
				return reply.callNotFound();
			}

			reply.send({
				data: updatedAsset,
			});
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
	}>(
		"/accounts/youtube/:accountId",
		{
			schema: {
				params: z.object({
					slug: z.string(),
					accountId: z.string(),
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
				await schedules.deactivate(channel.triggerId);
			}

			return reply.status(204).send();
		},
	);
}
