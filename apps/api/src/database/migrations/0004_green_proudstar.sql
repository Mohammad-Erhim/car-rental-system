CREATE TABLE IF NOT EXISTS "reconciliation_exception" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"organization_id" uuid NOT NULL,
	"reservation_reference" text,
	"intent_id" uuid,
	"kind" text NOT NULL,
	"ledger_amount_minor" integer,
	"provider_amount_minor" integer,
	"state" text DEFAULT 'open' NOT NULL,
	"detail" jsonb,
	"resolved_at" timestamp with time zone,
	"resolution_note" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reservation_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"reservation_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"type" text NOT NULL,
	"reason_code" text,
	"note" text,
	"before" jsonb,
	"after" jsonb,
	"amount_delta_minor" integer DEFAULT 0 NOT NULL,
	"actor_type" text DEFAULT 'customer' NOT NULL,
	"actor_id" uuid,
	"actor_label" text,
	"override_approved_by" uuid
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reconciliation_exception_open_idx" ON "reconciliation_exception" USING btree ("organization_id","state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reservation_event_res_idx" ON "reservation_event" USING btree ("reservation_id","created_at");