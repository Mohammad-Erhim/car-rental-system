# Lookup Registry

Tracks every `LOOKUP-*` / `SRC-*` option source from SRS §21.1 (49 entries): classification,
stable-code model, owner/source of truth, scope, editability, management/view surface, consumers,
storage/interface, cache propagation, localization, historical-value rule, tests, status.

Status: `NOT_STARTED` · `MODELLED` (table + seed) · `SERVED` (dynamic API + selector) ·
`MANAGED` (CRUD/deactivate/restore + audit + invalidation) · `COMPLETED` (all + tests + consumer proof).

| LOOKUP/SRC ID                                                                                                                    | Class | Owner / source of truth | Scope / editability | Surface | Storage | Status |
| -------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------- | ------------------- | ------- | ------- | ------ |
| _(populated in STAGE-001 for system-fixed states + core lookups; STAGE-002+ for domain lookups; STAGE-006 completes management)_ |       |                         |                     |         |         |        |

## Classification counts (target, from SRS §21.1)

- System-fixed invariant (state/code sets served read-only from DB rows): ~14
  (LOOKUP-VEHICLE-STATE, -RESERVATION-STATE, -RENTAL-STATE, -PAYMENT-STATE, -REFUND-STATE,
  -INCIDENT-STATE, -MAINTENANCE-STATE, -INSPECTION-STATE, -READINESS-OUTCOME,
  -PERMISSION-ACTION, -NOTIFICATION-EVENT, -DELIVERY-STATE, plus payment/delivery external maps).
- Configurable business lookup: reasons (cancel, no-show, override, refund, adjustment,
  transfer, block, case), types (incident, damage-finding, cleaning-maint, document, extra),
  vehicle-feature, discount/charge-type, licence-type.
- Externally managed / standards: country, currency, time-zone, payment-method.
- Entity-owned: location, one-way-route, vehicle-unit, vehicle-category, rate-plan, promotion,
  language-locale, inspection-checklist, staff, role, report-definition, customer, vendor-provider.

Startup integrity check (SRS-LKP-012) compares required closed code sets against DB rows and
fails `/health/ready` on drift.
