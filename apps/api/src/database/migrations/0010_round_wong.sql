CREATE TABLE IF NOT EXISTS "notification_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"event" text NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"audience" text DEFAULT 'primary_renter' NOT NULL,
	"delay_minutes" integer DEFAULT 0 NOT NULL,
	"quiet_hours" jsonb,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"retry_backoff_minutes" integer DEFAULT 15 NOT NULL,
	"escalate_after_attempts" integer,
	"sender_identity" text
);
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "sender" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_rule_event_channel_unq" ON "notification_rule" USING btree ("event","channel");