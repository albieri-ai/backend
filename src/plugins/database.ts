import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import pg from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { createDb } from "../database/db";

const drizzlePlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  try {
    const { db, client: pgClient } = await createDb({
      connectionString: fastify.config.DATABASE_URL,
    });

    // Run migrations if a migrations folder is specified
    const migrationsFolder = path.join(__dirname, "..", "drizzle");

    try {
      await migrate(db, { migrationsFolder });
      fastify.log.info("Database migrations completed successfully");
    } catch (err) {
      fastify.log.error({ err }, "Failed to run database migrations");
      throw err;
    }

    // Decorate Fastify instance with db
    fastify.decorate("db", db);

    // Close the database connection when the server is shutting down
    fastify.addHook("onClose", async (instance) => {
      try {
        await pgClient.end();
        instance.log.info("Database connection closed");
      } catch (err) {
        instance.log.error({ err }, "Error closing database connection");
      }
    });

    fastify.log.info("Database connection established successfully");
  } catch (err) {
    fastify.log.error({ err }, "Failed to connect to database");
    throw err;
  }
};

export default fp(drizzlePlugin, {
  name: "database",
  fastify: ">=4.0.0",
  dependencies: ["@fastify/env"],
});
