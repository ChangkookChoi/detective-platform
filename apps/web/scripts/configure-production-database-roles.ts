import { Pool, type PoolClient, type PoolConfig } from "pg";

import {
  assertProductionTls,
  inspectClientTls,
} from "./postgres-tls";

const selectTables = [
  "analytics_events",
  "collected_records",
  "collection_runs",
  "office_daily_metrics",
  "office_service_categories",
  "office_source_evidence",
  "office_sources",
  "offices",
  "placements",
  "regions",
  "review_actions",
  "review_items",
  "service_categories",
] as const;

const insertTables = [
  "analytics_events",
  "collected_records",
  "collection_runs",
  "office_daily_metrics",
  "office_service_categories",
  "office_source_evidence",
  "office_sources",
  "offices",
  "review_actions",
  "review_items",
] as const;

const updateTables = [
  "office_daily_metrics",
  "office_source_evidence",
  "office_sources",
  "offices",
  "review_items",
] as const;

const deleteTables = ["analytics_events"] as const;
const roleNamePattern = /^[a-z][a-z0-9_]{2,62}$/;
const productionTlsModes = new Set(["require", "verify-ca", "verify-full"]);

type RoleConfiguration = {
  name: string;
  password: string;
  connectionLimit: number;
  statementTimeout: string;
  lockTimeout: string;
};

function requireEnvironmentValue(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function validateRoleName(name: string, variableName: string) {
  if (!roleNamePattern.test(name)) {
    throw new Error(
      `${variableName} must start with a lowercase letter and contain only lowercase letters, numbers, and underscores.`,
    );
  }
}

function validatePassword(password: string, variableName: string) {
  if (password.length < 32) {
    throw new Error(`${variableName} must contain at least 32 characters.`);
  }

  if (/\r|\n|\0/.test(password)) {
    throw new Error(`${variableName} contains unsupported control characters.`);
  }
}

function validateMigrationUrl(value: string) {
  const url = new URL(value);

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DATABASE_MIGRATION_URL must be a PostgreSQL URL.");
  }

  if (!url.username || !url.password || !url.hostname || !url.pathname.slice(1)) {
    throw new Error(
      "DATABASE_MIGRATION_URL must include username, password, host, and database.",
    );
  }

  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("DATABASE_MIGRATION_URL must not target a local database.");
  }

  if (!productionTlsModes.has(url.searchParams.get("sslmode") ?? "")) {
    throw new Error("DATABASE_MIGRATION_URL must require TLS.");
  }
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteTableList(tables: readonly string[]) {
  return tables
    .map((table) => `${quoteIdentifier("public")}.${quoteIdentifier(table)}`)
    .join(", ");
}

async function passwordLiteral(client: PoolClient, password: string) {
  const result = await client.query<{ literal: string }>(
    "select quote_literal($1) as literal",
    [password],
  );
  const literal = result.rows[0]?.literal;

  if (!literal) {
    throw new Error("Could not prepare a role password.");
  }

  return literal;
}

async function upsertLoginRole(
  client: PoolClient,
  configuration: RoleConfiguration,
) {
  const roleIdentifier = quoteIdentifier(configuration.name);
  const password = await passwordLiteral(client, configuration.password);
  const result = await client.query<{ exists: boolean }>(
    "select exists(select 1 from pg_roles where rolname = $1) as exists",
    [configuration.name],
  );
  const mutableAttributes = [
    "LOGIN",
    `PASSWORD ${password}`,
    "NOCREATEDB",
    "NOCREATEROLE",
    "NOINHERIT",
    `CONNECTION LIMIT ${configuration.connectionLimit}`,
  ].join(" ");

  if (result.rows[0]?.exists) {
    await client.query(`ALTER ROLE ${roleIdentifier} WITH ${mutableAttributes}`);
  } else {
    const creationAttributes = [
      mutableAttributes,
      "NOSUPERUSER",
      "NOREPLICATION",
      "NOBYPASSRLS",
    ].join(" ");
    await client.query(`CREATE ROLE ${roleIdentifier} WITH ${creationAttributes}`);
  }

  await client.query(
    `ALTER ROLE ${roleIdentifier} SET statement_timeout = '${configuration.statementTimeout}'`,
  );
  await client.query(
    `ALTER ROLE ${roleIdentifier} SET lock_timeout = '${configuration.lockTimeout}'`,
  );
  await client.query(
    `ALTER ROLE ${roleIdentifier} SET idle_in_transaction_session_timeout = '30s'`,
  );
}

async function configureRolePrivileges(
  client: PoolClient,
  databaseName: string,
  runtimeRole: string,
  backupRole: string,
) {
  const databaseIdentifier = quoteIdentifier(databaseName);
  const runtimeIdentifier = quoteIdentifier(runtimeRole);
  const backupIdentifier = quoteIdentifier(backupRole);

  await client.query('REVOKE CREATE ON SCHEMA "public" FROM PUBLIC');

  for (const roleIdentifier of [runtimeIdentifier, backupIdentifier]) {
    await client.query(
      `REVOKE ALL PRIVILEGES ON DATABASE ${databaseIdentifier} FROM ${roleIdentifier}`,
    );
    await client.query(
      `GRANT CONNECT ON DATABASE ${databaseIdentifier} TO ${roleIdentifier}`,
    );
    await client.query(
      `REVOKE ALL PRIVILEGES ON SCHEMA "public" FROM ${roleIdentifier}`,
    );
    await client.query(`GRANT USAGE ON SCHEMA "public" TO ${roleIdentifier}`);
    await client.query(
      `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA "public" FROM ${roleIdentifier}`,
    );
    await client.query(
      `REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA "public" FROM ${roleIdentifier}`,
    );
  }

  await client.query(
    `GRANT SELECT ON ${quoteTableList(selectTables)} TO ${runtimeIdentifier}`,
  );
  await client.query(
    `GRANT INSERT ON ${quoteTableList(insertTables)} TO ${runtimeIdentifier}`,
  );
  await client.query(
    `GRANT UPDATE ON ${quoteTableList(updateTables)} TO ${runtimeIdentifier}`,
  );
  await client.query(
    `GRANT DELETE ON ${quoteTableList(deleteTables)} TO ${runtimeIdentifier}`,
  );

  await client.query(
    `GRANT SELECT ON ALL TABLES IN SCHEMA "public" TO ${backupIdentifier}`,
  );
  await client.query(
    `GRANT SELECT ON ALL SEQUENCES IN SCHEMA "public" TO ${backupIdentifier}`,
  );
  await client.query(
    `REVOKE ALL PRIVILEGES ON SCHEMA "drizzle" FROM ${backupIdentifier}`,
  );
  await client.query(`GRANT USAGE ON SCHEMA "drizzle" TO ${backupIdentifier}`);
  await client.query(
    `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA "drizzle" FROM ${backupIdentifier}`,
  );
  await client.query(
    `GRANT SELECT ON ALL TABLES IN SCHEMA "drizzle" TO ${backupIdentifier}`,
  );
}

async function main() {
  const migrationUrl = requireEnvironmentValue("DATABASE_MIGRATION_URL");
  const runtimeRole = requireEnvironmentValue("DATABASE_RUNTIME_ROLE");
  const runtimePassword = requireEnvironmentValue("DATABASE_RUNTIME_PASSWORD");
  const backupRole = requireEnvironmentValue("DATABASE_BACKUP_ROLE");
  const backupPassword = requireEnvironmentValue("DATABASE_BACKUP_PASSWORD");

  validateMigrationUrl(migrationUrl);
  validateRoleName(runtimeRole, "DATABASE_RUNTIME_ROLE");
  validateRoleName(backupRole, "DATABASE_BACKUP_ROLE");
  validatePassword(runtimePassword, "DATABASE_RUNTIME_PASSWORD");
  validatePassword(backupPassword, "DATABASE_BACKUP_PASSWORD");

  if (runtimeRole === backupRole) {
    throw new Error("Runtime and backup role names must differ.");
  }

  if (runtimePassword === backupPassword) {
    throw new Error("Runtime and backup role passwords must differ.");
  }

  const poolConfig: PoolConfig & { enableChannelBinding: boolean } = {
    connectionString: migrationUrl,
    max: 1,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
    allowExitOnIdle: true,
    enableChannelBinding: true,
  };
  const pool = new Pool(poolConfig);
  const client = await pool.connect();

  try {
    const connection = await client.query<{
      database_name: string;
      server_version_number: string;
      tls: boolean;
    }>(`
      select
        current_database() as database_name,
        current_setting('server_version_num') as server_version_number,
        coalesce((select ssl from pg_stat_ssl where pid = pg_backend_pid()), false) as tls
    `);
    const details = connection.rows[0];

    if (!details || Number(details.server_version_number) < 170000) {
      throw new Error("PostgreSQL 17 or newer is required.");
    }

    assertProductionTls(
      inspectClientTls(client, migrationUrl),
      details.tls,
    );

    await client.query("BEGIN");
    await upsertLoginRole(client, {
      name: runtimeRole,
      password: runtimePassword,
      connectionLimit: 20,
      statementTimeout: "10s",
      lockTimeout: "5s",
    });
    await upsertLoginRole(client, {
      name: backupRole,
      password: backupPassword,
      connectionLimit: 2,
      statementTimeout: "15min",
      lockTimeout: "30s",
    });
    await configureRolePrivileges(
      client,
      details.database_name,
      runtimeRole,
      backupRole,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  console.log("Production PostgreSQL runtime and backup roles configured.");
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? `Production PostgreSQL role configuration failed: ${error.message}`
      : "Production PostgreSQL role configuration failed.",
  );
  process.exitCode = 1;
});
