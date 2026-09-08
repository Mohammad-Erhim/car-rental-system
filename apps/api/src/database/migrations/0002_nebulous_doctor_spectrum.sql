CREATE TABLE IF NOT EXISTS "vehicle_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"class" text DEFAULT 'standard' NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"passengers" integer DEFAULT 5 NOT NULL,
	"luggage" integer DEFAULT 2 NOT NULL,
	"doors" integer DEFAULT 4 NOT NULL,
	"transmission" text DEFAULT 'automatic' NOT NULL,
	"image_ref" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vehicle_category_feature" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"category_id" uuid NOT NULL,
	"feature_code" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vehicle_feature" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"group" text DEFAULT 'comfort' NOT NULL,
	"icon" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vehicle_block" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"unit_id" uuid NOT NULL,
	"kind" text DEFAULT 'maintenance' NOT NULL,
	"reason_code" text,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone,
	"note" text,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vehicle_unit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"organization_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"home_location_id" uuid NOT NULL,
	"current_location_id" uuid NOT NULL,
	"vin" text NOT NULL,
	"plate" text NOT NULL,
	"plate_country" text,
	"year" text,
	"make" text,
	"model" text,
	"colour" text,
	"odometer_km" text,
	"state" text DEFAULT 'available' NOT NULL,
	"acquired_on" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"quote_version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"organization_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"category_code" text NOT NULL,
	"pickup_location_code" text NOT NULL,
	"return_location_code" text NOT NULL,
	"pickup_at" timestamp with time zone NOT NULL,
	"return_at" timestamp with time zone NOT NULL,
	"duration_hours" integer NOT NULL,
	"currency" text NOT NULL,
	"rate_plan_id" uuid NOT NULL,
	"rate_plan_version" integer NOT NULL,
	"subtotal_minor" integer NOT NULL,
	"tax_minor" integer NOT NULL,
	"total_minor" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"hold_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quote_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"quote_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_minor" integer NOT NULL,
	"amount_minor" integer NOT NULL,
	"taxable" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"organization_id" uuid NOT NULL,
	"category_code" text NOT NULL,
	"location_code" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"name" text NOT NULL,
	"effective_from" text NOT NULL,
	"effective_to" text,
	"base_day_minor" integer NOT NULL,
	"hour_minor" integer DEFAULT 0 NOT NULL,
	"min_duration_hours" integer DEFAULT 24 NOT NULL,
	"max_duration_hours" integer,
	"fees" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tax_bps" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_version" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_tier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rate_plan_id" uuid NOT NULL,
	"min_hours" integer NOT NULL,
	"day_minor" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hold" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"organization_id" uuid NOT NULL,
	"category_code" text NOT NULL,
	"pickup_location_code" text NOT NULL,
	"return_location_code" text NOT NULL,
	"pickup_at" timestamp with time zone NOT NULL,
	"return_at" timestamp with time zone NOT NULL,
	"holder_key" text NOT NULL,
	"quote_reference" text,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	"release_reason" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_category_org_code_unq" ON "vehicle_category" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vehicle_category_active_idx" ON "vehicle_category" USING btree ("organization_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_category_feature_unq" ON "vehicle_category_feature" USING btree ("category_id","feature_code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_feature_org_code_unq" ON "vehicle_feature" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vehicle_block_unit_idx" ON "vehicle_block" USING btree ("unit_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vehicle_block_window_idx" ON "vehicle_block" USING btree ("start_at","end_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_unit_vin_unq" ON "vehicle_unit" USING btree ("vin");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_unit_plate_unq" ON "vehicle_unit" USING btree ("plate");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vehicle_unit_loc_cat_idx" ON "vehicle_unit" USING btree ("current_location_id","category_id","state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vehicle_unit_org_idx" ON "vehicle_unit" USING btree ("organization_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quote_reference_version_unq" ON "quote" USING btree ("reference","quote_version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quote_status_idx" ON "quote" USING btree ("organization_id","status","expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quote_line_quote_idx" ON "quote_line" USING btree ("quote_id","sort_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_plan_lookup_idx" ON "rate_plan" USING btree ("organization_id","category_code","location_code","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_plan_range_idx" ON "rate_plan" USING btree ("effective_from","effective_to");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rate_tier_plan_minhours_unq" ON "rate_tier" USING btree ("rate_plan_id","min_hours");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hold_live_idx" ON "hold" USING btree ("organization_id","category_code","pickup_location_code","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hold_window_idx" ON "hold" USING btree ("pickup_at","return_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hold_expiry_idx" ON "hold" USING btree ("status","expires_at");