import { S3Client } from "@aws-sdk/client-s3";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

const authPlugin: FastifyPluginAsync<{}> = async (fastify: FastifyInstance) => {
  const s3Client = new S3Client({
    region: "us-east-1",
    credentials: {
      accessKeyId: fastify.config.AWS_ACCESS_KEY_ID,
      secretAccessKey: fastify.config.AWS_SECRET_ACCESS_KEY,
    },
  });

  fastify.decorate("s3", s3Client);
};

export default fp(authPlugin, {
  name: "s3",
  fastify: ">=4.0.0",
  dependencies: ["@fastify/env"],
});
