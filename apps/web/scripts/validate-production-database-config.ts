import assert from "node:assert/strict";

import { config } from "dotenv";

type ProductionDatabaseConfiguration = {
  backupUrl?: string;
  runtimeUrl?: string;
  migrationUrl?: string;
  poolMax?: string;
  siteUrl?: string;
};

type ValidatedDatabaseUrl = {
  databaseName: string;
  username: string;
};

type ProductionDatabaseValidation = {
  poolMax: number;
  databaseRolesSeparated: true;
  tlsRequired: true;
  siteUsesHttps: true;
};

function requireValue(value: string | undefined, name: string) {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`${name} is required.`);
  }

  return normalized;
}

function validateDatabaseUrl(
  value: string | undefined,
  name: "DATABASE_URL" | "DATABASE_MIGRATION_URL" | "DATABASE_BACKUP_URL",
): ValidatedDatabaseUrl {
  const rawUrl = requireValue(value, name);
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL.`);
  }

  const pathSegments = parsed.pathname.split("/").filter(Boolean);
  const hostname = parsed.hostname.toLowerCase();

  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !parsed.username ||
    !parsed.password ||
    !hostname ||
    pathSegments.length !== 1
  ) {
    throw new Error(
      `${name} must include a PostgreSQL username, password, host, and database.`,
    );
  }

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  ) {
    throw new Error(`${name} must not target a local database in production.`);
  }

  const sslMode = parsed.searchParams.get("sslmode");

  if (!sslMode || !["require", "verify-ca", "verify-full"].includes(sslMode)) {
    throw new Error(
      `${name} must require TLS with sslmode=require, verify-ca, or verify-full.`,
    );
  }

  if (parsed.hash) {
    throw new Error(`${name} must not contain a URL fragment.`);
  }

  return {
    databaseName: decodeURIComponent(pathSegments[0]),
    username: decodeURIComponent(parsed.username),
  };
}

function validatePoolMax(value: string | undefined) {
  const normalized = requireValue(value, "DATABASE_POOL_MAX");

  if (!/^\d+$/.test(normalized)) {
    throw new Error("DATABASE_POOL_MAX must be an integer from 1 through 10.");
  }

  const parsed = Number(normalized);

  if (parsed < 1 || parsed > 10) {
    throw new Error("DATABASE_POOL_MAX must be an integer from 1 through 10.");
  }

  return parsed;
}

function validateSiteUrl(value: string | undefined) {
  const rawUrl = requireValue(value, "NEXT_PUBLIC_SITE_URL");
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_SITE_URL must be a valid HTTPS origin.");
  }

  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL must be an HTTPS origin without a path, query, or fragment.",
    );
  }
}

function validateProductionDatabaseConfiguration(
  configuration: ProductionDatabaseConfiguration,
): ProductionDatabaseValidation {
  const runtime = validateDatabaseUrl(configuration.runtimeUrl, "DATABASE_URL");
  const migration = validateDatabaseUrl(
    configuration.migrationUrl,
    "DATABASE_MIGRATION_URL",
  );
  const backup = validateDatabaseUrl(
    configuration.backupUrl,
    "DATABASE_BACKUP_URL",
  );

  const configuredUrls = [
    configuration.runtimeUrl?.trim(),
    configuration.migrationUrl?.trim(),
    configuration.backupUrl?.trim(),
  ];

  if (new Set(configuredUrls).size !== configuredUrls.length) {
    throw new Error(
      "Runtime, migration, and backup URLs must use separate credentials.",
    );
  }

  if (new Set([runtime.username, migration.username, backup.username]).size !== 3) {
    throw new Error(
      "Runtime, migration, and backup database URLs must use different PostgreSQL roles.",
    );
  }

  if (
    runtime.databaseName !== migration.databaseName ||
    backup.databaseName !== migration.databaseName
  ) {
    throw new Error(
      "Runtime, migration, and backup URLs must target the same database name.",
    );
  }

  const poolMax = validatePoolMax(configuration.poolMax);
  validateSiteUrl(configuration.siteUrl);

  return {
    poolMax,
    databaseRolesSeparated: true,
    tlsRequired: true,
    siteUsesHttps: true,
  };
}

function readProcessConfiguration(): ProductionDatabaseConfiguration {
  return {
    backupUrl: process.env.DATABASE_BACKUP_URL,
    runtimeUrl: process.env.DATABASE_URL,
    migrationUrl: process.env.DATABASE_MIGRATION_URL,
    poolMax: process.env.DATABASE_POOL_MAX,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  };
}

function runSelfTest() {
  const validConfiguration: ProductionDatabaseConfiguration = {
    backupUrl:
      "postgresql://backup_reader:secret@database.example.com/platform?sslmode=require",
    runtimeUrl:
      "postgresql://app_runtime:secret@database-pool.example.com/platform?sslmode=require",
    migrationUrl:
      "postgresql://migration_owner:secret@database.example.com/platform?sslmode=verify-full",
    poolMax: "5",
    siteUrl: "https://detective.example.com",
  };

  assert.deepEqual(validateProductionDatabaseConfiguration(validConfiguration), {
    poolMax: 5,
    databaseRolesSeparated: true,
    tlsRequired: true,
    siteUsesHttps: true,
  });
  assert.throws(
    () =>
      validateProductionDatabaseConfiguration({
        ...validConfiguration,
        runtimeUrl: "postgresql://app_runtime@database.example.com/platform?sslmode=require",
      }),
    /username, password, host, and database/,
  );
  assert.throws(
    () =>
      validateProductionDatabaseConfiguration({
        ...validConfiguration,
        runtimeUrl:
          "postgresql://app_runtime:secret@localhost/platform?sslmode=require",
      }),
    /must not target a local database/,
  );
  assert.throws(
    () =>
      validateProductionDatabaseConfiguration({
        ...validConfiguration,
        runtimeUrl:
          "postgresql://app_runtime:secret@database.example.com/platform",
      }),
    /must require TLS/,
  );
  assert.throws(
    () =>
      validateProductionDatabaseConfiguration({
        ...validConfiguration,
        migrationUrl:
          "postgresql://app_runtime:other@database.example.com/platform?sslmode=require",
      }),
    /different PostgreSQL roles/,
  );
  assert.throws(
    () =>
      validateProductionDatabaseConfiguration({
        ...validConfiguration,
        backupUrl:
          "postgresql://app_runtime:other@database.example.com/platform?sslmode=require",
      }),
    /different PostgreSQL roles/,
  );
  assert.throws(
    () =>
      validateProductionDatabaseConfiguration({
        ...validConfiguration,
        poolMax: "11",
      }),
    /integer from 1 through 10/,
  );
  assert.throws(
    () =>
      validateProductionDatabaseConfiguration({
        ...validConfiguration,
        siteUrl: "http://detective.example.com",
      }),
    /HTTPS origin/,
  );

  console.log("Production database configuration self-test completed.");
}

config({ path: ".env.local", quiet: true });
config({ quiet: true });

try {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
  } else {
    const result = validateProductionDatabaseConfiguration(
      readProcessConfiguration(),
    );

    console.log("Production database configuration is ready for connectivity checks.");
    console.log(`Runtime pool maximum per instance: ${result.poolMax}`);
    console.log("TLS requirement: configured");
    console.log("Runtime/migration/backup role separation: configured");
    console.log("Production site origin: HTTPS");
  }
} catch (error) {
  console.error(
    error instanceof Error
      ? `Production database configuration invalid: ${error.message}`
      : "Production database configuration invalid.",
  );
  process.exitCode = 1;
}
