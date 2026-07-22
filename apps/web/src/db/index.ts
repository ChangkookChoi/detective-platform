import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "./schema";

let database: ReturnType<typeof createDatabase> | undefined;

function createDatabase() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for database access.");
  }

  return drizzle({ connection: { connectionString }, schema });
}

export function getDatabase() {
  database ??= createDatabase();
  return database;
}
