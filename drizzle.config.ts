import * as dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config();

export default defineConfig({
	dialect: "postgresql",
	schema: ["./src/database/schema/*.ts"],
	out: "./src/drizzle",
	casing: "snake_case",
	dbCredentials: {
		url: process.env.DATABASE_URL!,
	},
});
