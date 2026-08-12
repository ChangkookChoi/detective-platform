import assert from "node:assert/strict";

import { config } from "dotenv";

import {
  isClerkConfigured,
  isClerkOnlyPath,
} from "../src/modules/auth/clerk-configuration";

type DeploymentEnvironment = "development" | "preview" | "production";
type ClerkKeyMode = "test" | "live";

type AdminAuthConfiguration = {
  databaseUrl?: string;
  publishableKey?: string;
  secretKey?: string;
  signInUrl?: string;
  signInFallbackRedirectUrl?: string;
  reviewerUserIds?: string;
  adminUserIds?: string;
};

type AdminAuthValidation = {
  keyMode: ClerkKeyMode;
  reviewerCount: number;
  adminCount: number;
};

function requireValue(value: string | undefined, name: string) {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`${name} is required.`);
  }

  return normalized;
}

function validateDatabaseUrl(value: string | undefined) {
  const databaseUrl = requireValue(value, "DATABASE_URL");
  let parsed: URL;

  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !parsed.hostname ||
    parsed.pathname === "/"
  ) {
    throw new Error(
      "DATABASE_URL must identify a PostgreSQL host and database.",
    );
  }
}

function readKeyMode(
  value: string | undefined,
  name: string,
  publicKey: boolean,
): ClerkKeyMode {
  const key = requireValue(value, name);
  const prefix = publicKey ? "pk" : "sk";

  if (key.startsWith(`${prefix}_test_`)) {
    return "test";
  }

  if (key.startsWith(`${prefix}_live_`)) {
    return "live";
  }

  throw new Error(`${name} must use a Clerk ${prefix}_test_ or ${prefix}_live_ key.`);
}

function parseUserIds(value: string | undefined, name: string) {
  const userIds = (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const uniqueUserIds = new Set(userIds);

  if (uniqueUserIds.size !== userIds.length) {
    throw new Error(`${name} must not contain duplicate user IDs.`);
  }

  if (userIds.some((userId) => !/^user_[A-Za-z0-9_-]+$/.test(userId))) {
    throw new Error(`${name} must contain only Clerk user_ IDs.`);
  }

  return uniqueUserIds;
}

function validateAdminAuthConfiguration(
  configuration: AdminAuthConfiguration,
  environment: DeploymentEnvironment,
): AdminAuthValidation {
  validateDatabaseUrl(configuration.databaseUrl);

  const publishableKeyMode = readKeyMode(
    configuration.publishableKey,
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    true,
  );
  const secretKeyMode = readKeyMode(
    configuration.secretKey,
    "CLERK_SECRET_KEY",
    false,
  );

  if (publishableKeyMode !== secretKeyMode) {
    throw new Error("Clerk publishable and secret keys must use the same mode.");
  }

  const expectedKeyMode = environment === "production" ? "live" : "test";
  if (publishableKeyMode !== expectedKeyMode) {
    throw new Error(
      `${environment} requires Clerk ${expectedKeyMode} keys.`,
    );
  }

  if (
    requireValue(
      configuration.signInUrl,
      "NEXT_PUBLIC_CLERK_SIGN_IN_URL",
    ) !== "/sign-in"
  ) {
    throw new Error("NEXT_PUBLIC_CLERK_SIGN_IN_URL must be /sign-in.");
  }

  if (
    requireValue(
      configuration.signInFallbackRedirectUrl,
      "NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL",
    ) !== "/admin/reviews"
  ) {
    throw new Error(
      "NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL must be /admin/reviews.",
    );
  }

  const reviewerUserIds = parseUserIds(
    configuration.reviewerUserIds,
    "CLERK_REVIEWER_USER_IDS",
  );
  const adminUserIds = parseUserIds(
    configuration.adminUserIds,
    "CLERK_ADMIN_USER_IDS",
  );

  if (adminUserIds.size === 0) {
    throw new Error("CLERK_ADMIN_USER_IDS requires at least one administrator.");
  }

  return {
    keyMode: publishableKeyMode,
    reviewerCount: reviewerUserIds.size,
    adminCount: adminUserIds.size,
  };
}

function readDeploymentEnvironment(): DeploymentEnvironment {
  const argument = process.argv.find((item) =>
    item.startsWith("--environment="),
  );
  const value = argument?.split("=", 2)[1] ?? "development";

  if (!["development", "preview", "production"].includes(value)) {
    throw new Error(
      "--environment must be development, preview, or production.",
    );
  }

  return value as DeploymentEnvironment;
}

function readProcessConfiguration(): AdminAuthConfiguration {
  return {
    databaseUrl: process.env.DATABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
    signInUrl: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
    signInFallbackRedirectUrl:
      process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL,
    reviewerUserIds: process.env.CLERK_REVIEWER_USER_IDS,
    adminUserIds: process.env.CLERK_ADMIN_USER_IDS,
  };
}

function runSelfTest() {
  const validConfiguration: AdminAuthConfiguration = {
    databaseUrl: "postgresql://example:example@localhost:5432/example",
    publishableKey: "pk_test_example",
    secretKey: "sk_test_example",
    signInUrl: "/sign-in",
    signInFallbackRedirectUrl: "/admin/reviews",
    reviewerUserIds: "user_reviewer",
    adminUserIds: "user_admin",
  };

  assert.deepEqual(
    validateAdminAuthConfiguration(validConfiguration, "development"),
    {
      keyMode: "test",
      reviewerCount: 1,
      adminCount: 1,
    },
  );
  assert.throws(
    () =>
      validateAdminAuthConfiguration(
        { ...validConfiguration, publishableKey: "" },
        "development",
      ),
    /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required/,
  );
  assert.throws(
    () =>
      validateAdminAuthConfiguration(
        { ...validConfiguration, secretKey: "sk_live_example" },
        "development",
      ),
    /same mode/,
  );
  assert.throws(
    () => validateAdminAuthConfiguration(validConfiguration, "production"),
    /production requires Clerk live keys/,
  );
  assert.throws(
    () =>
      validateAdminAuthConfiguration(
        { ...validConfiguration, adminUserIds: "" },
        "development",
      ),
    /at least one administrator/,
  );
  assert.throws(
    () =>
      validateAdminAuthConfiguration(
        {
          ...validConfiguration,
          reviewerUserIds: "user_reviewer,user_reviewer",
        },
        "development",
      ),
    /must not contain duplicate/,
  );
  assert.throws(
    () =>
      validateAdminAuthConfiguration(
        { ...validConfiguration, adminUserIds: "admin@example.com" },
        "development",
      ),
    /only Clerk user_ IDs/,
  );
  assert.equal(
    isClerkConfigured({
      publishableKey: "pk_live_example",
      secretKey: "sk_live_example",
      deploymentEnvironment: "production",
    }),
    true,
  );
  assert.equal(
    isClerkConfigured({
      publishableKey: "pk_test_example",
      secretKey: "sk_test_example",
      deploymentEnvironment: "production",
    }),
    false,
  );
  assert.equal(
    isClerkConfigured({
      publishableKey: "pk_test_example",
      secretKey: "sk_live_example",
      deploymentEnvironment: "preview",
    }),
    false,
  );
  assert.equal(isClerkOnlyPath("/admin/reviews"), true);
  assert.equal(isClerkOnlyPath("/sign-in"), true);
  assert.equal(isClerkOnlyPath("/offices"), false);

  console.log("Admin authentication configuration self-test completed.");
}

config({ path: ".env.local", quiet: true });
config({ quiet: true });

try {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
  } else {
    const environment = readDeploymentEnvironment();
    const result = validateAdminAuthConfiguration(
      readProcessConfiguration(),
      environment,
    );

    console.log(`Admin authentication configuration is ready for ${environment}.`);
    console.log(`Clerk key mode: ${result.keyMode}`);
    console.log(`Administrator principals: ${result.adminCount}`);
    console.log(`Reviewer principals: ${result.reviewerCount}`);
  }
} catch (error) {
  console.error(
    error instanceof Error
      ? `Admin authentication configuration invalid: ${error.message}`
      : "Admin authentication configuration invalid.",
  );
  process.exitCode = 1;
}
