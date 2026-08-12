import assert from "node:assert/strict";

import { config } from "dotenv";
import { Pool, type PoolClient, type PoolConfig } from "pg";

import {
  assertProductionTls,
  inspectClientTls,
} from "./postgres-tls";

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
  canBypassRowSecurity: boolean;
  canCreateDatabase: boolean;
  canCreateRole: boolean;
  canCreateSchemaObjects: boolean;
  canReplicate: boolean;
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

async function inspectConnection(
  pool: Pool,
  connectionString: string,
): Promise<ConnectionInspection> {
  const client: PoolClient = await pool.connect();

  try {
    const result = await client.query<{
      can_bypass_row_security: boolean;
      can_create_database: boolean;
      can_create_role: boolean;
      can_create_schema_objects: boolean;
      can_replicate: boolean;
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
            roles.rolreplication as can_replicate,
            roles.rolbypassrls as can_bypass_row_security,
            has_schema_privilege(current_user, 'public', 'CREATE')
              as can_create_schema_objects
       from pg_roles as roles
      where roles.rolname = current_user`,
    );
    const row = result.rows[0];

    assert(row, "Database connection inspection returned no rows.");
    const tlsInspection = inspectClientTls(client, connectionString);
    assertProductionTls(tlsInspection, row.tls_enabled);

    return {
      canBypassRowSecurity: row.can_bypass_row_security,
      canCreateDatabase: row.can_create_database,
      canCreateRole: row.can_create_role,
      canCreateSchemaObjects: row.can_create_schema_objects,
      canReplicate: row.can_replicate,
      databaseName: row.database_name,
      isSuperuser: row.is_superuser,
      roleName: row.role_name,
      serverVersion: Number(row.server_version),
      tlsEnabled: tlsInspection.clientEncrypted || row.tls_enabled,
    };
  } finally {
    client.release();
  }
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

  const drizzleResult = await pool.query<{
    can_use_schema: boolean;
    can_create_in_schema: boolean;
    can_select: boolean;
    can_insert: boolean;
    can_update: boolean;
    can_delete: boolean;
    can_truncate: boolean;
  }>(`
    select
      has_schema_privilege(current_user, 'drizzle', 'USAGE') as can_use_schema,
      has_schema_privilege(current_user, 'drizzle', 'CREATE') as can_create_in_schema,
      has_table_privilege(current_user, 'drizzle.__drizzle_migrations', 'SELECT') as can_select,
      has_table_privilege(current_user, 'drizzle.__drizzle_migrations', 'INSERT') as can_insert,
      has_table_privilege(current_user, 'drizzle.__drizzle_migrations', 'UPDATE') as can_update,
      has_table_privilege(current_user, 'drizzle.__drizzle_migrations', 'DELETE') as can_delete,
      has_table_privilege(current_user, 'drizzle.__drizzle_migrations', 'TRUNCATE') as can_truncate
  `);
  const drizzlePrivileges = drizzleResult.rows[0];

  assert(drizzlePrivileges, "Could not inspect backup Drizzle privileges.");
  assert(
    drizzlePrivileges.can_use_schema,
    "Backup role requires USAGE on the drizzle schema.",
  );
  assert(
    !drizzlePrivileges.can_create_in_schema,
    "Backup role must not CREATE in the drizzle schema.",
  );
  assert(
    drizzlePrivileges.can_select,
    "Backup role requires SELECT on drizzle.__drizzle_migrations.",
  );
  assert(
    !drizzlePrivileges.can_insert,
    "Backup role must not INSERT into drizzle.__drizzle_migrations.",
  );
  assert(
    !drizzlePrivileges.can_update,
    "Backup role must not UPDATE drizzle.__drizzle_migrations.",
  );
  assert(
    !drizzlePrivileges.can_delete,
    "Backup role must not DELETE from drizzle.__drizzle_migrations.",
  );
  assert(
    !drizzlePrivileges.can_truncate,
    "Backup role must not TRUNCATE drizzle.__drizzle_migrations.",
  );

  await pool.query("select count(*) from drizzle.__drizzle_migrations");

  const drizzleSequenceResult = await pool.query<{
    sequence_name: string;
    can_select: boolean;
    can_use: boolean;
    can_update: boolean;
  }>(`
    select
      sequence_name,
      has_sequence_privilege(
        current_user,
        format('drizzle.%I', sequence_name),
        'SELECT'
      ) as can_select,
      has_sequence_privilege(
        current_user,
        format('drizzle.%I', sequence_name),
        'USAGE'
      ) as can_use,
      has_sequence_privilege(
        current_user,
        format('drizzle.%I', sequence_name),
        'UPDATE'
      ) as can_update
    from information_schema.sequences
    where sequence_schema = 'drizzle'
  `);

  assert(
    drizzleSequenceResult.rows.length >= 1,
    "At least one Drizzle migration sequence is required.",
  );

  for (const row of drizzleSequenceResult.rows) {
    assert(
      row.can_select,
      `Backup role requires SELECT on drizzle.${row.sequence_name}.`,
    );
    assert(
      !row.can_use,
      `Backup role must not have USAGE on drizzle.${row.sequence_name}.`,
    );
    assert(
      !row.can_update,
      `Backup role must not UPDATE drizzle.${row.sequence_name}.`,
    );
  }
}

async function main() {
  const runtimeUrl = requireValue(process.env.DATABASE_URL, "DATABASE_URL");
  const migrationUrl = requireValue(
    process.env.DATABASE_MIGRATION_URL,
    "DATABASE_MIGRATION_URL",
  );
  const backupUrl = requireValue(
    process.env.DATABASE_BACKUP_URL,
    "DATABASE_BACKUP_URL",
  );
  const runtimePool = createPool(
    runtimeUrl,
    "detective-platform-runtime-check",
  );
  const migrationPool = createPool(
    migrationUrl,
    "detective-platform-migration-check",
  );
  const backupPool = createPool(
    backupUrl,
    "detective-platform-backup-check",
  );

  try {
    const [runtime, migration, backup] = await Promise.all([
      inspectConnection(runtimePool, runtimeUrl),
      inspectConnection(migrationPool, migrationUrl),
      inspectConnection(backupPool, backupUrl),
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
    assert(!runtime.canReplicate, "Runtime role must not replicate.");
    assert(!runtime.canBypassRowSecurity, "Runtime role must not bypass row security.");
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
    assert(!backup.canReplicate, "Backup role must not replicate.");
    assert(!backup.canBypassRowSecurity, "Backup role must not bypass row security.");
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
