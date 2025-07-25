import {
  anonymous,
  admin,
  organization,
  bearer,
  jwt,
} from "better-auth/plugins";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./src/database/schema";

const drizzleInstance = drizzle(new pg.Client(), { schema });

export const auth = betterAuth({
  appName: "albieri",
  user: {
    additionalFields: {
      whatsapp: {
        type: "string",
        required: false,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    revokeSessionsOnPasswordReset: true,
  },
  database: drizzleAdapter(drizzleInstance, {
    provider: "pg",
    usePlural: true,
  }),
  plugins: [jwt(), bearer(), organization(), admin(), anonymous()],
});
