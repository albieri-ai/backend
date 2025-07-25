import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export async function createDb({
	connectionString,
}: {
	connectionString: string;
}) {
	const pgClient = new pg.Client({
		connectionString,
	});

	const db = drizzle(pgClient, {
		schema,
		casing: "snake_case",
	});

	await pgClient.connect();

	return { db, client: pgClient };
}
