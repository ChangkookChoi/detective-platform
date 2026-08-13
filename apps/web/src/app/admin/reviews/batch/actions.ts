"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireReviewer } from "@/modules/auth/admin-authorization";
import {
  approveOfficeReviewBatch,
  createOfficeReviewBatch,
  OfficeReviewBatchError,
} from "@/modules/moderation/office-review-batch";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maximumBatchFileBytes = 250_000;

function readString(formData: FormData, field: string) {
  const value = formData.get(field);
  if (typeof value !== "string") {
    throw new Error(`Invalid office batch field: ${field}`);
  }
  return value.trim();
}

async function readFile(formData: FormData, field: string) {
  const value = formData.get(field);
  if (
    !(value instanceof File) ||
    value.size === 0 ||
    value.size > maximumBatchFileBytes
  ) {
    throw new OfficeReviewBatchError(
      field === "manifest" ? "invalid_batch" : "invalid_preflight",
    );
  }
  return value.text();
}

function batchUrl(parameters: Record<string, string | number>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    query.set(key, String(value));
  }
  return `/admin/reviews/batch?${query}`;
}

export async function createOfficeReviewBatchAction(formData: FormData) {
  const principal = await requireReviewer("/admin/reviews/batch");
  let batchId = "";
  let createdCount = 0;
  let existingCount = 0;
  let publishedCount = 0;
  let failure: string | null = null;

  try {
    const result = await createOfficeReviewBatch({
      actorId: principal.actorId,
      manifestText: await readFile(formData, "manifest"),
      preflightText: await readFile(formData, "preflight"),
      officialSourceConfirmed:
        formData.get("officialSourceConfirmed") === "on",
      sensitiveContentConfirmed:
        formData.get("sensitiveContentConfirmed") === "on",
    });
    batchId = result.batchId;
    createdCount = result.results.filter(
      (item) => item.outcome === "created",
    ).length;
    existingCount = result.results.length - createdCount;
    publishedCount = result.results.filter(
      (item) => item.outcome === "published",
    ).length;
    existingCount -= publishedCount;
  } catch (error) {
    if (error instanceof OfficeReviewBatchError) {
      failure = error.reason;
    } else {
      throw error;
    }
  }

  if (failure) {
    redirect(batchUrl({ error: failure }));
  }
  revalidatePath("/admin/reviews");
  revalidatePath("/admin/reviews/batch");
  redirect(
    batchUrl({
      batchId,
      result: "created",
      created: createdCount,
      existing: existingCount,
      published: publishedCount,
    }),
  );
}

export async function approveOfficeReviewBatchAction(formData: FormData) {
  const principal = await requireReviewer("/admin/reviews/batch");
  const batchId = readString(formData, "batchId");
  const reviewItemIds = formData
    .getAll("reviewItemIds")
    .filter((value): value is string => typeof value === "string")
    .filter((value) => uuidPattern.test(value));
  let approvedCount = 0;
  let failedCount = 0;
  let failure: string | null = null;

  try {
    const result = await approveOfficeReviewBatch({
      batchId,
      reviewItemIds,
      actorId: principal.actorId,
      reason: readString(formData, "reason"),
      reviewedValuesConfirmed:
        formData.get("reviewedValuesConfirmed") === "on",
    });
    approvedCount = result.approved.length;
    failedCount = result.failed.length;
  } catch (error) {
    if (error instanceof OfficeReviewBatchError) {
      failure = error.reason;
    } else {
      throw error;
    }
  }

  if (failure) {
    redirect(batchUrl({ batchId, error: failure }));
  }
  revalidatePath("/admin/reviews");
  revalidatePath("/admin/reviews/batch");
  revalidatePath("/offices");
  redirect(
    batchUrl({
      batchId,
      result: failedCount === 0 ? "approved" : "partial",
      approved: approvedCount,
      failed: failedCount,
    }),
  );
}
