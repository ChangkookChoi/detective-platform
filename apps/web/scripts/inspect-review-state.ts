import { config } from "dotenv";
import { asc, eq, inArray, sql } from "drizzle-orm";

import { closeDatabase, getDatabase } from "../src/db";
import {
  collectedRecords,
  collectionRuns,
  offices,
  reviewActions,
  reviewItems,
} from "../src/db/schema";
import { resolveStaffRole } from "../src/modules/auth/admin-roles";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

function readSourceName() {
  const argumentsList = process.argv.slice(2);
  const inlineValue = argumentsList
    .find((argument) => argument.startsWith("--source="))
    ?.slice("--source=".length);
  const separateIndex = argumentsList.indexOf("--source");
  const separateValue =
    separateIndex >= 0 ? argumentsList[separateIndex + 1] : undefined;
  const sourceName = (inlineValue ?? separateValue ?? "").trim();

  if (!sourceName || sourceName.length > 200) {
    throw new Error(
      "Provide one source name with --source=<registered-source-name>.",
    );
  }

  return sourceName;
}

async function main() {
  const sourceName = readSourceName();
  const db = getDatabase();

  try {
    const reviews = await db
      .select({
        reviewItemId: reviewItems.id,
        collectionRunId: collectionRuns.id,
        extractorVersion: collectionRuns.extractorVersion,
        runStatus: collectionRuns.status,
        type: reviewItems.type,
        risk: reviewItems.risk,
        status: reviewItems.status,
        submittedByActorId: reviewItems.submittedByActorId,
        createdAt: reviewItems.createdAt,
        resolvedAt: reviewItems.resolvedAt,
      })
      .from(reviewItems)
      .innerJoin(
        collectedRecords,
        eq(reviewItems.collectedRecordId, collectedRecords.id),
      )
      .innerJoin(
        collectionRuns,
        eq(collectedRecords.collectionRunId, collectionRuns.id),
      )
      .where(eq(collectionRuns.sourceName, sourceName))
      .orderBy(asc(reviewItems.createdAt));

    const reviewItemIds = reviews.map((review) => review.reviewItemId);
    const actions =
      reviewItemIds.length === 0
        ? []
        : await db
            .select({
              reviewItemId: reviewActions.reviewItemId,
              actorId: reviewActions.actorId,
            })
            .from(reviewActions)
            .where(inArray(reviewActions.reviewItemId, reviewItemIds));
    const actionsByReview = new Map<
      string,
      Array<(typeof actions)[number]>
    >();

    for (const action of actions) {
      const reviewActionsForItem =
        actionsByReview.get(action.reviewItemId) ?? [];
      reviewActionsForItem.push(action);
      actionsByReview.set(action.reviewItemId, reviewActionsForItem);
    }

    const officeCounts = await db
      .select({
        status: offices.status,
        count: sql<number>`count(*)::int`,
      })
      .from(offices)
      .groupBy(offices.status)
      .orderBy(asc(offices.status));

    console.log(
      JSON.stringify(
        {
          sourceName,
          reviewCount: reviews.length,
          reviews: reviews.map((review) => {
            const reviewActionsForItem =
              actionsByReview.get(review.reviewItemId) ?? [];

            return {
              reviewItemId: review.reviewItemId,
              collectionRunId: review.collectionRunId,
              extractorVersion: review.extractorVersion,
              runStatus: review.runStatus,
              type: review.type,
              risk: review.risk,
              status: review.status,
              actionCount: reviewActionsForItem.length,
              actionActorsAuthorized:
                reviewActionsForItem.length === 0
                  ? null
                  : reviewActionsForItem.every(
                      (action) => resolveStaffRole(action.actorId) !== null,
                    ),
              submitterAuthorized: review.submittedByActorId
                ? resolveStaffRole(review.submittedByActorId) !== null
                : null,
              createdAt: review.createdAt,
              resolvedAt: review.resolvedAt,
            };
          }),
          officeCounts,
        },
        null,
        2,
      ),
    );
  } finally {
    await closeDatabase();
  }
}

main().catch((error: unknown) => {
  const cause =
    error instanceof Error && "cause" in error ? error.cause : undefined;
  const databaseMessage =
    cause instanceof Error
      ? cause.message
      : error instanceof Error
        ? error.message
        : "Database query failed.";
  const databaseCode =
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    typeof cause.code === "string"
      ? ` (${cause.code})`
      : "";

  console.error(
    `Review state inspection failed${databaseCode}: ${databaseMessage}`,
  );
  process.exitCode = 1;
});
