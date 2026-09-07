CREATE TABLE IF NOT EXISTS "inspection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"rental_id" uuid NOT NULL,
	"kind" text DEFAULT 'return' NOT NULL,
	"outcome" text DEFAULT 'pass' NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspection_finding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"inspection_id" uuid NOT NULL,
	"area" text NOT NULL,
	"severity" text DEFAULT 'minor' NOT NULL,
	"description" text NOT NULL,
	"charge_minor" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rental" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"organization_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"reservation_reference" text NOT NULL,
	"unit_id" uuid,
	"state" text DEFAULT 'awaiting_pickup' NOT NULL,
	"pickup_location_code" text NOT NULL,
	"return_location_code" text NOT NULL,
	"scheduled_pickup_at" timestamp with time zone NOT NULL,
	"scheduled_return_at" timestamp with time zone NOT NULL,
	"picked_up_at" timestamp with time zone,
	"returned_at" timestamp with time zone,
	"odometer_out_km" integer,
	"odometer_in_km" integer,
	"fuel_out_pct" integer,
	"fuel_in_pct" integer,
	"currency" text NOT NULL,
	"settlement_minor" integer DEFAULT 0 NOT NULL,
	"agreement_version" text,
	"agreement_accepted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rental_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rental_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"type" text NOT NULL,
	"reason_code" text,
	"note" text,
	"amount_delta_minor" integer DEFAULT 0 NOT NULL,
	"detail" jsonb,
	"actor_type" text DEFAULT 'staff' NOT NULL,
	"actor_id" uuid,
	"actor_label" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inspection_rental_idx" ON "inspection" USING btree ("rental_id","kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inspection_finding_insp_idx" ON "inspection_finding" USING btree ("inspection_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rental_reference_unq" ON "rental" USING btree ("reference");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rental_reservation_idx" ON "rental" USING btree ("reservation_reference");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rental_state_idx" ON "rental" USING btree ("organization_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rental_open_unit_unq" ON "rental" USING btree ("unit_id") WHERE state in ('active','overdue');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rental_event_rental_idx" ON "rental_event" USING btree ("rental_id","created_at");