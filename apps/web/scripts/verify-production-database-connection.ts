import assert from "node:assert/strict";

import { config } from "dotenv";
import { Pool, type PoolConfig } from "pg";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const requiredTables = [
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

const runtimeInsertTables = [
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

const runtimeUpdateTables = [
  "office_daily_metrics",
  "office_source_evidence",
  "office_sources",
  "offices",
  "review_items",
] as const;

const runtimeDeleteTables = ["analytics_events"] as const;

type ConnectionInspection = {
  canCreateDatabase: boolean;
  canCreateRole: boolean;
  canCreateSchemaObjects: boolean;
  databaseName: string;
  isSuperuser: boolean;
  roleName: string;
  serverVersion: number;
  tlsEnabled: boolean;
};

function requireValue(value: string | undefined, name: string) {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`${name} is required.`);
  }

  return normalized;
}

function createPool(connectionString: string, applicationName: string) {
  const poolConfig: PoolConfig & { enableChannelBinding: boolean } = {
    connectionString,
    application_name: applicationName,
    max: 1,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 5_000,
    allowExitOnIdle: true,
    enableChannelBinding: true,
  };
  const pool = new Pool(poolConfig);

  pool.on("error", (error) => {
    console.error("Production database verification connection failed.", {
      name: error.name,
    });
  });

  return pool;
}

async function inspectConnection(pool: Pool): Promise<ConnectionInspection> {
  const result = await pool.query<{
    can_create_database: boolean;
    can_create_role: boolean;
    can_create_schema_objects: boolean;
    database_name: string;
    is_superuser: boolean;
    role_name: string;
    server_version: string;
    tls_enabled: boolean;
  }>(
    `select current_database() as database_name,
            current_user as role_name,
            current_setting('server_version_num') as server_version,
            coalesce(
              (select ssl from pg_stat_ssl where pid = pg_backend_pid()),
              false
            ) as tls_enabled,
            roles.rolsuper as is_superuser,
            roles.rolcreatedb as can_create_database,
            roles.rolcreaterole as can_create_role,
            has_schema_privilege(current_user, 'public', 'CREATE')
              as can_create_schema_objects
       from pg_roles as roles
      where roles.rolname = current_user`,
  );
  const row = result.rows[0];

  assert(row, "Database connection inspection returned no rows.");

  return {
    canCreateDatabase: row.can_create_database,
    canCreateRole: row.can_create_role,
    canCreateSchemaObjects: row.can_create_schema_objects,
    databaseName: row.database_name,
    isSuperuser: row.is_superuser,
    roleName: row.role_name,
    serverVersion: Number(row.server_version),
    tlsEnabled: row.tls_enabled,
  };
}

async function verifyRuntimeTablePrivileges(pool: Pool) {
  const result = await pool.query<{
    table_name: string;
    can_select: boolean;
    can_insert: boolean;
    can_update: boolean;
    can_delete: boolean;
  }>(
    `select expected.table_name,
            has_table_privilege(
              current_user,
              format('public.%I', expected.table_name),
              'SELECT'
            ) as can_select,
            has_table_privilege(
              current_user,
              format('public.%I', expected.table_name),
              'INSERT'
            ) as can_insert,
            has_table_privilege(
              current_user,
              format('public.%I', expected.table_name),
              'UPDATE'
            ) as can_update,
            has_table_privilege(
              current_user,
              format('public.%I', expected.table_name),
              'DELETE'
            ) as can_delete
       from unnest($1::text[]) as expected(table_name)`,
    [requiredTables],
  );
  const insertTableNames = new Set<string>(runtimeInsertTables);
  const updateTableNames = new Set<string>(runtimeUpdateTables);
  const deleteTableNames = new Set<string>(runtimeDeleteTables);

  for (const row of result.rows) {
    assert(row.can_select, `Runtime role requires SELECT on ${row.table_name}.`);

    if (insertTableNames.has(row.table_name)) {
      assert(row.can_insert, `Runtime role requires INSERT on ${row.table_name}.`);
    } else {
      assert(!row.can_insert, `Runtime role must not INSERT into ${row.table_name}.`);
    }

    if (updateTableNames.has(row.table_name)) {
      assert(row.can_update, `Runtime role requires UPDATE on ${row.table_name}.`);
    } else {
      assert(!row.can_update, `Runtime role must not UPDATE ${row.table_name}.`);
    }

    if (deleteTableNames.has(row.table_name)) {
      assert(row.can_delete, `Runtime role requires DELETE on ${row.table_name}.`);
    } else {
      assert(!row.can_delete, `Runtime role must not DELETE from ${row.table_name}.`);
    }
  }
}

async function verifyBackupTablePrivileges(pool: Pool) {
  const result = await pool.query<{
    table_name: string;
    can_select: boolean;
    can_insert: boolean;
    can_update: boolean;
    can_delete: boolean;
    can_truncate: boolean;
  }>(
    `select expected.table_name,
            has_table_privilege(
              current_user,
              format('public.%I', expected.table_name),
              'SELECT'
            ) as can_select,
            has_table_privilege(
              current_user,
              format('public.%I', expected.table_name),
              'INSERT'
            ) as can_insert,
            has_table_privilege(
              current_user,
              format('public.%I', expected.table_name),
              'UPDATE'
            ) as can_update,
            has_table_privilege(
              current_user,
              format('public.%I', expected.table_name),
              'DELETE'
            ) as can_delete,
            has_table_privilege(
              current_user,
              format('public.%I', expected.table_name),
              'TRUNCATE'
            ) as can_truncate
       from unnest($1::text[]) as expected(table_name)`,
    [requiredTables],
  );

  for (const row of result.rows) {
    assert(row.can_select, `Backup role requires SELECT on ${row.table_name}.`);
    assert(!row.can_insert, `Backup role must not INSERT into ${row.table_name}.`);
    assert(!row.can_update, `Backup role must not UPDATE ${row.table_name}.`);
    assert(!row.can_delete, `Backup role must not DELETE from ${row.table_name}.`);
    assert(!row.can_truncate, `Backup role must not TRUNCATE ${row.table_name}.`);
  }
}

async function main() {
  const runtimePool = createPool(
    requireValue(process.env.DATABASE_URL, "DATABASE_URL"),
    "detective-platform-runtime-check",
  );
  const migrationPool = createPool(
    requireValue(
      process.env.DATABASE_MIGRATION_URL,
      "DATABASE_MIGRATION_URL",
    ),
    "detective-platform-migration-check",
  );
  const backupPool = createPool(
    requireValue(process.env.DATABASE_BACKUP_URL, "DATABASE_BACKUP_URL"),
    "detective-platform-backup-check",
  );

  try {
    const [runtime, migration, backup] = await Promise.all([
      inspectConnection(runtimePool),
      inspectConnection(migrationPool),
      inspectConnection(backupPool),
    ]);
    const migrationCountResult = await migrationPool.query<{ count: string }>(
      "select count(*)::text as count from drizzle.__drizzle_migrations",
    );
    const migrationCount = Number(migrationCountResult.rows[0]?.count);

    assert.equal(
      runtime.databaseName,
      migration.databaseName,
      "Runtime and migration roles must target the same database.",
    );
    assert.equal(
      backup.databaseName,
      migration.databaseName,
      "Backup and migration roles must target the same database.",
    );
    assert.notEqual(
      runtime.roleName,
      migration.roleName,
      "Runtime and migration credentials must use different roles.",
    );
    assert.notEqual(
      backup.roleName,
      migration.roleName,
      "Backup and migration credentials must use different roles.",
    );
    assert.notEqual(
      backup.roleName,
      runtime.roleName,
      "Backup and runtime credentials must use different roles.",
    );

    for (const inspection of [runtime, migration, backup]) {
      assert(inspection.tlsEnabled, "Every production database connection requires TLS.");
      assert(
        inspection.serverVersion >= 170000,
        `PostgreSQL 17 or newer is required, received ${inspection.serverVersion}.`,
      );
    }

    assert(!runtime.isSuperuser, "Runtime role must not be a superuser.");
    assert(!runtime.canCreateRole, "Runtime role must not create roles.");
    assert(!runtime.canCreateDatabase, "Runtime role must not create databases.");
    assert(
      !runtime.canCreateSchemaObjects,
      "Runtime role must not create objects in the public schema.",
    );
    assert(
      migration.canCreateSchemaObjects,
      "Migration role requires CREATE on the public schema.",
    );
    assert(!backup.isSuperuser, "Backup role must not be a superuser.");
    assert(!backup.canCreateRole, "Backup role must not create roles.");
    assert(!backup.canCreateDatabase, "Backup role must not create databases.");
    assert(
      !backup.canCreateSchemaObjects,
      "Backup role must not create objects in the public schema.",
    );
    assert(migrationCount >= 1, "Applied Drizzle migrations are required.");

    await Promise.all([
      verifyRuntimeTablePrivileges(runtimePool),
      verifyBackupTablePrivileges(backupPool),
    ]);

    console.log("Production database connectivity and role verification completed.");
    console.log(`PostgreSQL server version: ${runtime.serverVersion}`);
    console.log(`Applied migration count: ${migrationCount}`);
    console.log("TLS connections: verified");
    console.log("Runtime/migration role separation: verified");
    console.log("Runtime table privileges: verified");
    console.log("Backup role separation and read-only privileges: verified");
  } finally {
    await Promise.all([runtimePool.end(), migrationPool.end(), backupPool.end()]);
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? `Production database verification failed: ${error.message}`
      : "Production database verification failed.",
  );
  process.exitCode = 1;
});
