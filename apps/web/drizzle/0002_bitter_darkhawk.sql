CREATE TABLE "office_daily_metrics" (
	"office_id" uuid NOT NULL,
	"metric_date" date NOT NULL,
	"detail_view_count" integer DEFAULT 0 NOT NULL,
	"phone_click_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "office_daily_metrics_office_id_metric_date_pk" PRIMARY KEY("office_id","metric_date"),
	CONSTRAINT "office_daily_metrics_nonnegative_check" CHECK ("office_daily_metrics"."detail_view_count" >= 0 AND "office_daily_metrics"."phone_click_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "office_daily_metrics" ADD CONSTRAINT "office_daily_metrics_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "office_daily_metrics_date_office_idx" ON "office_daily_metrics" USING btree ("metric_date","office_id");--> statement-breakpoint
CREATE INDEX "analytics_events_occurred_at_idx" ON "analytics_events" USING btree ("occurred_at");