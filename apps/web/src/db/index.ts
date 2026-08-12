import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import * as schema from "./schema";

let database: ReturnType<typeof createDatabase> | undefined;
let pool: Pool | undefined;

const defaultPoolMax = 5;

function readPoolMax(value: string | undefined) {
  const normalized = value?.trim();

  if (!normalized) {
    return defaultPoolMax;
  }

  if (!/^\d+$/.test(normalized)) {
    throw new Error("DATABASE_POOL_MAX must be an integer from 1 through 10.");
  }

  const parsed = Number(normalized);

  if (parsed < 1 || parsed > 10) {
    throw new Error("DATABASE_POOL_MAX must be an integer from 1 through 10.");
  }

  return parsed;
}

function createDatabase() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for database access.");
  }

  const poolConfig: PoolConfig & { enableChannelBinding: boolean } = {
    connectionString,
    max: readPoolMax(process.env.DATABASE_POOL_MAX),
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    maxLifetimeSeconds: 300,
    allowExitOnIdle: true,
    enableChannelBinding: true,
  };

  pool = new Pool(poolConfig);
  pool.on("error", (error) => {
    console.error("Unexpected idle PostgreSQL client error.", {
      name: error.name,
    });
  });

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
