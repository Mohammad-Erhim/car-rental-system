# Database & Lookup Inventory — Stage 7 Phase 1

Verified against the running `carrental_dev` (migrated to `0006`) @ `1efea67`.

## Schema — 53 tables

| Group                  | Tables                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| IAM / session          | `account`, `session`, `auth_challenge`, `staff_profile`, `role`, `permission_action`, `recovery_case`  |
| Customer               | `customer`, `customer_restriction`, `driver`, `driver_document`, `consent_snapshot`, `privacy_request` |
| Org / location         | `organization`, `location`, `location_hours_exception`, `one_way_route`                                |
| Catalogue / fleet      | `vehicle_category`, `vehicle_category_feature`, `vehicle_feature`, `vehicle_unit`, `vehicle_block`     |
| Pricing                | `rate_plan`, `rate_tier`                                                                               |
| Availability / booking | `hold`, `quote`, `quote_line`                                                                          |
| Reservation            | `reservation`, `reservation_line`, `reservation_driver`, `reservation_event`                           |
| Rental                 | `rental`, `rental_event`, `inspection`, `inspection_finding`                                           |
| Payment                | `payment`, `payment_intent`, `reconciliation_exception`                                                |
| Config / i18n / lookup | `config_version`, `lookup_type`, `lookup_value`, `locale`, `translation`, `template`                   |
| Reporting              | `report_definition`, `report_run`, `report_schedule`                                                   |
| Platform               | `audit_event`, `outbox_message`, `idempotency_key`, `job`, `notification`, `stored_object`             |

Migrations `0000`–`0006` (7). `verify:migrate` proves empty→current (4 tests). Partial unique
index `rental_open_unit_unq` (one open rental per unit). `pg_advisory_xact_lock` on checkout hold.

## Dev fixture counts (`carrental_dev`)

account 6 (5 staff + 1 customer) · role 7 · permission_action 26 · location 3 · vehicle_category 5
· vehicle_unit 54 · rate_plan 6 (5 published) · lookup_type 34 · lookup_value 239 · translation
2338 · template 15 · report_definition 5 · reservation 5 · rental 1 · customer 1.

**Thin fixtures for:** rentals (1), customers (1), reconciliation_exception (0), recovery_case (0),
privacy_request (0). Stage 7 will create these via the API during flow testing rather than seed-edit.

## Lookup catalogue — 34 types, well-classified (SRS-LKP-005/006)

| Editability                                          | Count | Types                                                                                                                                                                                                                                                      |
| ---------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `configurable / editable`                            | 16    | adjustment_reason, block_reason, cancel_reason, case_reason, charge_type, cleaning_maint_type, damage_finding, discount_type, document_type, incident_type, licence_type, no_show_reason, override_reason, refund_reason, transfer_reason, vehicle_feature |
| `external / constrained` (standards-locked)          | 4     | country, currency, payment_method, time_zone                                                                                                                                                                                                               |
| `system_fixed / read_only` (code-enforced lifecycle) | 14    | delivery_state, incident_state, inspection_state, maintenance_state, notification_event, payment_state, permission_action, readiness_outcome, reconciliation_state, refund_state, rental_state, reservation_state, security_hold_state, vehicle_state      |

Each type carries `owner_module`, `scope_model`, `consumer_surfaces`, `cache_policy` (`etag`),
`required_codes`, and a `lock_reason` citing the SRS clause. Served dynamically via
`GET /api/v1/reference-data/*` (ETag from a Redis version counter). Managed (CRUD + reorder +
deactivate/restore + audit + `CacheBus` invalidation) via `POST` routes for editable types;
read-only types reject mutation. **To verify at runtime (Phase 3):** edit → selector reflects it
with no redeploy; read-only mutation denied; inactive value hidden from new selection but still
renders in history; locale label fallback.

## Data that should be DB-backed & business-maintainable (dynamic-data audit targets)

| Area                                   | Backed by                                                    | Ops maintenance surface                      | Concern                                               |
| -------------------------------------- | ------------------------------------------------------------ | -------------------------------------------- | ----------------------------------------------------- |
| Vehicle categories / features          | `vehicle_category*`, `vehicle_feature`                       | `GET/POST /ops/catalogue/*`                  | UI surface for category editor — `S7-GAP-S7` (verify) |
| Rate plans / tiers                     | `rate_plan`, `rate_tier`                                     | `/ops/config/rate-plans`                     | OK — draft→publish                                    |
| Locations & hours                      | `location`, `location_hours_exception`, `one_way_route`      | **none** (read-only `GET /config/locations`) | `S7-GAP-S3` — no ops editor                           |
| Notification templates                 | `template` (15 rows)                                         | **none** (seed only)                         | `S7-GAP-S2` — no ops editor                           |
| Branding / theme / SEO                 | `config_version` (kinds `branding`, `seo`) + `stored_object` | `/ops/config/{branding,seo}`                 | OK                                                    |
| Translations                           | `translation` (2338)                                         | `/ops/config/translations`                   | OK — draft→review→publish                             |
| Locales                                | `locale`                                                     | `/ops/config/languages`                      | OK — add/activate/reorder                             |
| Policies (cancellation fee, fuel rate) | `config_version` kind `policy`                               | `/ops/config`                                | OK                                                    |
| Reports                                | `report_definition` (5, whitelisted)                         | `/ops/insights`                              | OK — no free SQL                                      |
| Org profile                            | `organization`                                               | read-only `GET /config/organization`         | verify if editable is required by FR-ADM              |

## Static constants (allowed technical invariants — confirm each in Phase 3)

`EXTERNAL_STANDARDS` seed maps (country/currency/time_zone/payment_method display labels),
`BOOKABLE_STATES = ['available']`, `PERMISSION_ACTIONS` catalogue (also a `system_fixed` lookup —
double representation is by design, code uses the code not the label). Grep production/build
output for fixture/demo/fallback content in Phase 3 (dynamic-data rule).
