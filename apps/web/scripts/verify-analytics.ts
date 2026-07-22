import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { config } from "dotenv";
import { and, eq, inArray } from "drizzle-orm";

import { POST } from "../src/app/api/analytics/events/route";
import { closeDatabase, getDatabase } from "../src/db";
import {
  analyticsEvents,
  officeDailyMetrics,
  offices,
  regions,
} from "../src/db/schema";
import {
  PUBLIC_ANALYTICS_DAILY_LIMIT,
  recordPublicAnalyticsEvent,
} from "../src/modules/analytics/record-public-event";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const publishedOfficeId = "50000000-0000-4000-8000-000000000001";
const draftOfficeId = "50000000-0000-4000-8000-000000000002";
const routeSessionId = "60000000-0000-4000-8000-000000000001";
const cleanupSessionId = "60000000-0000-4000-8000-000000000002";
const limitedSessionId = "60000000-0000-4000-8000-000000000003";
const officeIds = [publishedOfficeId, draftOfficeId];

function analyticsRequest(body: unknown, origin = "http://localhost") {
  return new Request(`${origin}/api/analytics/events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify(body),
  });
}

async function cleanup() {
  const db = getDatabase();

  await db
    .delete(analyticsEvents)
    .where(inArray(analyticsEvents.officeId, officeIds));
  await db
    .delete(officeDailyMetrics)
    .where(inArray(officeDailyMetrics.officeId, officeIds));
  await db.delete(offices).where(inArray(offices.id, officeIds));
}

async function main() {
  const db = getDatabase();

  try {
    await cleanup();

    const [region] = await db
      .select({ id: regions.id })
      .from(regions)
      .where(eq(regions.slug, "seoul-gangnam"))
      .limit(1);

    assert(region, "Gangnam region seed is required");

    const now = new Date();

    await db.insert(offices).values([
      {
        id: publishedOfficeId,
        slug: "sample-analytics-office",
        name: "가상 분석 검증 사무소",
        phoneNormalized: "0200000000",
        phoneDisplay: "02-0000-0000",
        addressText: "서울특별시 강남구 가상로 1",
        regionId: region.id,
        status: "published",
        publishedAt: now,
        lastVerifiedAt: now,
      },
      {
        id: draftOfficeId,
        slug: "sample-private-analytics-office",
        name: "가상 비공개 분석 사무소",
        regionId: region.id,
        status: "draft",
      },
    ]);

    const crossOriginResponse = await POST(
      new Request("http://localhost/api/analytics/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://untrusted.invalid",
        },
        body: JSON.stringify({
          officeId: publishedOfficeId,
          type: "office_detail_view",
          sessionId: routeSessionId,
        }),
      }),
    );
    assert.equal(crossOriginResponse.status, 403);

    const invalidResponse = await POST(
      analyticsRequest({ officeId: publishedOfficeId }),
    );
    assert.equal(invalidResponse.status, 400);

    const unsupportedEventResponse = await POST(
      analyticsRequest({
        officeId: publishedOfficeId,
        type: "ad_click",
        sessionId: routeSessionId,
      }),
    );
    assert.equal(unsupportedEventResponse.status, 400);

    const privateOfficeResponse = await POST(
      analyticsRequest({
        officeId: draftOfficeId,
        type: "office_detail_view",
        sessionId: routeSessionId,
      }),
    );
    assert.equal(privateOfficeResponse.status, 404);

    const detailResponse = await POST(
      analyticsRequest({
        officeId: publishedOfficeId,
        type: "office_detail_view",
        sessionId: routeSessionId,
      }),
    );
    assert.equal(detailResponse.status, 204);

    const duplicateResponse = await POST(
      analyticsRequest({
        officeId: publishedOfficeId,
        type: "office_detail_view",
        sessionId: routeSessionId,
      }),
    );
    assert.equal(duplicateResponse.status, 204);

    const phoneResponse = await POST(
      analyticsRequest({
        officeId: publishedOfficeId,
        type: "phone_click",
        sessionId: routeSessionId,
      }),
    );
    assert.equal(phoneResponse.status, 204);

    const [initialMetric] = await db
      .select()
      .from(officeDailyMetrics)
      .where(eq(officeDailyMetrics.officeId, publishedOfficeId))
      .limit(1);
    assert(initialMetric);
    assert.equal(initialMetric.detailViewCount, 1);
    assert.equal(initialMetric.phoneClickCount, 1);

    const routeEvents = await db
      .select({ deduplicationKey: analyticsEvents.deduplicationKey })
      .from(analyticsEvents)
      .where(eq(analyticsEvents.officeId, publishedOfficeId));
    assert.equal(routeEvents.length, 2);
    assert(
      routeEvents.every(
        (event) =>
          event.deduplicationKey &&
          !event.deduplicationKey.includes(routeSessionId),
      ),
      "Raw session IDs must not be persisted",
    );

    const expiredEventId = "70000000-0000-4000-8000-000000000001";
    await db.insert(analyticsEvents).values({
      id: expiredEventId,
      officeId: publishedOfficeId,
      type: "office_detail_view",
      occurredAt: new Date(now.getTime() - 49 * 60 * 60 * 1000),
      deduplicationKey: "expired-synthetic-event",
    });
    const cleanupResult = await recordPublicAnalyticsEvent(
      {
        officeId: publishedOfficeId,
        type: "office_detail_view",
        sessionId: cleanupSessionId,
      },
      now,
    );
    assert.equal(cleanupResult.recorded, true);
    assert.equal(
      (
        await db
          .select({ id: analyticsEvents.id })
          .from(analyticsEvents)
          .where(eq(analyticsEvents.id, expiredEventId))
      ).length,
      0,
    );

    const limitedFirst = await recordPublicAnalyticsEvent(
      {
        officeId: publishedOfficeId,
        type: "office_detail_view",
        sessionId: limitedSessionId,
      },
      now,
    );
    const sessionDigest = createHash("sha256")
      .update(limitedSessionId)
      .digest("hex");
    const sessionScope = `v1:${limitedFirst.metricDate}:${sessionDigest}:`;

    await db.insert(analyticsEvents).values(
      Array.from({ length: PUBLIC_ANALYTICS_DAILY_LIMIT - 1 }, (_, index) => ({
        officeId: publishedOfficeId,
        type: "office_detail_view" as const,
        occurredAt: now,
        deduplicationKey: `${sessionScope}synthetic:${index}`,
      })),
    );

    const limitedResponse = await POST(
      analyticsRequest({
        officeId: publishedOfficeId,
        type: "phone_click",
        sessionId: limitedSessionId,
      }),
    );
    assert.equal(limitedResponse.status, 429);

    const [finalMetric] = await db
      .select()
      .from(officeDailyMetrics)
      .where(
        and(
          eq(officeDailyMetrics.officeId, publishedOfficeId),
          eq(officeDailyMetrics.metricDate, initialMetric.metricDate),
        ),
      )
      .limit(1);
    assert(finalMetric);
    assert.equal(finalMetric.detailViewCount, 3);
    assert.equal(finalMetric.phoneClickCount, 1);

    console.log(
      "Analytics API, deduplication, retention, rate limit, and daily metrics verification completed.",
    );
  } finally {
    await cleanup();
    await closeDatabase();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Analytics verification failed.",
  );
  process.exitCode = 1;
});
