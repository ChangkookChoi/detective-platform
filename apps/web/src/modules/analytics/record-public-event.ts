import { createHash } from "node:crypto";

import { and, eq, like, lt, sql } from "drizzle-orm";

import { getDatabase } from "@/db";
import {
  analyticsEvents,
  officeDailyMetrics,
  offices,
} from "@/db/schema";
import {
  publicAnalyticsEventTypes,
  type PublicAnalyticsEventType,
} from "@/modules/analytics/public-event-contract";

export const PUBLIC_ANALYTICS_DAILY_LIMIT = 50;
export const ANALYTICS_EVENT_RETENTION_HOURS = 48;

export type PublicAnalyticsFailure =
  | "invalid_input"
  | "office_not_found"
  | "rate_limited";

export class PublicAnalyticsError extends Error {
  constructor(public readonly reason: PublicAnalyticsFailure) {
    super(`Public analytics event failed: ${reason}`);
    this.name = "PublicAnalyticsError";
  }
}

type RecordPublicAnalyticsEventInput = {
  officeId: string;
  type: PublicAnalyticsEventType;
  sessionId: string;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const koreaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getKoreaMetricDate(value: Date) {
  const parts = koreaDateFormatter.formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new PublicAnalyticsError("invalid_input");
  }

  return `${year}-${month}-${day}`;
}

function isPublicAnalyticsEventType(
  value: string,
): value is PublicAnalyticsEventType {
  return publicAnalyticsEventTypes.includes(value as PublicAnalyticsEventType);
}

export async function recordPublicAnalyticsEvent(
  input: RecordPublicAnalyticsEventInput,
  occurredAt = new Date(),
) {
  if (
    !uuidPattern.test(input.officeId) ||
    !uuidPattern.test(input.sessionId) ||
    !isPublicAnalyticsEventType(input.type) ||
    Number.isNaN(occurredAt.getTime())
  ) {
    throw new PublicAnalyticsError("invalid_input");
  }

  const metricDate = getKoreaMetricDate(occurredAt);
  const sessionDigest = createHash("sha256")
    .update(input.sessionId)
    .digest("hex");
  const sessionScope = `v1:${metricDate}:${sessionDigest}:`;
  const deduplicationKey = `${sessionScope}${input.type}:${input.officeId}`;
  const retentionCutoff = new Date(
    occurredAt.getTime() - ANALYTICS_EVENT_RETENTION_HOURS * 60 * 60 * 1000,
  );
  const db = getDatabase();

  return db.transaction(async (tx) => {
    await tx
      .delete(analyticsEvents)
      .where(lt(analyticsEvents.occurredAt, retentionCutoff));

    const [office] = await tx
      .select({ id: offices.id })
      .from(offices)
      .where(
        and(eq(offices.id, input.officeId), eq(offices.status, "published")),
      )
      .limit(1);

    if (!office) {
      throw new PublicAnalyticsError("office_not_found");
    }

    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${sessionScope}, 0))`,
    );

    const [existing] = await tx
      .select({ id: analyticsEvents.id })
      .from(analyticsEvents)
      .where(eq(analyticsEvents.deduplicationKey, deduplicationKey))
      .limit(1);

    if (existing) {
      return { recorded: false, metricDate } as const;
    }

    const [sessionCount] = await tx
      .select({ count: sql<number>`count(*)::integer` })
      .from(analyticsEvents)
      .where(like(analyticsEvents.deduplicationKey, `${sessionScope}%`));

    if ((sessionCount?.count ?? 0) >= PUBLIC_ANALYTICS_DAILY_LIMIT) {
      throw new PublicAnalyticsError("rate_limited");
    }

    const [inserted] = await tx
      .insert(analyticsEvents)
      .values({
        officeId: input.officeId,
        type: input.type,
        occurredAt,
        deduplicationKey,
      })
      .onConflictDoNothing()
      .returning({ id: analyticsEvents.id });

    if (!inserted) {
      return { recorded: false, metricDate } as const;
    }

    const isDetailView = input.type === "office_detail_view";

    await tx
      .insert(officeDailyMetrics)
      .values({
        officeId: input.officeId,
        metricDate,
        detailViewCount: isDetailView ? 1 : 0,
        phoneClickCount: isDetailView ? 0 : 1,
        updatedAt: occurredAt,
      })
      .onConflictDoUpdate({
        target: [officeDailyMetrics.officeId, officeDailyMetrics.metricDate],
        set: isDetailView
          ? {
              detailViewCount: sql`${officeDailyMetrics.detailViewCount} + 1`,
              updatedAt: occurredAt,
            }
          : {
              phoneClickCount: sql`${officeDailyMetrics.phoneClickCount} + 1`,
              updatedAt: occurredAt,
            },
      });

    return { recorded: true, metricDate } as const;
  });
}
