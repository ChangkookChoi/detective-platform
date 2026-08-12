CREATE TYPE "public"."analytics_event_type" AS ENUM('office_detail_view', 'phone_click', 'ad_impression', 'ad_click');--> statement-breakpoint
CREATE TYPE "public"."collection_run_status" AS ENUM('running', 'succeeded', 'partially_failed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."evidence_field" AS ENUM('name', 'phone', 'address', 'service_category', 'summary');--> statement-breakpoint
CREATE TYPE "public"."office_status" AS ENUM('draft', 'published', 'suspended', 'closed_suspected', 'archived');--> statement-breakpoint
CREATE TYPE "public"."placement_status" AS ENUM('draft', 'scheduled', 'active', 'ended', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."placement_type" AS ENUM('sponsored_listing', 'enhanced_profile');--> statement-breakpoint
CREATE TYPE "public"."region_type" AS ENUM('province', 'city', 'county', 'district');--> statement-breakpoint
CREATE TYPE "public"."review_decision" AS ENUM('approved', 'approved_with_edits', 'rejected', 'on_hold');--> statement-breakpoint
CREATE TYPE "public"."review_item_type" AS ENUM('new_office', 'field_change', 'closure_suspected', 'duplicate_suspected', 'correction_request');--> statement-breakpoint
CREATE TYPE "public"."review_risk" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'approved_with_edits', 'rejected', 'on_hold');--> statement-breakpoint
CREATE TYPE "public"."source_access_status" AS ENUM('available', 'blocked', 'missing_suspected', 'paused');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('official_website', 'public_data', 'official_social', 'manual_submission', 'other_public_source');--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"office_id" uuid NOT NULL,
	"type" "analytics_event_type" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deduplication_key" text
);
--> statement-breakpoint
CREATE TABLE "collected_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_run_id" uuid NOT NULL,
	"source_url" text NOT NULL,
	"source_record_key" text NOT NULL,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"extracted_values" jsonb NOT NULL,
	"normalized_values" jsonb NOT NULL,
	"content_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_name" text NOT NULL,
	"adapter_name" text NOT NULL,
	"extractor_version" text NOT NULL,
	"status" "collection_run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"discovered_count" integer DEFAULT 0 NOT NULL,
	"collected_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"error_summary" text
);
--> statement-breakpoint
CREATE TABLE "office_service_categories" (
	"office_id" uuid NOT NULL,
	"service_category_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "office_service_categories_office_id_service_category_id_pk" PRIMARY KEY("office_id","service_category_id")
);
--> statement-breakpoint
CREATE TABLE "office_source_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"office_source_id" uuid NOT NULL,
	"field_name" "evidence_field" NOT NULL,
	"service_category_id" uuid,
	"verified_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "office_source_evidence_category_check" CHECK (("office_source_evidence"."field_name" = 'service_category' AND "office_source_evidence"."service_category_id" IS NOT NULL) OR ("office_source_evidence"."field_name" <> 'service_category' AND "office_source_evidence"."service_category_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "office_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"office_id" uuid NOT NULL,
	"source_type" "source_type" NOT NULL,
	"url" text NOT NULL,
	"retrieved_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"is_primary" boolean DEFAULT false NOT NULL,
	"access_status" "source_access_status" DEFAULT 'available' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"summary" text,
	"phone_normalized" text,
	"phone_display" text,
	"address_text" text,
	"region_id" uuid NOT NULL,
	"status" "office_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"office_id" uuid NOT NULL,
	"type" "placement_type" NOT NULL,
	"location" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "placement_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "placements_valid_window_check" CHECK ("placements"."ends_at" > "placements"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"type" "region_type" NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regions_not_self_parent_check" CHECK ("regions"."id" <> "regions"."parent_id")
);
--> statement-breakpoint
CREATE TABLE "review_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_item_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"decision" "review_decision" NOT NULL,
	"edited_values" jsonb,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"office_id" uuid,
	"collected_record_id" uuid,
	"type" "review_item_type" NOT NULL,
	"risk" "review_risk" NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"previous_values" jsonb,
	"proposed_values" jsonb NOT NULL,
	"cause" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collected_records" ADD CONSTRAINT "collected_records_collection_run_id_collection_runs_id_fk" FOREIGN KEY ("collection_run_id") REFERENCES "public"."collection_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_service_categories" ADD CONSTRAINT "office_service_categories_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_service_categories" ADD CONSTRAINT "office_service_categories_service_category_id_service_categories_id_fk" FOREIGN KEY ("service_category_id") REFERENCES "public"."service_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_source_evidence" ADD CONSTRAINT "office_source_evidence_office_source_id_office_sources_id_fk" FOREIGN KEY ("office_source_id") REFERENCES "public"."office_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_source_evidence" ADD CONSTRAINT "office_source_evidence_service_category_id_service_categories_id_fk" FOREIGN KEY ("service_category_id") REFERENCES "public"."service_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_sources" ADD CONSTRAINT "office_sources_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offices" ADD CONSTRAINT "offices_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_parent_id_regions_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."regions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_actions" ADD CONSTRAINT "review_actions_review_item_id_review_items_id_fk" FOREIGN KEY ("review_item_id") REFERENCES "public"."review_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_collected_record_id_collected_records_id_fk" FOREIGN KEY ("collected_record_id") REFERENCES "public"."collected_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_events_office_type_time_idx" ON "analytics_events" USING btree ("office_id","type","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_events_deduplication_uidx" ON "analytics_events" USING btree ("deduplication_key") WHERE "analytics_events"."deduplication_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "collected_records_run_source_key_uidx" ON "collected_records" USING btree ("collection_run_id","source_record_key");--> statement-breakpoint
CREATE INDEX "collected_records_content_hash_idx" ON "collected_records" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "collection_runs_started_at_idx" ON "collection_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "office_service_categories_category_idx" ON "office_service_categories" USING btree ("service_category_id","office_id");--> statement-breakpoint
CREATE UNIQUE INDEX "office_source_evidence_field_uidx" ON "office_source_evidence" USING btree ("office_source_id","field_name") WHERE "office_source_evidence"."field_name" <> 'service_category';--> statement-breakpoint
CREATE UNIQUE INDEX "office_source_evidence_category_uidx" ON "office_source_evidence" USING btree ("office_source_id","field_name","service_category_id") WHERE "office_source_evidence"."field_name" = 'service_category';--> statement-breakpoint
CREATE UNIQUE INDEX "office_sources_office_url_uidx" ON "office_sources" USING btree ("office_id","url");--> statement-breakpoint
CREATE UNIQUE INDEX "office_sources_one_primary_uidx" ON "office_sources" USING btree ("office_id") WHERE "office_sources"."is_primary" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "offices_slug_uidx" ON "offices" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "offices_public_region_idx" ON "offices" USING btree ("status","region_id");--> statement-breakpoint
CREATE INDEX "offices_phone_normalized_idx" ON "offices" USING btree ("phone_normalized");--> statement-breakpoint
CREATE INDEX "offices_last_verified_at_idx" ON "offices" USING btree ("last_verified_at");--> statement-breakpoint
CREATE INDEX "placements_active_window_idx" ON "placements" USING btree ("status","starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "regions_slug_uidx" ON "regions" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "regions_parent_order_idx" ON "regions" USING btree ("parent_id","display_order");--> statement-breakpoint
CREATE INDEX "review_actions_item_created_idx" ON "review_actions" USING btree ("review_item_id","created_at");--> statement-breakpoint
CREATE INDEX "review_items_queue_idx" ON "review_items" USING btree ("status","risk","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "service_categories_slug_uidx" ON "service_categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "service_categories_active_order_idx" ON "service_categories" USING btree ("is_active","display_order");