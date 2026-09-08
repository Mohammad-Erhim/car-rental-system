ALTER TABLE "customer_restriction" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_restriction" ADD COLUMN "review_notes" text;