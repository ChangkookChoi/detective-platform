import { and, eq, gte, inArray, sql } from "drizzle-orm";

import { getDatabase } from "@/db";
import { offices, reviewItems } from "@/db/schema";
import { isPublicHttpUrl } from "@/modules/shared/public-url";

export const correctionRequestFields = [
  "name",
  "phone",
  "address",
  "summary",
] as const;
export type CorrectionRequestField = (typeof correctionRequestFields)[number];

export const correctionRequesterRoles = [
  "public_user",
  "office_representative",
  "source_operator",
  "other",
] as const;
export type CorrectionRequesterRole =
  (typeof correctionRequesterRoles)[number];

export const CORRECTION_REQUEST_WINDOW_HOURS = 24;
export const CORRECTION_REQUEST_OFFICE_LIMIT = 10;

export type CorrectionRequestFailure =
  | "duplicate"
  | "invalid_input"
  | "office_not_found"
  | "rate_limited"
  | "sensitive_confirmation_required";

export class CorrectionRequestError extends Error {
  constructor(public readonly reason: CorrectionRequestFailure) {
    super(`Correction request failed: ${reason}`);
    this.name = "CorrectionRequestError";
  }
}

type CreateCorrectionRequestInput = {
  officeSlug: string;
  field: string;
  suggestedValue: string;
  requesterRole: string;
  evidenceUrl?: string;
  sensitiveContentConfirmed: boolean;
};

function isCorrectionRequestField(
  value: string,
): value is CorrectionRequestField {
  return correctionRequestFields.includes(value as CorrectionRequestField);
}

function isCorrectionRequesterRole(
  value: string,
): value is CorrectionRequesterRole {
  return correctionRequesterRoles.includes(value as CorrectionRequesterRole);
}

function normalizeRequiredText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized || normalized.length > maxLength) {
    throw new CorrectionRequestError("invalid_input");
  }

  return normalized;
}

function normalizePhone(value: string) {
  const display = normalizeRequiredText(value, 50);
  let normalized = display.replace(/\D/g, "");

  if (normalized.startsWith("82") && normalized.length >= 10) {
    normalized = `0${normalized.slice(2)}`;
  }

  if (
    normalized.length < 9 ||
    normalized.length > 11 ||
    !normalized.startsWith("0")
  ) {
    throw new CorrectionRequestError("invalid_input");
  }

  return { display, normalized };
}

function normalizeEvidenceUrl(value: string | undefined) {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    return undefined;
  }

  if (normalized.length > 2048 || !isPublicHttpUrl(normalized)) {
    throw new CorrectionRequestError("invalid_input");
  }

  return normalized;
}

export async function createCorrectionRequest(
  input: CreateCorrectionRequestInput,
  createdAt = new Date(),
) {
  const officeSlug = input.officeSlug.trim();
  const field = input.field.trim();
  const requesterRole = input.requesterRole.trim();

  if (
    officeSlug.length < 3 ||
    officeSlug.length > 80 ||
    !isCorrectionRequestField(field) ||
    !isCorrectionRequesterRole(requesterRole) ||
    Number.isNaN(createdAt.getTime())
  ) {
    throw new CorrectionRequestError("invalid_input");
  }

  if (!input.sensitiveContentConfirmed) {
    throw new CorrectionRequestError("sensitive_confirmation_required");
  }

  const evidenceUrl = normalizeEvidenceUrl(input.evidenceUrl);
  let proposedCoreValues: Record<string, string>;

  if (field === "phone") {
    const phone = normalizePhone(input.suggestedValue);
    proposedCoreValues = {
      phoneDisplay: phone.display,
      phoneNormalized: phone.normalized,
    };
  } else {
    const maxLength =
      field === "summary" ? 2000 : field === "address" ? 500 : 200;
    const suggestedValue = normalizeRequiredText(
      input.suggestedValue,
      maxLength,
    );
    proposedCoreValues =
      field === "name"
        ? { name: suggestedValue }
        : field === "address"
          ? { addressText: suggestedValue }
          : { summary: suggestedValue };
  }

  const db = getDatabase();

  return db.transaction(async (tx) => {
    const [office] = await tx
      .select({
        id: offices.id,
        name: offices.name,
        summary: offices.summary,
        phoneDisplay: offices.phoneDisplay,
        phoneNormalized: offices.phoneNormalized,
        addressText: offices.addressText,
      })
      .from(offices)
      .where(and(eq(offices.slug, officeSlug), eq(offices.status, "published")))
      .limit(1);

    if (!office) {
      throw new CorrectionRequestError("office_not_found");
    }

    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${office.id}, 0))`,
    );

    const previousValues =
      field === "name"
        ? { name: office.name }
        : field === "phone"
          ? {
              phoneDisplay: office.phoneDisplay,
              phoneNormalized: office.phoneNormalized,
            }
          : field === "address"
            ? { addressText: office.addressText }
            : { summary: office.summary };
    const proposedValues = {
      ...proposedCoreValues,
      requestedField: field,
      requesterRole,
      ...(evidenceUrl ? { evidenceUrl } : {}),
    };
    const windowStart = new Date(
      createdAt.getTime() -
        CORRECTION_REQUEST_WINDOW_HOURS * 60 * 60 * 1000,
    );

    const [duplicate] = await tx
      .select({ id: reviewItems.id })
      .from(reviewItems)
      .where(
        and(
          eq(reviewItems.officeId, office.id),
          eq(reviewItems.type, "correction_request"),
          inArray(reviewItems.status, ["pending", "on_hold"]),
          gte(reviewItems.createdAt, windowStart),
          sql`${reviewItems.proposedValues} = ${JSON.stringify(proposedValues)}::jsonb`,
        ),
      )
      .limit(1);

    if (duplicate) {
      throw new CorrectionRequestError("duplicate");
    }

    const [recent] = await tx
      .select({ count: sql<number>`count(*)::integer` })
      .from(reviewItems)
      .where(
        and(
          eq(reviewItems.officeId, office.id),
          eq(reviewItems.type, "correction_request"),
          gte(reviewItems.createdAt, windowStart),
        ),
      );

    if ((recent?.count ?? 0) >= CORRECTION_REQUEST_OFFICE_LIMIT) {
      throw new CorrectionRequestError("rate_limited");
    }

    const [created] = await tx
      .insert(reviewItems)
      .values({
        officeId: office.id,
        type: "correction_request",
        risk: field === "summary" ? "medium" : "high",
        status: "pending",
        previousValues,
        proposedValues,
        cause: "public_correction_request",
        createdAt,
        updatedAt: createdAt,
      })
      .returning({ id: reviewItems.id });

    if (!created) {
      throw new CorrectionRequestError("invalid_input");
    }

    return { reviewItemId: created.id, officeId: office.id, field } as const;
  });
}
