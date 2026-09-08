CREATE TABLE IF NOT EXISTS "customer_merge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"survivor_id" uuid NOT NULL,
	"merged_id" uuid NOT NULL,
	"reason" text,
	"moved_drivers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"moved_restrictions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversed_by" uuid
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_merge_survivor_idx" ON "customer_merge" USING btree ("survivor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_merge_merged_idx" ON "customer_merge" USING btree ("merged_id");