import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const regionType = pgEnum("region_type", [
  "province",
  "city",
  "county",
  "district",
]);

export const officeStatus = pgEnum("office_status", [
  "draft",
  "published",
  "suspended",
  "closed_suspected",
  "archived",
]);

export const sourceType = pgEnum("source_type", [
  "official_website",
  "public_data",
  "official_social",
  "manual_submission",
  "other_public_source",
]);

export const sourceAccessStatus = pgEnum("source_access_status", [
  "available",
  "blocked",
  "missing_suspected",
  "paused",
]);

export const evidenceField = pgEnum("evidence_field", [
  "name",
  "phone",
  "address",
  "service_category",
  "summary",
]);

export const collectionRunStatus = pgEnum("collection_run_status", [
  "running",
  "succeeded",
  "partially_failed",
  "failed",
]);

export const reviewItemType = pgEnum("review_item_type", [
  "new_office",
  "field_change",
  "closure_suspected",
  "duplicate_suspected",
  "correction_request",
]);

export const reviewRisk = pgEnum("review_risk", ["low", "medium", "high"]);

export const reviewStatus = pgEnum("review_status", [
  "pending",
  "approved",
  "approved_with_edits",
  "rejected",
  "on_hold",
]);

export const reviewDecision = pgEnum("review_decision", [
  "approved",
  "approved_with_edits",
  "rejected",
  "on_hold",
]);

export const analyticsEventType = pgEnum("analytics_event_type", [
  "office_detail_view",
  "phone_click",
  "ad_impression",
  "ad_click",
]);

export const placementType = pgEnum("placement_type", [
  "sponsored_listing",
  "enhanced_profile",
]);

export const placementStatus = pgEnum("placement_status", [
  "draft",
  "scheduled",
  "active",
  "ended",
  "cancelled",
]);

export const regions = pgTable(
  "regions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    parentId: uuid("parent_id").references((): AnyPgColumn => regions.id, {
      onDelete: "restrict",
    }),
    type: regionType("type").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    displayOrder: integer("display_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("regions_slug_uidx").on(table.slug),
    index("regions_parent_order_idx").on(table.parentId, table.displayOrder),
    check("regions_not_self_parent_check", sql`${table.id} <> ${table.parentId}`),
  ],
);

export const serviceCategories = pgTable(
  "service_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull(),
    displayOrder: integer("display_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("service_categories_slug_uidx").on(table.slug),
    index("service_categories_active_order_idx").on(
      table.isActive,
      table.displayOrder,
    ),
  ],
);

export const offices = pgTable(
  "offices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    summary: text("summary"),
    phoneNormalized: text("phone_normalized"),
    phoneDisplay: text("phone_display"),
    addressText: text("address_text"),
    regionId: uuid("region_id")
      .notNull()
      .references(() => regions.id, { onDelete: "restrict" }),
    status: officeStatus("status").default("draft").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("offices_slug_uidx").on(table.slug),
    index("offices_public_region_idx").on(table.status, table.regionId),
    index("offices_phone_normalized_idx").on(table.phoneNormalized),
    index("offices_last_verified_at_idx").on(table.lastVerifiedAt),
    check(
      "offices_published_fields_check",
      sql`${table.status} <> 'published' OR (${table.phoneNormalized} IS NOT NULL AND length(trim(${table.phoneNormalized})) > 0 AND ${table.phoneDisplay} IS NOT NULL AND length(trim(${table.phoneDisplay})) > 0 AND ${table.addressText} IS NOT NULL AND length(trim(${table.addressText})) > 0 AND ${table.publishedAt} IS NOT NULL AND ${table.lastVerifiedAt} IS NOT NULL)`,
    ),
  ],
);

export const officeServiceCategories = pgTable(
  "office_service_categories",
  {
    officeId: uuid("office_id")
      .notNull()
      .references(() => offices.id, { onDelete: "cascade" }),
    serviceCategoryId: uuid("service_category_id")
      .notNull()
      .references(() => serviceCategories.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.officeId, table.serviceCategoryId] }),
    index("office_service_categories_category_idx").on(
      table.serviceCategoryId,
      table.officeId,
    ),
  ],
);

export const officeSources = pgTable(
  "office_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    officeId: uuid("office_id")
      .notNull()
      .references(() => offices.id, { onDelete: "cascade" }),
    sourceType: sourceType("source_type").notNull(),
    url: text("url").notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    isPrimary: boolean("is_primary").default(false).notNull(),
    accessStatus: sourceAccessStatus("access_status")
      .default("available")
      .notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("office_sources_office_url_uidx").on(table.officeId, table.url),
    uniqueIndex("office_sources_one_primary_uidx")
      .on(table.officeId)
      .where(sql`${table.isPrimary} = true`),
  ],
);

export const officeSourceEvidence = pgTable(
  "office_source_evidence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    officeSourceId: uuid("office_source_id")
      .notNull()
      .references(() => officeSources.id, { onDelete: "cascade" }),
    fieldName: evidenceField("field_name").notNull(),
    serviceCategoryId: uuid("service_category_id").references(
      () => serviceCategories.id,
      { onDelete: "restrict" },
    ),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("office_source_evidence_field_uidx")
      .on(table.officeSourceId, table.fieldName)
      .where(sql`${table.fieldName} <> 'service_category'`),
    uniqueIndex("office_source_evidence_category_uidx")
      .on(table.officeSourceId, table.fieldName, table.serviceCategoryId)
      .where(sql`${table.fieldName} = 'service_category'`),
    check(
      "office_source_evidence_category_check",
      sql`(${table.fieldName} = 'service_category' AND ${table.serviceCategoryId} IS NOT NULL) OR (${table.fieldName} <> 'service_category' AND ${table.serviceCategoryId} IS NULL)`,
    ),
  ],
);

export const collectionRuns = pgTable(
  "collection_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceName: text("source_name").notNull(),
    adapterName: text("adapter_name").notNull(),
    extractorVersion: text("extractor_version").notNull(),
    status: collectionRunStatus("status").default("running").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    discoveredCount: integer("discovered_count").default(0).notNull(),
    collectedCount: integer("collected_count").default(0).notNull(),
    failedCount: integer("failed_count").default(0).notNull(),
    errorSummary: text("error_summary"),
  },
  (table) => [index("collection_runs_started_at_idx").on(table.startedAt)],
);

export const collectedRecords = pgTable(
  "collected_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    collectionRunId: uuid("collection_run_id")
      .notNull()
      .references(() => collectionRuns.id, { onDelete: "cascade" }),
    sourceUrl: text("source_url").notNull(),
    sourceRecordKey: text("source_record_key").notNull(),
    collectedAt: timestamp("collected_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    extractedValues: jsonb("extracted_values").notNull(),
    normalizedValues: jsonb("normalized_values").notNull(),
    contentHash: text("content_hash").notNull(),
    etag: text("etag"),
    lastModified: text("last_modified"),
  },
  (table) => [
    uniqueIndex("collected_records_run_source_key_uidx").on(
      table.collectionRunId,
      table.sourceRecordKey,
    ),
    index("collected_records_content_hash_idx").on(table.contentHash),
  ],
);

export const reviewItems = pgTable(
  "review_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    officeId: uuid("office_id").references(() => offices.id, {
      onDelete: "restrict",
    }),
    collectedRecordId: uuid("collected_record_id").references(
      () => collectedRecords.id,
      { onDelete: "restrict" },
    ),
    type: reviewItemType("type").notNull(),
    risk: reviewRisk("risk").notNull(),
    status: reviewStatus("status").default("pending").notNull(),
    previousValues: jsonb("previous_values"),
    proposedValues: jsonb("proposed_values").notNull(),
    cause: text("cause").notNull(),
    submittedByActorId: text("submitted_by_actor_id"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("review_items_queue_idx").on(table.status, table.risk, table.createdAt),
  ],
);

export const reviewActions = pgTable(
  "review_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reviewItemId: uuid("review_item_id")
      .notNull()
      .references(() => reviewItems.id, { onDelete: "restrict" }),
    actorId: text("actor_id").notNull(),
    decision: reviewDecision("decision").notNull(),
    editedValues: jsonb("edited_values"),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("review_actions_item_created_idx").on(table.reviewItemId, table.createdAt)],
);

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    officeId: uuid("office_id")
      .notNull()
      .references(() => offices.id, { onDelete: "restrict" }),
    type: analyticsEventType("type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deduplicationKey: text("deduplication_key"),
  },
  (table) => [
    index("analytics_events_office_type_time_idx").on(
      table.officeId,
      table.type,
      table.occurredAt,
    ),
    index("analytics_events_occurred_at_idx").on(table.occurredAt),
    uniqueIndex("analytics_events_deduplication_uidx")
      .on(table.deduplicationKey)
      .where(sql`${table.deduplicationKey} IS NOT NULL`),
  ],
);

export const officeDailyMetrics = pgTable(
  "office_daily_metrics",
  {
    officeId: uuid("office_id")
      .notNull()
      .references(() => offices.id, { onDelete: "restrict" }),
    metricDate: date("metric_date", { mode: "string" }).notNull(),
    detailViewCount: integer("detail_view_count").default(0).notNull(),
    phoneClickCount: integer("phone_click_count").default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.officeId, table.metricDate] }),
    index("office_daily_metrics_date_office_idx").on(
      table.metricDate,
      table.officeId,
    ),
    check(
      "office_daily_metrics_nonnegative_check",
      sql`${table.detailViewCount} >= 0 AND ${table.phoneClickCount} >= 0`,
    ),
  ],
);

export const placements = pgTable(
  "placements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    officeId: uuid("office_id")
      .notNull()
      .references(() => offices.id, { onDelete: "restrict" }),
    type: placementType("type").notNull(),
    location: text("location").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: placementStatus("status").default("draft").notNull(),
    ...timestamps,
  },
  (table) => [
    index("placements_active_window_idx").on(table.status, table.startsAt, table.endsAt),
    check("placements_valid_window_check", sql`${table.endsAt} > ${table.startsAt}`),
  ],
);
