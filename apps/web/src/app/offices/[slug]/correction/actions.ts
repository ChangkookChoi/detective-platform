"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  CorrectionRequestError,
  createCorrectionRequest,
} from "@/modules/corrections/create-correction-request";

function readString(formData: FormData, field: string) {
  const value = formData.get(field);

  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function correctionUrl(
  slug: string,
  key: "error" | "result",
  value: string,
) {
  const query = new URLSearchParams({ [key]: value });
  return `/offices/${encodeURIComponent(slug)}/correction?${query}`;
}

export async function createCorrectionRequestAction(
  slug: string,
  formData: FormData,
) {
  let failure: string | null = null;

  try {
    await createCorrectionRequest({
      officeSlug: slug,
      field: readString(formData, "field"),
      suggestedValue: readString(formData, "suggestedValue"),
      requesterRole: readString(formData, "requesterRole"),
      evidenceUrl: readString(formData, "evidenceUrl"),
      sensitiveContentConfirmed:
        formData.get("sensitiveContentConfirmed") === "confirmed",
    });
  } catch (error) {
    if (error instanceof CorrectionRequestError) {
      failure = error.reason;
    } else {
      throw error;
    }
  }

  if (failure) {
    redirect(correctionUrl(slug, "error", failure));
  }

  revalidatePath("/admin/reviews");
  redirect(correctionUrl(slug, "result", "submitted"));
}
