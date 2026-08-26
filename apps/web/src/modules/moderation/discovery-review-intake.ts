import { and, eq, inArray, or, sql } from "drizzle-orm";

import { getDatabase } from "@/db";
import {
  collectedRecords,
  officeSources,
  offices,
  reviewItems,
} from "@/db/schema";
import { resolveStaffRole } from "@/modules/auth/admin-roles";
import {
  createManualOfficeCandidate,
  ManualOfficeCandidateError,
} from "@/modules/moderation/create-manual-office-candidate";
import { normalizeOptionalBusinessEmail } from "@/modules/shared/business-email";
import { normalizeDomesticPhoneDigits } from "@/modules/shared/domestic-phone";
import { isPublicHttpUrl } from "@/modules/shared/public-url";

const maximumInputBytes = 1_000_000;
const maximumEvidenceAgeMilliseconds = 24 * 60 * 60 * 1000;
const futureClockSkewMilliseconds = 5 * 60 * 1000;
const candidateIdPattern = /^[a-f0-9]{64}$/;
const localDatabaseHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export type DiscoveryReviewCandidate = {
  candidateId: string;
  name: string;
  addressText: string;
  phoneDisplay: string;
  phoneNormalized: string;
  emailDisplay?: string;
  sourceUrl: string;
  evidenceRunId: string;
  checkedAt: Date;
};

export type DiscoveryIntakeParseResult = {
  candidates: DiscoveryReviewCandidate[];
  recordCount: number;
  ineligibleCount: number;
  reasonCounts: Record<string, number>;
};

export type DiscoveryIntakeSummary = {
  candidateCount: number;
  stagedCount: number;
  publishedDuplicateCount: number;
  unresolvedDuplicateCount: number;
  ineligibleCount: number;
  dryRun: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, reason: string, maximum = 2048) {
  if (typeof value !== "string") throw new Error(reason);
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (!normalized || normalized.length > maximum) throw new Error(reason);
  return normalized;
}

function optionalString(value: unknown, reason: string, maximum = 320) {
  if (value === null || value === undefined) return undefined;
  return requiredString(value, reason, maximum);
}

function parseDate(value: unknown, reason: string) {
  const parsed = new Date(requiredString(value, reason, 100));
  if (Number.isNaN(parsed.getTime())) throw new Error(reason);
  return parsed;
}

function increment(counts: Map<string, number>, reason: string) {
  counts.set(reason, (counts.get(reason) ?? 0) + 1);
}

function parseCandidate(
  value: Record<string, unknown>,
  lineNumber: number,
  now: Date,
): { candidate?: DiscoveryReviewCandidate; ineligibleReason?: string } {
  const suffix = `:${lineNumber}`;
  if (
    value.version !== 2 ||
    value.rules_version !== "office-discovery-review-v2"
  ) {
    throw new Error(`discovery_intake_version_invalid${suffix}`);
  }

  const candidateId = requiredString(
    value.candidate_id,
    `discovery_intake_candidate_id_invalid${suffix}`,
    64,
  );
  if (!candidateIdPattern.test(candidateId)) {
    throw new Error(`discovery_intake_candidate_id_invalid${suffix}`);
  }

  const checkedAt = parseDate(
    value.checked_at,
    `discovery_intake_checked_at_invalid${suffix}`,
  );
  const expiresAt = parseDate(
    value.expires_at,
    `discovery_intake_expires_at_invalid${suffix}`,
  );
  if (
    checkedAt.getTime() > now.getTime() + futureClockSkewMilliseconds ||
    expiresAt.getTime() <= checkedAt.getTime()
  ) {
    throw new Error(`discovery_intake_timestamp_invalid${suffix}`);
  }

  if (
    value.review_status !== "pending" ||
    value.promotion_allowed !== false ||
    value.evidence_status !== "strong_fact_match" ||
    value.business_relevance !== "probable" ||
    value.business_service_match !== true ||
    value.name_match !== true ||
    value.address_match !== true ||
    value.region_match !== true
  ) {
    return { ineligibleReason: "OFFICIAL_FACT_CONFIRMATION_REQUIRED" };
  }
  if (
    expiresAt.getTime() <= now.getTime() ||
    now.getTime() - checkedAt.getTime() > maximumEvidenceAgeMilliseconds
  ) {
    return { ineligibleReason: "OFFICIAL_FACTS_STALE" };
  }

  const sourceUrlValue = requiredString(
    value.source_url,
    `discovery_intake_source_url_invalid${suffix}`,
  );
  if (!isPublicHttpUrl(sourceUrlValue)) {
    throw new Error(`discovery_intake_source_url_invalid${suffix}`);
  }
  const sourceUrl = new URL(sourceUrlValue);
  if (
    sourceUrl.protocol !== "https:" ||
    sourceUrl.username ||
    sourceUrl.password ||
    sourceUrl.hash
  ) {
    throw new Error(`discovery_intake_source_url_invalid${suffix}`);
  }

  const phoneDisplay = requiredString(
    value.phone_display,
    `discovery_intake_phone_invalid${suffix}`,
    50,
  );
  const phoneNormalized = requiredString(
    value.phone_normalized,
    `discovery_intake_phone_invalid${suffix}`,
    30,
  );
  if (normalizeDomesticPhoneDigits(phoneDisplay) !== phoneNormalized) {
    throw new Error(`discovery_intake_phone_invalid${suffix}`);
  }

  const emailDisplay = optionalString(
    value.email_display,
    `discovery_intake_email_invalid${suffix}`,
  );
  let email: ReturnType<typeof normalizeOptionalBusinessEmail> = null;
  try {
    email = normalizeOptionalBusinessEmail(emailDisplay);
  } catch {
    throw new Error(`discovery_intake_email_invalid${suffix}`);
  }
  if (
    email &&
    (email.normalized !== value.email_normalized || email.kind !== value.email_kind)
  ) {
    throw new Error(`discovery_intake_email_invalid${suffix}`);
  }
  if (!email && (value.email_normalized !== null || value.email_kind !== null)) {
    throw new Error(`discovery_intake_email_invalid${suffix}`);
  }

  return {
    candidate: {
      candidateId,
      name: requiredString(
        value.candidate_name,
        `discovery_intake_name_invalid${suffix}`,
        200,
      ),
      addressText: requiredString(
        value.candidate_address,
        `discovery_intake_address_invalid${suffix}`,
        500,
      ),
      phoneDisplay,
      phoneNormalized,
      ...(email ? { emailDisplay: email.display } : {}),
      sourceUrl: sourceUrl.toString(),
      evidenceRunId: requiredString(
        value.evidence_run_id,
        `discovery_intake_evidence_run_invalid${suffix}`,
        200,
      ),
      checkedAt,
    },
  };
}

export function parseDiscoveryReviewCandidates(
  content: string,
  now = new Date(),
): DiscoveryIntakeParseResult {
  if (Buffer.byteLength(content, "utf8") > maximumInputBytes) {
    throw new Error("discovery_intake_input_too_large");
  }

  const candidates: DiscoveryReviewCandidate[] = [];
  const candidateIds = new Set<string>();
  const sourceAddresses = new Set<string>();
  const reasonCounts = new Map<string, number>();
  let recordCount = 0;

  for (const [index, line] of content.split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    recordCount += 1;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`discovery_intake_json_invalid:${index + 1}`);
    }
    if (!isRecord(value)) {
      throw new Error(`discovery_intake_record_invalid:${index + 1}`);
    }
    const result = parseCandidate(value, index + 1, now);
    if (result.ineligibleReason) {
      increment(reasonCounts, result.ineligibleReason);
      continue;
    }
    const candidate = result.candidate;
    if (!candidate) throw new Error("discovery_intake_candidate_missing");
    const sourceAddress = `${candidate.sourceUrl}\n${candidate.addressText}`;
    if (
      candidateIds.has(candidate.candidateId) ||
      sourceAddresses.has(sourceAddress)
    ) {
      increment(reasonCounts, "DUPLICATE_INPUT");
      continue;
    }
    candidateIds.add(candidate.candidateId);
    sourceAddresses.add(sourceAddress);
    candidates.push(candidate);
  }

  if (recordCount === 0) throw new Error("discovery_intake_input_empty");
  return {
    candidates,
    recordCount,
    ineligibleCount: recordCount - candidates.length,
    reasonCounts: Object.fromEntries([...reasonCounts.entries()].sort()),
  };
}

async function findCandidateState(candidate: DiscoveryReviewCandidate) {
  const db = getDatabase();
  const [published] = await db
    .select({ id: offices.id })
    .from(offices)
    .innerJoin(officeSources, eq(officeSources.officeId, offices.id))
    .where(
      and(
        inArray(offices.status, ["draft", "published"]),
        or(
          eq(officeSources.url, candidate.sourceUrl),
          eq(offices.addressText, candidate.addressText),
          eq(offices.phoneNormalized, candidate.phoneNormalized),
        ),
      ),
    )
    .limit(1);
  if (published) return "published" as const;

  const [unresolved] = await db
    .select({ id: reviewItems.id })
    .from(reviewItems)
    .innerJoin(
      collectedRecords,
      eq(reviewItems.collectedRecordId, collectedRecords.id),
    )
    .where(
      and(
        eq(reviewItems.type, "new_office"),
        inArray(reviewItems.status, ["pending", "on_hold"]),
        or(
          eq(collectedRecords.sourceUrl, candidate.sourceUrl),
          sql`${reviewItems.proposedValues}->>'addressText' = ${candidate.addressText}`,
          sql`${reviewItems.proposedValues}->>'phoneNormalized' = ${candidate.phoneNormalized}`,
        ),
      ),
    )
    .limit(1);
  return unresolved ? ("unresolved" as const) : ("new" as const);
}

export async function stageDiscoveryReviewCandidates(input: {
  parsed: DiscoveryIntakeParseResult;
  dryRun: boolean;
  actorId?: string;
}) {
  const actorId = input.actorId?.trim();
  if (!input.dryRun && (!actorId || !resolveStaffRole(actorId))) {
    throw new Error("discovery_intake_actor_not_authorized");
  }
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(process.env.DATABASE_URL ?? "");
  } catch {
    throw new Error("discovery_intake_database_not_local");
  }
  if (!localDatabaseHosts.has(databaseUrl.hostname)) {
    throw new Error("discovery_intake_database_not_local");
  }

  let stagedCount = 0;
  let publishedDuplicateCount = 0;
  let unresolvedDuplicateCount = 0;
  for (const candidate of input.parsed.candidates) {
    const state = await findCandidateState(candidate);
    if (state === "published") {
      publishedDuplicateCount += 1;
      continue;
    }
    if (state === "unresolved") {
      unresolvedDuplicateCount += 1;
      continue;
    }
    if (input.dryRun) {
      stagedCount += 1;
      continue;
    }
    try {
      await createManualOfficeCandidate({
        actorId: actorId!,
        sourceUrl: candidate.sourceUrl,
        name: candidate.name,
        phoneDisplay: candidate.phoneDisplay,
        emailDisplay: candidate.emailDisplay,
        addressText: candidate.addressText,
        officialSourceConfirmed: true,
        sensitiveContentConfirmed: true,
        discovery: {
          candidateId: candidate.candidateId,
          evidenceRunId: candidate.evidenceRunId,
          evidenceStatus: "strong_fact_match",
          checkedAt: candidate.checkedAt,
          evidenceNote:
            "공식 홈페이지에서 상호·상세 주소·대표 전화와 탐정 업무 근거를 자동 재확인함. 공개 전 관리자가 원문, 최하위 소재 지역과 관리형 업무 분야를 최종 확인해야 함.",
        },
      });
      stagedCount += 1;
    } catch (error) {
      if (
        error instanceof ManualOfficeCandidateError &&
        error.reason === "duplicate"
      ) {
        unresolvedDuplicateCount += 1;
        continue;
      }
      throw error;
    }
  }

  return {
    candidateCount: input.parsed.candidates.length,
    stagedCount,
    publishedDuplicateCount,
    unresolvedDuplicateCount,
    ineligibleCount: input.parsed.ineligibleCount,
    dryRun: input.dryRun,
  } satisfies DiscoveryIntakeSummary;
}
