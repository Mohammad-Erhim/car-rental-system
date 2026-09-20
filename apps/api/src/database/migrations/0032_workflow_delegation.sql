CREATE TABLE IF NOT EXISTS "workflow_delegation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"organization_id" uuid NOT NULL,
	"delegator_staff_id" uuid NOT NULL,
	"delegate_staff_id" uuid NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"reason" text,
	"revoked_at" timestamp with time zone,
	"created_by" uuid
);
--> statement-breakpoint
ALTER TABLE "workflow_task_assignee" ADD COLUMN "on_behalf_of" uuid;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_delegation_delegator_idx" ON "workflow_delegation" USING btree ("delegator_staff_id","valid_until");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_delegation_delegate_idx" ON "workflow_delegation" USING btree ("delegate_staff_id","valid_until");--> statement-breakpoint
ALTER TABLE "workflow_delegation" ADD CONSTRAINT "workflow_delegation_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id");--> statement-breakpoint
ALTER TABLE "workflow_delegation" ADD CONSTRAINT "workflow_delegation_delegator_fk" FOREIGN KEY ("delegator_staff_id") REFERENCES "staff_profile"("id");--> statement-breakpoint
ALTER TABLE "workflow_delegation" ADD CONSTRAINT "workflow_delegation_delegate_fk" FOREIGN KEY ("delegate_staff_id") REFERENCES "staff_profile"("id");--> statement-breakpoint
ALTER TABLE "workflow_delegation" ADD CONSTRAINT "workflow_delegation_not_self_ck" CHECK ("delegator_staff_id" <> "delegate_staff_id");--> statement-breakpoint
ALTER TABLE "workflow_delegation" ADD CONSTRAINT "workflow_delegation_window_ck" CHECK ("valid_until" > "valid_from");--> statement-breakpoint
ALTER TABLE "workflow_task_assignee" ADD CONSTRAINT "workflow_task_assignee_on_behalf_fk" FOREIGN KEY ("on_behalf_of") REFERENCES "staff_profile"("id")
