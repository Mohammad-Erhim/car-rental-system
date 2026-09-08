CREATE TABLE IF NOT EXISTS "product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"unit_price_minor" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"taxable" boolean DEFAULT true NOT NULL,
	"max_quantity" integer DEFAULT 1 NOT NULL,
	"category_scope" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"location_scope" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_org_code_unq" ON "product" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_active_idx" ON "product" USING btree ("organization_id","active");