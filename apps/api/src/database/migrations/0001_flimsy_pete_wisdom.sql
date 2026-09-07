CREATE TABLE IF NOT EXISTS "customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"account_id" uuid,
	"organization_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"email_normalized" text,
	"phone" text,
	"locale_code" text DEFAULT 'en' NOT NULL,
	"timezone" text,
	"address" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"communication_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"consents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"merged_into_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_restriction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"customer_id" uuid NOT NULL,
	"category" text NOT NULL,
	"scope" text DEFAULT 'all' NOT NULL,
	"reason_code" text,
	"evidence_ref" text,
	"approved_by" uuid,
	"effective_from" timestamp with time zone,
	"effective_to" timestamp with time zone,
	"customer_notified" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "driver" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"customer_id" uuid,
	"reservation_id" uuid,
	"role" text DEFAULT 'additional' NOT NULL,
	"full_name" text NOT NULL,
	"date_of_birth" text,
	"email" text,
	"phone" text,
	"licence_number" text,
	"licence_country" text,
	"licence_type" text,
	"licence_issued_on" text,
	"licence_expires_on" text,
	"eligibility_summary" jsonb,
	"is_saved_for_reuse" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "driver_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"driver_id" uuid,
	"customer_id" uuid,
	"doc_type" text NOT NULL,
	"object_id" uuid,
	"issued_on" text,
	"expires_on" text,
	"review_state" text DEFAULT 'pending' NOT NULL,
	"review_reason" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "privacy_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"account_id" uuid NOT NULL,
	"customer_id" uuid,
	"kind" text NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"blockers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"detail" text,
	"resolution_note" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"event" text NOT NULL,
	"channel" text NOT NULL,
	"recipient" text NOT NULL,
	"recipient_ref" uuid,
	"locale_code" text DEFAULT 'en' NOT NULL,
	"template_key" text,
	"template_version" text,
	"subject" text,
	"body" text NOT NULL,
	"variables" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"delivery_state" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"source_type" text,
	"source_id" text,
	"trace_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" text NOT NULL,
	"key" text NOT NULL,
	"channel" text NOT NULL,
	"locale_code" text NOT NULL,
	"subject" text,
	"body_template" text NOT NULL,
	"variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid
);
--> statement-breakpoint
ALTER TABLE "lookup_value" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "lookup_value" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_account_unq" ON "customer" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_org_email_idx" ON "customer" USING btree ("organization_id","email_normalized");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_restriction_customer_idx" ON "customer_restriction" USING btree ("customer_id","is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "driver_customer_idx" ON "driver" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "driver_reservation_idx" ON "driver" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "driver_document_driver_idx" ON "driver_document" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "driver_document_customer_idx" ON "driver_document" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "privacy_request_account_idx" ON "privacy_request" USING btree ("account_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_event_idx" ON "notification" USING btree ("event","delivery_state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_recipient_idx" ON "notification" USING btree ("recipient_ref");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_state_idx" ON "notification" USING btree ("delivery_state","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "template_key_locale_idx" ON "template" USING btree ("key","channel","locale_code","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "template_key_channel_locale_version_unq" ON "template" USING btree ("key","channel","locale_code","version");