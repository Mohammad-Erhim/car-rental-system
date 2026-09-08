# CR-20260908-001 — impact-analysis.md

**Status:** pending — full analysis is done per-item when the user picks build vs. scope-out.

## First-order impact by item

- **Extras & protection** — new migration (`product` + maybe `product_version`); `pricing`/quote
  engine (add priced lines from `extraCodes`); `booking.service` (persist priced `extra` lines,
  reverse the current `422` rejection from `S7-DEF-004`); `config_version` (`product` kind +
  validator); `apps/site` checkout (a step); `/ops` new screen; agreement/receipt line rendering;
  FR-PRC / FR-BKG / FR-ADM-006 text. **Money path — highest risk; needs its own test plan.**
- **Locations editor** — `location` / `location_hours_exception` / `one_way_route` writes +
  `config_version` (`location` kind) or direct CRUD + audit; discovery/availability already
  _reads_ hours so a bad shape breaks search — contract tests first; impact-preview query;
  `/ops` screen; FR-ADM-007 text.
- **Unified search** — read-only; a new query service spanning `reservation` + `rental` +
  `customer` + `driver`; saved-views storage; `/ops/search` screen. Low data risk.
- **Customer records write side** — `customer` merge (reversible mapping row, `mergedIntoId`
  already on the schema); `customer_restriction` create/approve + a **booking/pickup guard** that
  consults active restrictions by scope + dates (touches `booking.service` + `rental.service`);
  audit; FR-ADM-001/002 text. Legal/data-integrity weight.
- **Template event rules** — `template` already has most columns; add trigger/audience/timing/
  retry/escalation/sender fields or a sibling `notification_rule` table; wire the scheduler/notify
  dispatch; FR-ADM-011 text.
- **Usage count** — read-only aggregate across the ~6 real consumer columns; `/ops` reference-data
  screen; a deactivation guard.

## Cross-cutting

- `verify:*` all re-run; new e2e per screen; `openapi.json` regen; `verify:i18n` for new keys
  (all 3 locales); `traceability-matrix.md` + `baseline-alignment.md`.
- Propagation order FR → UI-UX → SRS → code → tests (this CR touches all layers).
