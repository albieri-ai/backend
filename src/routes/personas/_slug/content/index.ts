import type { FastifyInstance, FastifyServerOptions } from "fastify";
import { IngestPdfDocument, IngestVideoFile } from "../../../../trigger/ingest";
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
import { PersonaBySlugSchema } from "..";
import { adminOnly } from "../../../../lib/adminOnly";

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
					.leftJoin(webPageAssets, eq(webPageAssets.asset, trainingAssets.id))
					.where(
						and(
							eq(trainingAssets.persona, request.persona!.id),
							isNull(trainingAssets.deletedAt),
						),
					),
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
				.offset(request.query.limit * (request.query.page - 1))
				.catch((err) => {
					console.error(err);

					throw err;
				});

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
				.where(
					and(
						eq(trainingAssets.id, request.params.id),
						isNull(trainingAssets.deletedAt),
					),
				)
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
}
