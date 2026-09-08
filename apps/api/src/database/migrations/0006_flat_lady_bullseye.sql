CREATE TABLE IF NOT EXISTS "config_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"note" text,
	"effective_from" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"submitted_by" uuid,
	"approved_at" timestamp with time zone,
	"approved_by" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_definition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"query_kind" text NOT NULL,
	"param_schema" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"min_permission" text DEFAULT 'report.read' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"organization_id" uuid NOT NULL,
	"definition_code" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'complete' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"result" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scope_note" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"organization_id" uuid NOT NULL,
	"definition_code" text NOT NULL,
	"cron" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" text DEFAULT 'true' NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_skip_reason" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "config_version_kind_key_rev_unq" ON "config_version" USING btree ("kind","key","revision");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "config_version_current_idx" ON "config_version" USING btree ("organization_id","kind","key","state");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "report_definition_code_unq" ON "report_definition" USING btree ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_run_def_idx" ON "report_run" USING btree ("organization_id","definition_code","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_schedule_org_idx" ON "report_schedule" USING btree ("organization_id","definition_code");