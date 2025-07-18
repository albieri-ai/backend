import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import * as schema from "../database/schema";

// Define the plugin options
interface DatabasePluginOptions {
	connectionString: string;
	migrationsFolder?: string;
}

const drizzlePlugin: FastifyPluginAsync<DatabasePluginOptions> = async (
	fastify: FastifyInstance,
	options: DatabasePluginOptions,
) => {
	// Validate required options
	if (!options.connectionString) {
		throw new Error("Database connection string is required");
	}

	// Create PostgreSQL client
	const pgClient = new pg.Client({
		connectionString: options.connectionString,
	});

	try {
		// Connect to the database
		await pgClient.connect();

		// Create Drizzle ORM instance
		const db = drizzle(pgClient, {
			schema,
			logger: fastify.log.level === "debug",
		});

		// Run migrations if a migrations folder is specified
		const migrationsFolder =
			options.migrationsFolder ||
			path.join(__dirname, "..", "..", "migrations");

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
