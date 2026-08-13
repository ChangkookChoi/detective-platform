#!/usr/bin/env node

import assert from "node:assert/strict";
import { appendFile } from "node:fs/promises";

const DEFAULT_PREFIX = "detective-platform-postgres-";
const DEFAULT_BUDGET_BYTES = 400 * 1024 * 1024;
const DEFAULT_PROJECTED_BYTES = 16 * 1024 * 1024;
const MIN_RETENTION_MS = 13 * 24 * 60 * 60 * 1000;
const MAX_RETENTION_MS = 15 * 24 * 60 * 60 * 1000;

function positiveInteger(value, name, fallback) {
  const candidate = value ?? String(fallback);
  if (!/^[1-9][0-9]*$/.test(candidate)) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return Number(candidate);
}

function activeBackupArtifacts(artifacts, prefix = DEFAULT_PREFIX) {
  return artifacts.filter(
    (artifact) =>
      artifact?.expired === false &&
      typeof artifact.name === "string" &&
      artifact.name.startsWith(prefix),
  );
}

function inventory(artifacts, prefix = DEFAULT_PREFIX) {
  const active = activeBackupArtifacts(artifacts, prefix);
  return {
    count: active.length,
    totalBytes: active.reduce((total, artifact) => {
      if (!Number.isSafeInteger(artifact.size_in_bytes) || artifact.size_in_bytes <= 0) {
        throw new Error(`Artifact ${artifact.name} has an invalid size.`);
      }
      return total + artifact.size_in_bytes;
    }, 0),
  };
}

function verifyHeadroom(current, projectedBytes, budgetBytes) {
  const projectedTotalBytes = current.totalBytes + projectedBytes;
  if (projectedTotalBytes > budgetBytes) {
    throw new Error(
      `Backup artifact storage guard exceeded: projected ${projectedTotalBytes} bytes, budget ${budgetBytes} bytes.`,
    );
  }
  return projectedTotalBytes;
}

function verifyCurrentRunArtifact(artifacts, runId, runAttempt, prefix = DEFAULT_PREFIX) {
  const expectedName = `${prefix}${runId}-${runAttempt}`;
  const current = activeBackupArtifacts(artifacts, prefix).filter(
    (artifact) =>
      artifact.name === expectedName &&
      String(artifact.workflow_run?.id) === String(runId),
  );
  if (current.length !== 1) {
    throw new Error(`Expected one active backup artifact named ${expectedName}, found ${current.length}.`);
  }

  const artifact = current[0];
  const createdAt = Date.parse(artifact.created_at);
  const expiresAt = Date.parse(artifact.expires_at);
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) {
    throw new Error(`Artifact ${artifact.name} has invalid retention timestamps.`);
  }
  const retentionMs = expiresAt - createdAt;
  if (retentionMs < MIN_RETENTION_MS || retentionMs > MAX_RETENTION_MS) {
    throw new Error(
      `Artifact ${artifact.name} retention is outside the expected 13-15 day window.`,
    );
  }
  return artifact;
}

async function fetchArtifacts({ apiUrl, repository, token }) {
  const artifacts = [];
  for (let page = 1; page <= 100; page += 1) {
    const url = new URL(`/repos/${repository}/actions/artifacts`, apiUrl);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub artifact API returned HTTP ${response.status}.`);
    }
    const body = await response.json();
    if (!Array.isArray(body.artifacts)) {
      throw new Error("GitHub artifact API response does not contain an artifacts array.");
    }
    artifacts.push(...body.artifacts);
    if (body.artifacts.length < 100) break;
  }
  return artifacts;
}

async function recordOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, "utf8");
  }
}

async function recordSummary(lines) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`, "utf8");
  }
}

function fixtureArtifact(overrides = {}) {
  return {
    expired: false,
    name: `${DEFAULT_PREFIX}123-1`,
    size_in_bytes: 60_965,
    created_at: "2026-08-12T18:12:07Z",
    expires_at: "2026-08-26T18:11:11Z",
    workflow_run: { id: 123 },
    ...overrides,
  };
}

function selfTest() {
  const artifacts = [
    fixtureArtifact(),
    fixtureArtifact({ name: "unrelated-build", size_in_bytes: 999 }),
    fixtureArtifact({ name: `${DEFAULT_PREFIX}old`, expired: true }),
  ];
  assert.deepEqual(inventory(artifacts), { count: 1, totalBytes: 60_965 });
  assert.equal(verifyHeadroom(inventory(artifacts), 100, 61_065), 61_065);
  assert.throws(() => verifyHeadroom(inventory(artifacts), 101, 61_065), /guard exceeded/);
  assert.equal(verifyCurrentRunArtifact(artifacts, 123, 1).name, `${DEFAULT_PREFIX}123-1`);
  assert.throws(() => verifyCurrentRunArtifact(artifacts, 456, 1), /found 0/);
  assert.throws(() => verifyCurrentRunArtifact(artifacts, 123, 2), /found 0/);
  assert.throws(
    () =>
      verifyCurrentRunArtifact(
        [fixtureArtifact({ expires_at: "2026-08-20T18:12:07Z" })],
        123,
        1,
      ),
    /13-15 day window/,
  );
  console.log("GitHub backup artifact guard self-test completed.");
}

async function main() {
  const mode = process.argv[2];
  if (mode === "--self-test") {
    selfTest();
    return;
  }
  if (mode !== "preflight" && mode !== "post-upload") {
    throw new Error("Usage: verify-github-backup-artifacts.mjs <preflight|post-upload|--self-test>");
  }

  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !repository) {
    throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required.");
  }
  const prefix = process.env.BACKUP_ARTIFACT_PREFIX || DEFAULT_PREFIX;
  const budgetBytes = positiveInteger(
    process.env.BACKUP_ARTIFACT_BUDGET_BYTES,
    "BACKUP_ARTIFACT_BUDGET_BYTES",
    DEFAULT_BUDGET_BYTES,
  );
  const projectedBytes = positiveInteger(
    process.env.BACKUP_PROJECTED_ARTIFACT_BYTES,
    "BACKUP_PROJECTED_ARTIFACT_BYTES",
    DEFAULT_PROJECTED_BYTES,
  );
  const fetchOptions = {
    apiUrl: process.env.GITHUB_API_URL || "https://api.github.com",
    repository,
    token,
  };
  let artifacts = await fetchArtifacts(fetchOptions);
  if (mode === "post-upload") {
    const runId = process.env.GITHUB_RUN_ID;
    const runAttempt = process.env.GITHUB_RUN_ATTEMPT;
    if (!runId || !runAttempt) {
      throw new Error("GITHUB_RUN_ID and GITHUB_RUN_ATTEMPT are required after upload.");
    }
    const expectedName = `${prefix}${runId}-${runAttempt}`;
    for (let attempt = 1; attempt < 5; attempt += 1) {
      const found = activeBackupArtifacts(artifacts, prefix).some(
        (artifact) => artifact.name === expectedName,
      );
      if (found) break;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      artifacts = await fetchArtifacts(fetchOptions);
    }
  }
  const current = inventory(artifacts, prefix);
  const projectedTotalBytes = verifyHeadroom(current, projectedBytes, budgetBytes);

  if (mode === "post-upload") {
    const runId = process.env.GITHUB_RUN_ID;
    const runAttempt = process.env.GITHUB_RUN_ATTEMPT;
    const artifact = verifyCurrentRunArtifact(artifacts, runId, runAttempt, prefix);
    await recordOutput("artifact_bytes", artifact.size_in_bytes);
    await recordOutput("artifact_expires_at", artifact.expires_at);
  }
  await recordOutput("active_artifact_count", current.count);
  await recordOutput("active_artifact_bytes", current.totalBytes);
  await recordSummary([
    "## Backup artifact storage guard",
    `- Active backup artifacts: ${current.count}`,
    `- Active backup artifact bytes: ${current.totalBytes}`,
    `- Guard budget bytes: ${budgetBytes}`,
    mode === "preflight" ? `- Projected bytes after this run: ${projectedTotalBytes}` : "- 14-day retention: verified",
  ]);
  console.log(
    `Backup artifact guard passed (${current.count} active, ${current.totalBytes} bytes, mode ${mode}).`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
