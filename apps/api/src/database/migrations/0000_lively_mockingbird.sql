CREATE TABLE IF NOT EXISTS "locale" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"code" text NOT NULL,
	"native_name" text NOT NULL,
	"english_name" text NOT NULL,
	"direction" text DEFAULT 'ltr' NOT NULL,
	"fallback_chain" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"test_only" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "translation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"namespace" text NOT NULL,
	"key" text NOT NULL,
	"locale_code" text NOT NULL,
	"value" text NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"source_revision" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"is_fallback_accepted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lookup_type" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"code" text NOT NULL,
	"classification" text NOT NULL,
	"owner_module" text NOT NULL,
	"owner_role" text,
	"scope_model" text DEFAULT 'global' NOT NULL,
	"editability" text DEFAULT 'editable' NOT NULL,
	"lock_reason" text,
	"consumer_surfaces" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cache_policy" text DEFAULT 'etag' NOT NULL,
	"required_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_sync_status" text,
	"last_sync_error" text,
	"description" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lookup_value" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"type_code" text NOT NULL,
	"code" text NOT NULL,
	"scope_key" text DEFAULT 'global' NOT NULL,
	"default_label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"effective_from" timestamp with time zone,
	"effective_to" timestamp with time zone,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"system_managed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "location" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"timezone" text NOT NULL,
	"address" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"latitude" text,
	"longitude" text,
	"contact" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"regular_hours" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"after_hours_return" boolean DEFAULT false NOT NULL,
	"pickup_instructions" text,
	"return_instructions" text,
	"supported_category_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"turnaround_minutes" integer DEFAULT 60 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "location_hours_exception" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"location_id" uuid NOT NULL,
	"date" text NOT NULL,
	"closed" boolean DEFAULT true NOT NULL,
	"open" time,
	"close" time,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "one_way_route" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"from_location_id" uuid NOT NULL,
	"to_location_id" uuid NOT NULL,
	"is_allowed" boolean DEFAULT true NOT NULL,
	"fee_code" text,
	"conditions" text,
	"effective_from" text,
	"effective_to" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"default_currency" text DEFAULT 'USD' NOT NULL,
	"default_locale" text DEFAULT 'en' NOT NULL,
	"supported_locales" jsonb DEFAULT '["en"]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"kind" text NOT NULL,
	"email" text NOT NULL,
	"email_normalized" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"phone" text,
	"phone_verified_at" timestamp with time zone,
	"password_hash" text,
	"password_algo" text DEFAULT 'argon2id',
	"status" text DEFAULT 'pending' NOT NULL,
	"display_name" text NOT NULL,
	"locale_code" text DEFAULT 'en' NOT NULL,
	"timezone" text,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_sign_in_at" timestamp with time zone,
	"last_full_auth_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_challenge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"account_id" uuid,
	"purpose" text NOT NULL,
	"channel" text NOT NULL,
	"destination" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"superseded_by_id" uuid,
	"delivery_status" text DEFAULT 'queued' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "permission_action" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"code" text NOT NULL,
	"group" text NOT NULL,
	"risk_level" text DEFAULT 'normal' NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"organization_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"permission_actions" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"account_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"audience" text NOT NULL,
	"user_agent" text,
	"ip" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"rotated_to_id" uuid,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"account_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_scope" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"role_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approval_limit_minor" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"invited_at" timestamp with time zone,
	"activated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_event" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" uuid,
	"actor_label" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"outcome" text DEFAULT 'accepted' NOT NULL,
	"reason" text,
	"before_safe" jsonb,
	"after_safe" jsonb,
	"surface" text,
	"trace_id" text,
	"request_id" text,
	"organization_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "idempotency_key" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"actor_key" text NOT NULL,
	"operation" text NOT NULL,
	"key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"result_ref" text,
	"response_status" integer,
	"response_body" jsonb,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"owner_account_id" uuid,
	"organization_id" uuid,
	"input_checksum" text,
	"input" jsonb,
	"progress" integer DEFAULT 0 NOT NULL,
	"result_ref" text,
	"accepted_count" integer DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outbox_message" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"event_version" integer DEFAULT 1 NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"aggregate_version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"trace_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stored_object" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"purpose" text NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" text,
	"object_key" text NOT NULL,
	"media_type" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"checksum_sha256" text,
	"scan_state" text DEFAULT 'pending' NOT NULL,
	"review_state" text DEFAULT 'none' NOT NULL,
	"retention_until" timestamp with time zone,
	"upload_complete" text DEFAULT 'no' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "locale_code_unq" ON "locale" USING btree ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "locale_active_idx" ON "locale" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "translation_ns_key_locale_unq" ON "translation" USING btree ("namespace","key","locale_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "translation_locale_idx" ON "translation" USING btree ("locale_code","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lookup_type_code_unq" ON "lookup_type" USING btree ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lookup_type_class_idx" ON "lookup_type" USING btree ("classification");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lookup_value_type_scope_code_unq" ON "lookup_value" USING btree ("type_code","scope_key","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lookup_value_active_idx" ON "lookup_value" USING btree ("type_code","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "location_org_code_unq" ON "location" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "location_org_idx" ON "location" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "location_hours_exc_idx" ON "location_hours_exception" USING btree ("location_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "one_way_route_pair_unq" ON "one_way_route" USING btree ("from_location_id","to_location_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organization_code_unq" ON "organization" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "account_email_normalized_unq" ON "account" USING btree ("email_normalized");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_kind_status_idx" ON "account" USING btree ("kind","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_challenge_account_purpose_idx" ON "auth_challenge" USING btree ("account_id","purpose");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_challenge_expires_idx" ON "auth_challenge" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "permission_action_code_unq" ON "permission_action" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "role_org_code_unq" ON "role" USING btree ("organization_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "session_token_hash_unq" ON "session" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_account_idx" ON "session" USING btree ("account_id","revoked_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_family_idx" ON "session" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "staff_profile_account_unq" ON "staff_profile" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_profile_org_idx" ON "staff_profile" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "audit_event_id_unq" ON "audit_event" USING btree ("id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_event_target_idx" ON "audit_event" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_event_action_time_idx" ON "audit_event" USING btree ("action","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_event_actor_idx" ON "audit_event" USING btree ("actor_type","actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_actor_op_key_unq" ON "idempotency_key" USING btree ("actor_key","operation","key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idempotency_expires_idx" ON "idempotency_key" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_status_idx" ON "job" USING btree ("status","type");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "outbox_message_id_unq" ON "outbox_message" USING btree ("id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_pending_idx" ON "outbox_message" USING btree ("delivered_at","available_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_aggregate_idx" ON "outbox_message" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stored_object_key_unq" ON "stored_object" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stored_object_owner_idx" ON "stored_object" USING btree ("owner_type","owner_id");