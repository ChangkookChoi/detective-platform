import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

let database: ReturnType<typeof createDatabase> | undefined;
let pool: Pool | undefined;

function createDatabase() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for database access.");
  }

  pool = new Pool({ connectionString });

  return drizzle({ client: pool, schema });
}

export function getDatabase() {
  database ??= createDatabase();
  return database;
}

export async function closeDatabase() {
  await pool?.end();
  pool = undefined;
  database = undefined;
}
