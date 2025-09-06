import type { FastifyInstance, FastifyServerOptions } from "fastify";
import { adminOnly } from "../../../../../../lib/adminOnly";
import {
	trainingAssets,
	vimeoAccounts,
	vimeoVideoAssets,
} from "../../../../../../database/schema";
import { createId } from "@paralleldrive/cuid2";
import { Vimeo } from "vimeo";
import axios, { isAxiosError } from "axios";
import z from "zod";
import { and, eq, inArray } from "drizzle-orm";

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	const vimeo = new Vimeo(
		fastify.config.VIMEO_CLIENT_ID,
		fastify.config.VIMEO_CLIENT_SECRET,
	);

	const redirectUrl = `${fastify.config.APP_URL}/accounts/vimeo/callback`;

	fastify.post(
		"/",
		{
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			const state = createId();

			const connectedAccount = await fastify.db.query.vimeoAccounts.findFirst({
				where: (va, { isNull, eq, and }) =>
					and(eq(va.persona, request.persona!.id), isNull(va.disabledAt)),
			});

			if (connectedAccount) {
				return reply.status(409).send({ error: "Account already connected" });
			}

			const [account] = await fastify.db
				.insert(vimeoAccounts)
				.values({
					persona: request.persona!.id,
					state,
					createdBy: request.user!.id,
				})
				.onConflictDoUpdate({
					target: [vimeoAccounts.persona],
					set: {
						disabledAt: null,
						disabledBy: null,
						code: null,
						state,
					},
				})
				.returning();

			const oauthUrl = vimeo.buildAuthorizationEndpoint(
				redirectUrl,
				["public", "private"],
				state,
			);

			return reply.send({
				data: {
					...account,
					redirectUrl: oauthUrl,
				},
			});
		},
	);

	fastify.get<{ Params: { slug: string; id: string } }>(
		"/:id/videos",
		{
			schema: {
				params: z.object({
					persona: z.string(),
					id: z.string(),
				}),
				querystring: z.object({
					limit: z.coerce.number().int().positive().max(100).default(25),
					page: z.coerce.number().int().positive().default(1),
				}),
			},
			preHandler: [adminOnly(fastify)],
		},
		async (request, reply) => {
			const { id } = request.params as { id: string };
			const { limit = 25, page = 1 } = request.query as {
				limit?: number;
				page?: number;
			};

			// Find the vimeo account by ID
			const account = await fastify.db.query.vimeoAccounts.findFirst({
				where: (va, { eq, and, isNull }) =>
					and(
						eq(va.id, id),
						eq(va.persona, request.persona!.id),
						isNull(va.disabledAt),
					),
			});

			if (!account) {
				return reply.status(404).send({ error: "Vimeo account not found" });
			}

			if (!account.token) {
				return reply.status(400).send({ error: "Account not authenticated" });
			}

			try {
				// Fetch videos from Vimeo API
				const response = await axios.get("https://api.vimeo.com/me/videos", {
					headers: {
						Authorization: `Bearer ${account.token}`,
						Accept: "application/vnd.vimeo.*+json;version=3.4",
					},
					params: {
						per_page: limit,
						page: page,
						fields: "uri,name,pictures.sizes,download",
					},
				});

				// Transform the response to only include required fields
				const videos: {
					vimeoId: string;
					name: string;
					thumbnailUrl?: string;
					downloadUrl?: string;
					available: boolean;
				}[] = response.data.data.map((video: any) => {
					// Extract video ID from URI (format: /videos/123456789)
					const vimeoId = video.uri.split("/").pop();

					// Get thumbnail URL (preferring larger sizes)
					const thumbnailUrl =
						video.pictures?.sizes?.length > 0
							? video.pictures.sizes[video.pictures.sizes.length - 1]?.link
							: undefined;

					// Get download URL (preferring the highest quality)
					const downloadUrl =
						video.download?.length > 0
							? video.download[video.download.length - 1]?.link
							: undefined;

					return {
						vimeoId,
						name: video.name,
						thumbnailUrl,
						downloadUrl,
						available: !!downloadUrl,
					};
				});

				const videoIds = videos.map((video) => video.vimeoId);

				const videosAlreadyAdded = await fastify.db
					.select({
						id: vimeoVideoAssets.id,
						vimeoId: vimeoVideoAssets.vimeoId,
					})
					.from(vimeoVideoAssets)
					.leftJoin(
						trainingAssets,
						eq(trainingAssets.id, vimeoVideoAssets.asset),
					)
					.where(
						and(
							inArray(vimeoVideoAssets.vimeoId, videoIds),
							eq(trainingAssets.persona, account.persona),
						),
					);

				const videosAlreadyAddedMap = videosAlreadyAdded.reduce<
					Record<string, boolean>
				>((acc, vid) => {
					acc[vid.vimeoId] = true;

					return acc;
				}, {});

				const totalPages = Math.ceil(response.data.total / limit);
				const hasNextPage = page < totalPages;
				const hasPreviousPage = page > 1;

				return reply.send({
					data: videos.map((vid) => ({
						...vid,
						alreadyAdded: videosAlreadyAddedMap[vid.vimeoId] || false,
					})),
					pagination: {
						totalRecords: response.data.total,
						totalPages: totalPages,
						currentPage: page,
						pageSize: limit,
						nextPage: hasNextPage ? page + 1 : null,
						previousPage: hasPreviousPage ? page - 1 : null,
					},
				});
			} catch (error) {
				fastify.log.error("Error fetching Vimeo videos:", error);

				if (isAxiosError(error) && error.response?.status === 401) {
					return reply
						.status(401)
						.send({ error: "Invalid or expired Vimeo token" });
				}

				return reply
					.status(500)
					.send({ error: "Failed to fetch videos from Vimeo" });
			}
		},
	);
}
