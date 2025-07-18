import { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./database/schema";
import pg from "pg";

// Define the database plugin's type declarations
declare module "fastify" {
  interface FastifyInstance {
    env: {
      PORT: string;
      DATABASE_URL: string;
    };
    db: NodePgDatabase<typeof schema> & { $client: pg.Client };
  }
}
