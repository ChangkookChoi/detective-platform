"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireReviewer } from "@/modules/auth/admin-authorization";
import {
  OfficePublicationError,
  publishOffice,
} from "@/modules/moderation/publish-office";
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

function reviewUrl(reviewItemId: string, key: "error" | "result", value: string) {
  const query = new URLSearchParams({ [key]: value });
  return `/admin/reviews/${reviewItemId}?${query}`;
}

export async function publishReviewAction(formData: FormData) {
  const principal = await requireReviewer("/admin/reviews");
  const reviewItemId = readUuid(formData, "reviewItemId");
  const officeId = readUuid(formData, "officeId");
  const reason = readReason(formData);
  const expectedOfficeUpdatedAt = readTimestamp(
    formData,
    "expectedOfficeUpdatedAt",
  );
  let failure: string | null = null;

  try {
    await publishOffice({
      officeId,
      reviewItemId,
      actorId: principal.actorId,
      reason,
      expectedUpdatedAt: expectedOfficeUpdatedAt,
    });
  } catch (error) {
    if (error instanceof OfficePublicationError) {
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
  redirect("/admin/reviews?result=approved");
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
