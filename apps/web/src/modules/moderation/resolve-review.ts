import { eq, sql } from "drizzle-orm";

import { getDatabase } from "@/db";
import { reviewActions, reviewItems } from "@/db/schema";

export type NonApprovalDecision = "on_hold" | "rejected";

export type ReviewResolutionFailure =
  | "concurrent_change"
  | "invalid_actor"
  | "invalid_reason"
  | "invalid_status"
  | "review_item_not_found";

export class ReviewResolutionError extends Error {
  constructor(public readonly reason: ReviewResolutionFailure) {
    super(`Review resolution failed: ${reason}`);
    this.name = "ReviewResolutionError";
  }
}

type ResolveReviewInput = {
  reviewItemId: string;
  decision: NonApprovalDecision;
  actorId: string;
  reason: string;
  expectedUpdatedAt: Date;
};

export async function resolveReview(input: ResolveReviewInput) {
  const actorId = input.actorId.trim();
  const reason = input.reason.trim();

  if (!actorId) {
    throw new ReviewResolutionError("invalid_actor");
  }

  if (reason.length < 5 || reason.length > 1000) {
    throw new ReviewResolutionError("invalid_reason");
  }

  const db = getDatabase();

  return db.transaction(async (tx) => {
    const result = await tx.execute<{
      id: string;
      status: string;
      updated_at: Date;
    }>(sql`
      select id, status, updated_at
      from ${reviewItems}
      where ${reviewItems.id} = ${input.reviewItemId}
      for update
    `);
    const reviewItem = result.rows[0];

    if (!reviewItem) {
      throw new ReviewResolutionError("review_item_not_found");
    }

    if (new Date(reviewItem.updated_at).getTime() !== input.expectedUpdatedAt.getTime()) {
      throw new ReviewResolutionError("concurrent_change");
    }

    if (
      reviewItem.status !== "pending" &&
      !(reviewItem.status === "on_hold" && input.decision === "rejected")
    ) {
      throw new ReviewResolutionError("invalid_status");
    }

    const now = new Date();

    await tx.insert(reviewActions).values({
      reviewItemId: input.reviewItemId,
      actorId,
      decision: input.decision,
      reason,
    });
    const [resolved] = await tx
      .update(reviewItems)
      .set({
        status: input.decision,
        resolvedAt: input.decision === "rejected" ? now : null,
        updatedAt: now,
      })
      .where(eq(reviewItems.id, input.reviewItemId))
      .returning({
        id: reviewItems.id,
        status: reviewItems.status,
        resolvedAt: reviewItems.resolvedAt,
        updatedAt: reviewItems.updatedAt,
      });

    if (!resolved) {
      throw new ReviewResolutionError("review_item_not_found");
    }

    return resolved;
  });
}
