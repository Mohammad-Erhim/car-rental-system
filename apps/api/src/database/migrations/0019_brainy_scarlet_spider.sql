CREATE TABLE IF NOT EXISTS "data_quality_finding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"organization_id" uuid NOT NULL,
	"check_id" text NOT NULL,
	"title" text NOT NULL,
	"severity" text NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"sample_hash" text NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"owner_id" uuid,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolution_note" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "data_quality_finding_check_unq" ON "data_quality_finding" USING btree ("organization_id","check_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_quality_finding_state_idx" ON "data_quality_finding" USING btree ("organization_id","state");