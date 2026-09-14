CREATE TABLE IF NOT EXISTS "invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"organization_id" uuid NOT NULL,
	"reservation_reference" text NOT NULL,
	"number" text NOT NULL,
	"doc_version" integer DEFAULT 1 NOT NULL,
	"previous_invoice_id" uuid,
	"kind" text DEFAULT 'invoice' NOT NULL,
	"currency" text NOT NULL,
	"subtotal_minor" integer NOT NULL,
	"tax_minor" integer NOT NULL,
	"total_minor" integer NOT NULL,
	"reason" text,
	"snapshot" jsonb NOT NULL,
	"issued_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_counter" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "tax_id" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "registered_address" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_org_number_unq" ON "invoice" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_reservation_idx" ON "invoice" USING btree ("reservation_reference","doc_version");