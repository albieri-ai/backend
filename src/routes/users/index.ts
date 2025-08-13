import type { FastifyInstance, FastifyServerOptions } from "fastify";
import * as z from "zod";
import mime from "mime-types";
import {
	CompleteMultipartUploadCommand,
	CreateMultipartUploadCommand,
	GetObjectCommand,
	PutObjectCommand,
	UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createId } from "@paralleldrive/cuid2";
import { files, users } from "../../database/schema";
import { eq } from "drizzle-orm";

export default function (
	fastify: FastifyInstance,
	_opts: FastifyServerOptions,
) {
	fastify.get<{ Params: { userId: string } }>(
		"/:userId/avatar/url",
		{
			schema: {
				params: z.object({
					userId: z.string(),
				}),
			},
		},
		async (request, reply) => {
			const [user] = await fastify.db
				.select()
				.from(users)
				.where(eq(users.id, request.params.userId));

			if (!user?.avatarId) {
				return reply.callNotFound();
			}

			const [file] = await fastify.db
				.select({
					id: files.id,
					name: files.originalName,
					mimeType: files.mimeType,
					visibility: files.visibility,
					status: files.status,
					size: files.size,
					checksum: files.checksum,
					createdBy: files.createdBy,
					createdAt: files.createdAt,
				})
				.from(files)
				.where(eq(files.id, user.avatarId));

			if (!file) {
				return reply.callNotFound();
			}

			const command = new GetObjectCommand({
				Bucket: fastify.config.AWS_S3_BUCKET,
				Key: file.name,
			});

			const url = await getSignedUrl(fastify.s3, command, {
				expiresIn: 360,
			});

			return reply.redirect(url);
		},
	);
}
