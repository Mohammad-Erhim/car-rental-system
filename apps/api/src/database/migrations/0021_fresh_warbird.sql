CREATE TABLE IF NOT EXISTS "payment_provider_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"organization_id" uuid NOT NULL,
	"active_driver" text DEFAULT 'simulator' NOT NULL,
	"test_publishable_key" text,
	"test_secret_key_ciphertext" text,
	"test_secret_key_last4" text,
	"test_webhook_secret_ciphertext" text,
	"test_configured_at" timestamp with time zone,
	"live_publishable_key" text,
	"live_secret_key_ciphertext" text,
	"live_secret_key_last4" text,
	"live_webhook_secret_ciphertext" text,
	"live_configured_at" timestamp with time zone,
	"test_key_verified_at" timestamp with time zone,
	"live_key_verified_at" timestamp with time zone,
	"live_mode_acknowledged" boolean DEFAULT false NOT NULL,
	CONSTRAINT "payment_provider_config_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
ALTER TABLE "payment_intent" ADD COLUMN "provider_customer_ref" text;--> statement-breakpoint
ALTER TABLE "payment_intent" ADD COLUMN "provider_method_ref" text;