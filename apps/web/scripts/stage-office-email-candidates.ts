import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { config } from "dotenv";
import { and, eq, inArray } from "drizzle-orm";

import { closeDatabase, getDatabase } from "../src/db";
import {
  collectedRecords,
  collectionRuns,
  officeSources,
  offices,
  reviewItems,
} from "../src/db/schema";
import { normalizeOptionalBusinessEmail } from "../src/modules/shared/business-email";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

type EmailCandidate = {
  officeId: string;
  sourceUrl: string;
  emailNormalized: string;
  emailDisplay: string;
  emailKind: "generic_business" | "unknown";
  checkedAt: Date;
};

type StageSummary = {
  candidateCount: number;
  stagedCount: number;
  unchangedCount: number;
  unresolvedDuplicateCount: number;
  ineligibleCount: number;
  dryRun: boolean;
};

class DryRunRollback extends Error {
  constructor(readonly summary: StageSummary) {
    super("office_email_stage_dry_run");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, reason: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(reason);
  }
  return value.trim();
}

function parseDate(value: unknown, reason: string) {
  const parsed = new Date(requiredString(value, reason));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(reason);
  }
  return parsed;
}

async function loadCandidates(inputPath: string) {
  const repositoryRoot = resolve(process.cwd(), "../..");
  const privateRoot = resolve(repositoryRoot, "data/private");
  const resolvedInput = resolve(process.cwd(), inputPath);
  if (
    resolvedInput !== privateRoot &&
    !resolvedInput.startsWith(`${privateRoot}${sep}`)
  ) {
    throw new Error("office_email_input_must_be_private");
  }
  const fileStat = await stat(resolvedInput);
  if (!fileStat.isFile() || (fileStat.mode & 0o077) !== 0) {
    throw new Error("office_email_input_permissions_invalid");
  }
  const content = await readFile(resolvedInput, "utf8");
  const candidates: EmailCandidate[] = [];
  let ineligibleCount = 0;
  const identities = new Set<string>();

  for (const [index, line] of content.split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`office_email_input_json_invalid:${index + 1}`);
    }
    if (!isRecord(value)) {
      throw new Error(`office_email_input_record_invalid:${index + 1}`);
    }
    if (
      value.version !== 1 ||
      value.rules_version !== "official-business-email-v1" ||
      value.marketing_consent_status !== "not_obtained" ||
      value.promotion_allowed !== false
    ) {
      throw new Error(`office_email_input_policy_invalid:${index + 1}`);
    }
    const expiresAt = parseDate(
      value.expires_at,
      `office_email_input_expiry_invalid:${index + 1}`,
    );
    if (expiresAt <= new Date()) {
      throw new Error(`office_email_input_expired:${index + 1}`);
    }
    if (value.status !== "pending" || value.target_type !== "office") {
      ineligibleCount += 1;
      continue;
    }
    const officeId = requiredString(
      value.office_id,
      `office_email_input_office_invalid:${index + 1}`,
    );
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(officeId)) {
      throw new Error(`office_email_input_office_invalid:${index + 1}`);
    }
    const sourceUrl = requiredString(
      value.source_url,
      `office_email_input_source_invalid:${index + 1}`,
    );
    const parsedSource = new URL(sourceUrl);
    if (parsedSource.protocol !== "https:") {
      throw new Error(`office_email_input_source_invalid:${index + 1}`);
    }
    const email = normalizeOptionalBusinessEmail(
      requiredString(
        value.email_display,
        `office_email_input_email_invalid:${index + 1}`,
      ),
    );
    if (
      !email ||
      email.normalized !== value.email_normalized ||
      email.kind !== value.email_kind
    ) {
      throw new Error(`office_email_input_email_invalid:${index + 1}`);
    }
    const identity = `${officeId}:${sourceUrl}`;
    if (identities.has(identity)) {
      throw new Error(`office_email_input_duplicate:${index + 1}`);
    }
    identities.add(identity);
    candidates.push({
      officeId,
      sourceUrl,
      emailNormalized: email.normalized,
      emailDisplay: email.display,
      emailKind: email.kind,
      checkedAt: parseDate(
        value.checked_at,
        `office_email_input_checked_at_invalid:${index + 1}`,
      ),
    });
  }

  return { candidates, ineligibleCount };
}

async function stageCandidates(
  candidates: EmailCandidate[],
  ineligibleCount: number,
  dryRun: boolean,
) {
  const db = getDatabase();
  try {
    return await db.transaction(async (tx) => {
      const now = new Date();
      const [run] = await tx
        .insert(collectionRuns)
        .values({
          sourceName: "official-business-email-backfill",
          adapterName: "official_email",
          extractorVersion: "official-business-email-v1",
          status: "running",
          startedAt: now,
          discoveredCount: candidates.length,
        })
        .returning({ id: collectionRuns.id });
      if (!run) throw new Error("office_email_collection_run_not_created");

      let stagedCount = 0;
      let unchangedCount = 0;
      let unresolvedDuplicateCount = 0;
      for (const candidate of candidates) {
        const [target] = await tx
          .select({
            officeId: offices.id,
            emailNormalized: offices.emailNormalized,
            emailDisplay: offices.emailDisplay,
            emailKind: offices.emailKind,
          })
          .from(offices)
          .innerJoin(
            officeSources,
            and(
              eq(officeSources.officeId, offices.id),
              eq(officeSources.url, candidate.sourceUrl),
              eq(officeSources.isPrimary, true),
              eq(officeSources.sourceType, "official_website"),
              eq(officeSources.accessStatus, "available"),
            ),
          )
          .where(
            and(
              eq(offices.id, candidate.officeId),
              inArray(offices.status, ["draft", "published"]),
            ),
          )
          .limit(1);
        if (!target) throw new Error("office_email_target_changed");
        if (target.emailNormalized === candidate.emailNormalized) {
          unchangedCount += 1;
          continue;
        }
        const [unresolved] = await tx
          .select({ id: reviewItems.id })
          .from(reviewItems)
          .where(
            and(
              eq(reviewItems.officeId, candidate.officeId),
              eq(reviewItems.cause, "official_business_email_discovered"),
              inArray(reviewItems.status, ["pending", "on_hold"]),
            ),
          )
          .limit(1);
        if (unresolved) {
          unresolvedDuplicateCount += 1;
          continue;
        }
        const proposedValues = {
          emailNormalized: candidate.emailNormalized,
          emailDisplay: candidate.emailDisplay,
          emailKind: candidate.emailKind,
        };
        const contentHash = createHash("sha256")
          .update(
            JSON.stringify({
              officeId: candidate.officeId,
              sourceUrl: candidate.sourceUrl,
              ...proposedValues,
            }),
          )
          .digest("hex");
        const sourceRecordKey = `office-email:${candidate.officeId}:${createHash("sha256")
          .update(candidate.sourceUrl)
          .digest("hex")
          .slice(0, 16)}`;
        const [record] = await tx
          .insert(collectedRecords)
          .values({
            collectionRunId: run.id,
            sourceUrl: candidate.sourceUrl,
            sourceRecordKey,
            collectedAt: candidate.checkedAt,
            extractedValues: { email: candidate.emailDisplay },
            normalizedValues: proposedValues,
            contentHash,
          })
          .returning({ id: collectedRecords.id });
        if (!record) throw new Error("office_email_record_not_created");
        await tx.insert(reviewItems).values({
          officeId: candidate.officeId,
          collectedRecordId: record.id,
          type: "field_change",
          risk: "medium",
          status: "pending",
          previousValues: {
            emailNormalized: target.emailNormalized,
            emailDisplay: target.emailDisplay,
            emailKind: target.emailKind,
          },
          proposedValues,
          cause: "official_business_email_discovered",
          createdAt: now,
          updatedAt: now,
        });
        stagedCount += 1;
      }
      const summary: StageSummary = {
        candidateCount: candidates.length,
        stagedCount,
        unchangedCount,
        unresolvedDuplicateCount,
        ineligibleCount,
        dryRun,
      };
      await tx
        .update(collectionRuns)
        .set({
          status: "succeeded",
          finishedAt: now,
          collectedCount: stagedCount,
        })
        .where(eq(collectionRuns.id, run.id));
      if (dryRun) throw new DryRunRollback(summary);
      return summary;
    });
  } catch (error) {
    if (error instanceof DryRunRollback) return error.summary;
    throw error;
  }
}

function readArguments() {
  const args = process.argv.slice(2);
  const inputIndex = args.indexOf("--input");
  if (inputIndex < 0 || !args[inputIndex + 1]) {
    throw new Error("Usage: stage-office-email-candidates --input <private-jsonl> [--dry-run]");
  }
  return { input: args[inputIndex + 1], dryRun: args.includes("--dry-run") };
}

async function main() {
  const args = readArguments();
  const { candidates, ineligibleCount } = await loadCandidates(args.input);
  const summary = await stageCandidates(candidates, ineligibleCount, args.dryRun);
  console.log(JSON.stringify({ ok: true, ...summary }));
}

main()
  .catch((error: unknown) => {
    console.error(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "unknown_error",
      }),
    );
    process.exitCode = 1;
  })
  .finally(closeDatabase);
