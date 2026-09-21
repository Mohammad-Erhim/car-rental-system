-- DEC-036: currencies are managed by operators from the dashboard (Settings -> Currencies).
-- Data only, no schema change, and safe to run more than once.

-- the five seeded currencies were locked as "system managed" like a standards list; an operator
-- can now disable and re-enable them like any other
UPDATE "lookup_value" SET "system_managed" = false WHERE "type_code" = 'currency';
--> statement-breakpoint

UPDATE "lookup_type"
SET "lock_reason" = 'Only currencies from the supported list can be added; manage them under Settings > Currencies.'
WHERE "code" = 'currency';
--> statement-breakpoint

-- exactly one default currency: the organisation's existing default, unless one is already set
UPDATE "lookup_value" v
SET "is_default" = true
FROM "organization" o
WHERE v."type_code" = 'currency'
  AND v."scope_key" = 'global'
  AND v."code" = o."default_currency"
  AND v."is_active"
  AND NOT EXISTS (
    SELECT 1 FROM "lookup_value" d
    WHERE d."type_code" = 'currency' AND d."scope_key" = 'global' AND d."is_default"
  );
