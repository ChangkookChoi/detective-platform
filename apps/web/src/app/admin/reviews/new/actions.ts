"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireReviewer } from "@/modules/auth/admin-authorization";
import {
  createManualOfficeCandidate,
  ManualOfficeCandidateError,
} from "@/modules/moderation/create-manual-office-candidate";

function readString(formData: FormData, field: string) {
  const value = formData.get(field);

  if (typeof value !== "string") {
    throw new Error(`Invalid manual candidate field: ${field}`);
  }

  return value;
}

export async function createManualOfficeCandidateAction(formData: FormData) {
  const principal = await requireReviewer("/admin/reviews/new");
  let reviewItemId: string | null = null;
  let failure: string | null = null;
  let existingReviewItemId: string | null = null;

  try {
    const created = await createManualOfficeCandidate({
      actorId: principal.actorId,
      sourceUrl: readString(formData, "sourceUrl"),
      name: readString(formData, "name"),
      phoneDisplay: readString(formData, "phoneDisplay"),
      addressText: readString(formData, "addressText"),
    });
    reviewItemId = created.reviewItemId;
  } catch (error) {
    if (error instanceof ManualOfficeCandidateError) {
      failure = error.reason;
      existingReviewItemId = error.existingReviewItemId ?? null;
    } else {
      throw error;
    }
  }

  if (failure === "duplicate" && existingReviewItemId) {
    redirect(`/admin/reviews/${existingReviewItemId}?result=duplicate`);
  }

  if (failure) {
    redirect(`/admin/reviews/new?error=${failure}`);
  }

  if (!reviewItemId) {
    throw new Error("Manual office candidate was not created.");
  }

  revalidatePath("/admin/reviews");
  redirect(`/admin/reviews/${reviewItemId}?result=created`);
}
