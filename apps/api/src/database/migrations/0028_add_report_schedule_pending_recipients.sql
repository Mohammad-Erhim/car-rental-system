ALTER TABLE "report_schedule" ADD COLUMN "pending_run_id" uuid;--> statement-breakpoint
ALTER TABLE "report_schedule" ADD COLUMN "pending_recipients" jsonb;