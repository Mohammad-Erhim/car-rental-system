CREATE TABLE IF NOT EXISTS "consent_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"reservation_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"document_version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text DEFAULT 'customer' NOT NULL,
	"actor_id" uuid,
	"ip_hash" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reservation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"organization_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"account_id" uuid,
	"customer_id" uuid,
	"holder_key" text,
	"access_token_hash" text,
	"category_code" text NOT NULL,
	"pickup_location_code" text NOT NULL,
	"return_location_code" text NOT NULL,
	"pickup_at" timestamp with time zone NOT NULL,
	"return_at" timestamp with time zone NOT NULL,
	"duration_hours" integer NOT NULL,
	"quote_reference" text NOT NULL,
	"quote_version" integer NOT NULL,
	"hold_id" uuid,
	"currency" text NOT NULL,
	"subtotal_minor" integer NOT NULL,
	"tax_minor" integer NOT NULL,
	"total_minor" integer NOT NULL,
	"paid_minor" integer DEFAULT 0 NOT NULL,
	"channel" text DEFAULT 'customer' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason_code" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reservation_driver" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"reservation_id" uuid NOT NULL,
	"role" text DEFAULT 'primary_renter' NOT NULL,
	"saved_driver_id" uuid,
	"full_name" text NOT NULL,
	"date_of_birth" text,
	"email" text,
	"phone" text,
	"licence_number" text,
	"licence_country" text,
	"licence_expires_on" text,
	"eligibility" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reservation_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"reservation_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_minor" integer NOT NULL,
	"amount_minor" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"intent_id" uuid NOT NULL,
	"reservation_reference" text NOT NULL,
	"type" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"outcome" text NOT NULL,
	"provider_ref" text,
	"failure_code" text,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_intent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"organization_id" uuid NOT NULL,
	"reservation_reference" text NOT NULL,
	"purpose" text DEFAULT 'booking' NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"state" text DEFAULT 'requires_action' NOT NULL,
	"provider" text DEFAULT 'simulator' NOT NULL,
	"provider_ref" text,
	"method_brand" text,
	"method_last4" text,
	"failure_code" text,
	"authorized_at" timestamp with time zone,
	"captured_at" timestamp with time zone,
	"refunded_minor" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recovery_case" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"severity" text DEFAULT 'high' NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"subject_type" text NOT NULL,
	"subject_ref" text NOT NULL,
	"summary" text NOT NULL,
	"detail" jsonb,
	"resolved_at" timestamp with time zone,
	"resolution_note" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consent_snapshot_res_idx" ON "consent_snapshot" USING btree ("reservation_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reservation_reference_unq" ON "reservation" USING btree ("reference");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reservation_state_idx" ON "reservation" USING btree ("organization_id","state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reservation_owner_idx" ON "reservation" USING btree ("account_id","state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reservation_quote_idx" ON "reservation" USING btree ("quote_reference");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reservation_driver_res_idx" ON "reservation_driver" USING btree ("reservation_id","role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reservation_line_res_idx" ON "reservation_line" USING btree ("reservation_id","sort_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_intent_idx" ON "payment" USING btree ("intent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_res_idx" ON "payment" USING btree ("reservation_reference");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_intent_res_purpose_unq" ON "payment_intent" USING btree ("reservation_reference","purpose");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_intent_state_idx" ON "payment_intent" USING btree ("organization_id","state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recovery_case_open_idx" ON "recovery_case" USING btree ("organization_id","state","severity");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recovery_case_subject_idx" ON "recovery_case" USING btree ("subject_type","subject_ref");