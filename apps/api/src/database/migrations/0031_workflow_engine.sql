CREATE TABLE IF NOT EXISTS "workflow_binding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"organization_id" uuid NOT NULL,
	"action_key" text NOT NULL,
	"definition_id" uuid NOT NULL,
	"condition" jsonb,
	"priority" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"label" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_definition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "workflow_definition_org_code_unq" UNIQUE("organization_id","code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_definition_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"definition_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"spec" jsonb NOT NULL,
	"note" text,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"created_by" uuid,
	CONSTRAINT "workflow_definition_version_rev_unq" UNIQUE("definition_id","revision")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"task_id" uuid,
	"type" text NOT NULL,
	"actor_account_id" uuid,
	"actor_label" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_instance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"organization_id" uuid NOT NULL,
	"action_key" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"subject_version" text,
	"subject_label" text,
	"definition_id" uuid NOT NULL,
	"definition_version_id" uuid NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"initiator_account_id" uuid NOT NULL,
	"initiator_staff_id" uuid,
	"initiator_label" text,
	"location_code" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"last_error" text,
	"apply_attempts" integer DEFAULT 0 NOT NULL,
	"next_apply_at" timestamp with time zone,
	"submit_key" text,
	"closed_at" timestamp with time zone,
	"closed_reason" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"instance_id" uuid NOT NULL,
	"step_id" text NOT NULL,
	"step_type" text NOT NULL,
	"title" text NOT NULL,
	"branch_ref" text,
	"status" text DEFAULT 'open' NOT NULL,
	"outcome" text,
	"mode" text DEFAULT 'any' NOT NULL,
	"required" integer DEFAULT 1 NOT NULL,
	"exclude_initiator" boolean DEFAULT false NOT NULL,
	"require_location_scope" boolean DEFAULT false NOT NULL,
	"require_comment" boolean DEFAULT false NOT NULL,
	"allow_changes" boolean DEFAULT true NOT NULL,
	"selectors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"due_at" timestamp with time zone,
	"remind_every_hours" integer,
	"max_reminders" integer DEFAULT 0 NOT NULL,
	"reminder_count" integer DEFAULT 0 NOT NULL,
	"last_reminded_at" timestamp with time zone,
	"on_timeout" text,
	"escalated_at" timestamp with time zone,
	"resume_at" timestamp with time zone,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_task_assignee" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"task_id" uuid NOT NULL,
	"instance_id" uuid NOT NULL,
	"staff_profile_id" uuid NOT NULL,
	"source" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decision" text,
	"comment" text,
	"decided_at" timestamp with time zone,
	"decided_by_account_id" uuid,
	"seen_at" timestamp with time zone,
	CONSTRAINT "workflow_task_assignee_unq" UNIQUE("task_id","staff_profile_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_binding_action_idx" ON "workflow_binding" USING btree ("organization_id","action_key","active");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_definition_version_one_published_unq" ON "workflow_definition_version" USING btree ("definition_id") WHERE "workflow_definition_version"."status" = 'published';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_event_instance_idx" ON "workflow_event" USING btree ("instance_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_instance_one_open_unq" ON "workflow_instance" USING btree ("organization_id","action_key","subject_type","subject_id") WHERE "workflow_instance"."status" in ('running','applying','apply_failed');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_instance_subject_idx" ON "workflow_instance" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_instance_status_idx" ON "workflow_instance" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_instance_initiator_idx" ON "workflow_instance" USING btree ("initiator_account_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_instance_submit_key_unq" ON "workflow_instance" USING btree ("organization_id","initiator_account_id","submit_key") WHERE "workflow_instance"."submit_key" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_task_instance_idx" ON "workflow_task" USING btree ("instance_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_task_due_idx" ON "workflow_task" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_task_resume_idx" ON "workflow_task" USING btree ("status","resume_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_task_assignee_inbox_idx" ON "workflow_task_assignee" USING btree ("staff_profile_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_task_assignee_instance_idx" ON "workflow_task_assignee" USING btree ("instance_id");--> statement-breakpoint
ALTER TABLE "workflow_definition" ADD CONSTRAINT "workflow_definition_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id");--> statement-breakpoint
ALTER TABLE "workflow_definition_version" ADD CONSTRAINT "workflow_definition_version_def_fk" FOREIGN KEY ("definition_id") REFERENCES "workflow_definition"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_binding" ADD CONSTRAINT "workflow_binding_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id");--> statement-breakpoint
ALTER TABLE "workflow_binding" ADD CONSTRAINT "workflow_binding_def_fk" FOREIGN KEY ("definition_id") REFERENCES "workflow_definition"("id");--> statement-breakpoint
ALTER TABLE "workflow_instance" ADD CONSTRAINT "workflow_instance_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id");--> statement-breakpoint
ALTER TABLE "workflow_instance" ADD CONSTRAINT "workflow_instance_def_fk" FOREIGN KEY ("definition_id") REFERENCES "workflow_definition"("id");--> statement-breakpoint
ALTER TABLE "workflow_instance" ADD CONSTRAINT "workflow_instance_defver_fk" FOREIGN KEY ("definition_version_id") REFERENCES "workflow_definition_version"("id");--> statement-breakpoint
ALTER TABLE "workflow_task" ADD CONSTRAINT "workflow_task_instance_fk" FOREIGN KEY ("instance_id") REFERENCES "workflow_instance"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_task_assignee" ADD CONSTRAINT "workflow_task_assignee_task_fk" FOREIGN KEY ("task_id") REFERENCES "workflow_task"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_task_assignee" ADD CONSTRAINT "workflow_task_assignee_instance_fk" FOREIGN KEY ("instance_id") REFERENCES "workflow_instance"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_task_assignee" ADD CONSTRAINT "workflow_task_assignee_staff_fk" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profile"("id");--> statement-breakpoint
ALTER TABLE "workflow_event" ADD CONSTRAINT "workflow_event_instance_fk" FOREIGN KEY ("instance_id") REFERENCES "workflow_instance"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflow_definition_version" ADD CONSTRAINT "workflow_definition_version_status_ck" CHECK ("status" in ('draft','published','superseded'));--> statement-breakpoint
ALTER TABLE "workflow_instance" ADD CONSTRAINT "workflow_instance_status_ck" CHECK ("status" in ('running','applying','apply_failed','completed','rejected','withdrawn','cancelled','changes_requested','stale'));--> statement-breakpoint
ALTER TABLE "workflow_task" ADD CONSTRAINT "workflow_task_status_ck" CHECK ("status" in ('open','done','cancelled'));--> statement-breakpoint
ALTER TABLE "workflow_task_assignee" ADD CONSTRAINT "workflow_task_assignee_status_ck" CHECK ("status" in ('pending','decided','removed'))
