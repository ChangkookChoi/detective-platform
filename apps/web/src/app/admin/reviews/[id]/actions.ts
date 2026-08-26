"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireReviewer } from "@/modules/auth/admin-authorization";
import {
  approveReview,
  approvalDecisions,
  ReviewApprovalError,
  type ApprovalDecision,
} from "@/modules/moderation/approve-review";
import {
  resolveReview,
  ReviewResolutionError,
  type NonApprovalDecision,
} from "@/modules/moderation/resolve-review";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readString(formData: FormData, field: string) {
  const value = formData.get(field);

  if (typeof value !== "string") {
    throw new Error(`Invalid review action field: ${field}`);
  }

  return value.trim();
}

function readUuid(formData: FormData, field: string) {
  const value = readString(formData, field);

  if (!uuidPattern.test(value)) {
    throw new Error(`Invalid review action field: ${field}`);
  }

  return value;
}

function readReason(formData: FormData) {
  const reason = readString(formData, "reason");

  if (reason.length < 5 || reason.length > 1000) {
    throw new Error("Review reason must be between 5 and 1000 characters.");
  }

  return reason;
}

function readTimestamp(formData: FormData, field: string) {
  const value = new Date(readString(formData, field));

  if (Number.isNaN(value.getTime())) {
    throw new Error(`Invalid review action field: ${field}`);
  }

  return value;
}

function readOptionalTimestamp(formData: FormData, field: string) {
  const value = formData.get(field);

  if (value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`Invalid review action field: ${field}`);
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    throw new Error(`Invalid review action field: ${field}`);
  }

  return timestamp;
}

function readDecision(formData: FormData): ApprovalDecision {
  const decision = readString(formData, "decision");

  if (!approvalDecisions.includes(decision as ApprovalDecision)) {
    throw new Error("Invalid review approval decision.");
  }

  return decision as ApprovalDecision;
}

function readCategorySlugs(formData: FormData) {
  const values = formData.getAll("serviceCategorySlugs");

  if (
    values.length > 10 ||
    values.some((value) => typeof value !== "string")
  ) {
    throw new Error("Invalid review action field: serviceCategorySlugs");
  }

  return values.map((value) => String(value).trim()).filter(Boolean);
}

function reviewUrl(reviewItemId: string, key: "error" | "result", value: string) {
  const query = new URLSearchParams({ [key]: value });
  return `/admin/reviews/${reviewItemId}?${query}`;
}

export async function approveReviewAction(formData: FormData) {
  const principal = await requireReviewer("/admin/reviews");
  const reviewItemId = readUuid(formData, "reviewItemId");
  const reason = readReason(formData);
  const decision = readDecision(formData);
  const expectedReviewUpdatedAt = readTimestamp(
    formData,
    "expectedReviewUpdatedAt",
  );
  const expectedOfficeUpdatedAt = readOptionalTimestamp(
    formData,
    "expectedOfficeUpdatedAt",
  );
  const newOfficeSlug = formData.get("slug");
  const correctionSourceUrl = formData.get("correctionSourceUrl");
  let failure: string | null = null;
  let publishedSlug: string | null = null;

  try {
    const result = await approveReview({
      reviewItemId,
      actorId: principal.actorId,
      reason,
      decision,
      expectedReviewUpdatedAt,
      expectedOfficeUpdatedAt,
      editedValues: {
        name: readString(formData, "name"),
        summary: readString(formData, "summary"),
        phoneDisplay: readString(formData, "phoneDisplay"),
        emailDisplay: readString(formData, "emailDisplay"),
        addressText: readString(formData, "addressText"),
      },
      newOffice:
        typeof newOfficeSlug === "string"
          ? {
              slug: newOfficeSlug,
              regionSlug: readString(formData, "regionSlug"),
              serviceCategorySlugs: readCategorySlugs(formData),
              sourceType: readString(formData, "sourceType"),
            }
          : undefined,
      correctionSource:
        typeof correctionSourceUrl === "string"
          ? {
              url: correctionSourceUrl,
              sourceType: readString(formData, "correctionSourceType"),
            }
          : undefined,
    });
    publishedSlug = result.slug;
  } catch (error) {
    if (error instanceof ReviewApprovalError) {
      failure = error.reason;
    } else {
      throw error;
    }
  }

  if (failure) {
    redirect(reviewUrl(reviewItemId, "error", failure));
  }

  revalidatePath("/admin/reviews");
  revalidatePath(`/admin/reviews/${reviewItemId}`);
  revalidatePath("/offices");
  if (publishedSlug) {
    revalidatePath(`/offices/${publishedSlug}`);
  }
  redirect(`/admin/reviews?status=${decision}&result=${decision}`);
}

async function resolveReviewAction(
  formData: FormData,
  decision: NonApprovalDecision,
) {
  const principal = await requireReviewer("/admin/reviews");
  const reviewItemId = readUuid(formData, "reviewItemId");
  const reason = readReason(formData);
  const expectedReviewUpdatedAt = readTimestamp(
    formData,
    "expectedReviewUpdatedAt",
  );
  let failure: string | null = null;

  try {
    await resolveReview({
      reviewItemId,
      decision,
      actorId: principal.actorId,
      reason,
      expectedUpdatedAt: expectedReviewUpdatedAt,
    });
  } catch (error) {
    if (error instanceof ReviewResolutionError) {
      failure = error.reason;
    } else {
      throw error;
    }
  }

  if (failure) {
    redirect(reviewUrl(reviewItemId, "error", failure));
  }

  revalidatePath("/admin/reviews");
  revalidatePath(`/admin/reviews/${reviewItemId}`);
  redirect(`/admin/reviews?status=${decision}&result=${decision}`);
}

export async function holdReviewAction(formData: FormData) {
  return resolveReviewAction(formData, "on_hold");
}

export async function rejectReviewAction(formData: FormData) {
  return resolveReviewAction(formData, "rejected");
}
