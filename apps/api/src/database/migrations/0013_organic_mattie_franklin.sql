ALTER TABLE "reservation" ADD COLUMN "cancel_policy" jsonb;--> statement-breakpoint
ALTER TABLE "rental" ADD COLUMN "fuel_policy" jsonb;