// import type { FastifyInstance, FastifyServerOptions } from "fastify";
// import * as z from "zod";
// import mime from "mime-types";
// import {
//   CompleteMultipartUploadCommand,
//   CreateMultipartUploadCommand,
//   GetObjectCommand,
//   PutObjectCommand,
//   UploadPartCommand,
// } from "@aws-sdk/client-s3";
// import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
// import { createId } from "@paralleldrive/cuid2";
// import { files } from "../../database/schema";
// import { eq } from "drizzle-orm";

// const GenerateSignedUrlBodySchema = z.object({
//   name: z.string(),
// });

// const GetFileByIdParamsSchema = z.object({
//   fileId: z.string(),
// });

// const CreateMultipartUploadBodySchema = z.object({
//   name: z.string(),
// });

// const CreateMultipartUploadPartBodySchema = z.object({
//   key: z.string(),
//   partNumber: z.number(),
//   uploadId: z.string(),
// });

// const CommitMultipartUploadBodySchema = z.object({
//   key: z.string(),
//   uploadId: z.string(),
//   parts: z.array(
//     z.object({
//       partNumber: z.number(),
//       etag: z.string(),
//     }),
//   ),
// });

// export default function (
//   fastify: FastifyInstance,
//   _opts: FastifyServerOptions,
// ) {
//   fastify.get<{ Params: z.infer<typeof GetFileByIdParamsSchema> }>(
//     "/files/:fileId",
//     {
//       schema: {
//         params: z.toJSONSchema(GetFileByIdParamsSchema),
//       },
//     },
//     async (request, reply) => {
//       const [file] = await fastify.db
//         .select()
//         .from(files)
//         .where(eq(files.id, request.params.fileId));

//       if (!file) {
//         return reply.code(404).send({ error: "File not found" });
//       }

//       const command = new GetObjectCommand({
//         Bucket: fastify.config.AWS_S3_BUCKET,
//         Key: file.name,
//       });

//       const url = await getSignedUrl(fastify.s3, command, {
//         expiresIn: 360,
//       });

//       return reply.redirect(url);
//     },
//   );

//   fastify.post<{ Body: z.infer<typeof GenerateSignedUrlBodySchema> }>(
//     "/signed-url",
//     {
//       preValidation: (request, reply) => {
//         if (!request.user) {
//           return reply.code(401).send({ error: "Unauthorized" });
//         }
//       },
//       schema: {
//         body: z.toJSONSchema(GenerateSignedUrlBodySchema),
//       },
//     },
//     async (request, reply) => {
//       const mimeType = mime.lookup(request.body.name);
//       const extension = mime.extension(request.body.name);

//       const key = `${createId()}.${extension}`;

//       if (!mimeType) {
//         return reply.code(400).send({ error: "Invalid file" });
//       }

//       await fastify.db.transaction(async (trx) => {
//         await trx.insert(files).values({
//           name: key,
//           originalName: request.body.name,
//           mimeType: mimeType!,
//           bucket: fastify.config.AWS_S3_BUCKET!,
//           storage: "aws",
//           status: "pending",
//           createdBy: request.user!.id,
//         });

//         const command = new PutObjectCommand({
//           Bucket: fastify.config.AWS_S3_BUCKET,
//           Key: key,
//         });

//         const presignedUrl = await getSignedUrl(fastify.s3, command, {
//           expiresIn: 360,
//         });

//         reply.send({ data: { url: presignedUrl } });
//       });
//     },
//   );

//   fastify.post<{ Body: z.infer<typeof CreateMultipartUploadBodySchema> }>(
//     "/multipart-upload",
//     {
//       schema: {
//         body: z.toJSONSchema(CreateMultipartUploadBodySchema),
//       },
//     },
//     async (request, reply) => {
//       const mimeType = mime.lookup(request.body.name);
//       const extension = mime.extension(request.body.name);

//       const key = `${createId()}.${extension}`;

//       if (!mimeType) {
//         return reply.code(400).send({ error: "Invalid file" });
//       }

//       await fastify.db.transaction(async (trx) => {
//         await trx.insert(files).values({
//           name: key,
//           originalName: request.body.name,
//           mimeType: mimeType!,
//           bucket: fastify.config.AWS_S3_BUCKET!,
//           storage: "aws",
//           status: "pending",
//           createdBy: request.user!.id,
//         });

//         const command = new CreateMultipartUploadCommand({
//           Bucket: fastify.config.AWS_S3_BUCKET,
//           Key: key,
//         });

//         const { UploadId: uploadId } = await fastify.s3.send(command);

//         reply.send({ data: { uploadId, key } });
//       });
//     },
//   );

//   fastify.post<{ Body: z.infer<typeof CreateMultipartUploadPartBodySchema> }>(
//     "/multipart-upload/url",
//     {
//       schema: {
//         body: z.toJSONSchema(CreateMultipartUploadPartBodySchema),
//       },
//     },
//     async (request, reply) => {
//       const command = new UploadPartCommand({
//         Key: request.body.key,
//         PartNumber: request.body.partNumber,
//         UploadId: request.body.uploadId,
//         Bucket: fastify.config.AWS_S3_BUCKET,
//       });

//       const url = await getSignedUrl(fastify.s3, command, { expiresIn: 3600 });

//       reply.send({ data: { url } });
//     },
//   );

//   fastify.post<{ Body: z.infer<typeof CommitMultipartUploadBodySchema> }>(
//     "/multipart-upload/commit",
//     {
//       schema: {
//         body: z.toJSONSchema(CommitMultipartUploadBodySchema),
//       },
//     },
//     async (request, reply) => {
//       const command = new CompleteMultipartUploadCommand({
//         Bucket: fastify.config.AWS_S3_BUCKET,
//         Key: request.body.key,
//         UploadId: request.body.uploadId,
//         MultipartUpload: {
//           Parts: request.body.parts.map(({ etag, partNumber }) => ({
//             ETag: etag,
//             PartNumber: partNumber,
//           })),
//         },
//       });

//       await fastify.s3.send(command);

//       await fastify.db
//         .update(files)
//         .set({ status: "ready" })
//         .where(eq(files.name, request.body.key));

//       reply.status(204).send();
//     },
//   );
// }
