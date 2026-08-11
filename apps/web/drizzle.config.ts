import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

const injectedMigrationDatabaseUrl =
  process.env.DATABASE_MIGRATION_URL?.trim();

config({ path: ".env.local" });
config();

const databaseUrl =
  injectedMigrationDatabaseUrl || process.env.DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
  ...(databaseUrl ? { dbCredentials: { url: databaseUrl } } : {}),
});
