CREATE TYPE "public"."business_email_kind" AS ENUM('generic_business', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."marketing_consent_status" AS ENUM('consented', 'unsubscribed');--> statement-breakpoint
ALTER TYPE "public"."evidence_field" ADD VALUE 'email' BEFORE 'address';--> statement-breakpoint
CREATE TABLE "office_email_marketing_consents" (
	"office_id" uuid PRIMARY KEY NOT NULL,
	"email_normalized" text NOT NULL,
	"status" "marketing_consent_status" NOT NULL,
	"consent_source" text NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "office_email_marketing_consents_status_check" CHECK (("office_email_marketing_consents"."status" = 'consented' AND "office_email_marketing_consents"."unsubscribed_at" IS NULL) OR ("office_email_marketing_consents"."status" = 'unsubscribed' AND "office_email_marketing_consents"."unsubscribed_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "offices" ADD COLUMN "email_normalized" text;--> statement-breakpoint
ALTER TABLE "offices" ADD COLUMN "email_display" text;--> statement-breakpoint
ALTER TABLE "offices" ADD COLUMN "email_kind" "business_email_kind";--> statement-breakpoint
ALTER TABLE "office_email_marketing_consents" ADD CONSTRAINT "office_email_marketing_consents_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "office_email_marketing_consents_status_idx" ON "office_email_marketing_consents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "offices_email_normalized_idx" ON "offices" USING btree ("email_normalized");--> statement-breakpoint
ALTER TABLE "offices" ADD CONSTRAINT "offices_email_pair_check" CHECK (("offices"."email_normalized" IS NULL AND "offices"."email_display" IS NULL AND "offices"."email_kind" IS NULL) OR ("offices"."email_normalized" IS NOT NULL AND length(trim("offices"."email_normalized")) > 0 AND "offices"."email_display" IS NOT NULL AND length(trim("offices"."email_display")) > 0 AND "offices"."email_kind" IS NOT NULL));