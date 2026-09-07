# Car Rental System — UI/UX Design and Flow Plan

## 1. Document Information

| Field | Value |
| --- | --- |
| Document | UI/UX Design and Flow Plan |
| Project | Car Rental System |
| Version | 1.0 |
| Status | Draft baseline for independent design scoring |
| Design date | 2026-09-06 |
| Functional source | docs/ai-delivery/01-functional-requirements/functional-requirements-v1.0.md |
| Functional source status | Accepted unscored; Stage 2 explicitly skipped by user |
| Functional baseline | 104 FR IDs across APP-CWEB, APP-CMOB, and APP-OPS |
| Scope | User experience, interaction, screens, states, flows, handoffs, accessibility, localization, and lookup governance; no code |

### 1.1 Design interpretation

- Customer Web and Customer Mobile use the same logical customer screen IDs so behavior remains equivalent. Each screen specifies its web and mobile adaptation.
- APP-OPS is a responsive staff web application optimized first for desktop and tablet; high-frequency pickup, inspection, incident, and return tasks remain usable on a handheld browser.
- Exact fees, times, thresholds, languages, markets, and policies remain controlled configuration. The UI never invents a value.
- Category booking and exact-vehicle booking share the same discovery flow, but every offer explicitly labels which promise applies.
- Every listed interactive element has a stable ID and contract. Unlisted decorative imagery, static text, and status icons are not interactive.

## 2. Design Principles and Conventions

1. **Trip first:** customer discovery begins with pickup/return location and time, because availability and price have no reliable meaning without them.
2. **One confident primary action:** each screen has one visually dominant next action; secondary and destructive actions are separated.
3. **Show the full decision:** price, deposit/hold, category-versus-unit promise, eligibility, cancellation/no-show, mileage, fuel/charge, and material terms appear before commitment.
4. **Progressive disclosure:** summaries lead; uncommon conditions expand inline or open a full page/drawer. Long or consequential work never uses a cramped modal.
5. **Preserve context:** sign-in, registration, provider challenges, errors, and role handoffs return the user to the originating task with valid inputs intact.
6. **State plus next action:** pending, failed, stale, unavailable, and permission-restricted states always say what happened, who owns the next step, and what the viewer can do.
7. **Prevent before confirming:** constrain invalid dates and options early; revalidate availability, price, permission, and record version at final actions.
8. **Confirm consequences:** destructive or financial actions use a review page or focused confirmation dialog showing effect, not a generic “Are you sure?”.
9. **Dynamic sources only:** every option, entity, status label, policy, and translation comes from its authoritative stored source with loading, empty, failure, stale, inactive-history, and retry behavior.
10. **Accessible by default:** visible focus, logical reading/focus order, text labels, inline and summary errors, large touch targets, non-color status cues, reduced-motion support, and no drag-only action.
11. **Bidirectional by design:** page chrome mirrors for RTL; codes, plates, phone numbers, money, maps, images, and chronological timelines keep their semantically correct direction.
12. **Operational density with restraint:** staff screens favor scannable queues, saved filters, keyboard-efficient actions, and side-by-side context without competing dashboards or nested overlays.

### 2.1 Benchmark-informed decisions

- Discovery follows the mature rental convention of trip criteria before offers, with vehicle classes/categories clearly distinguished from guaranteed specific vehicles.
- Reservation management provides both signed-in access and a verified booking-reference path when guest reservations are enabled.
- Modification always re-prices and compares old versus new before acceptance; cancellation provides a dedicated consequence review.
- Form errors appear both beside the field and in a focusable error summary; confirmation pages show an unmistakable outcome and reference.
- Keyboard focus, target size, timeouts, reauthentication, and financial-error prevention follow current accessibility guidance.

## 3. Actor and Application Map

| Application | Primary actors | Secondary actors | Devices | Core areas | Cross-application connection |
| --- | --- | --- | --- | --- | --- |
| APP-CWEB — Customer Web | Visitor, customer, renter | Additional driver using a secure request | Responsive desktop, tablet, mobile browser | Discovery, checkout, account, reservations, active rental, payments, support | Staff actions and provider outcomes appear as reservation/rental/payment status and notifications |
| APP-CMOB — Customer Mobile | Visitor, customer, renter | Additional driver using a secure request | iOS/Android phone; tablet adaptation | Same core customer tasks, device-appropriate input and evidence capture | Handoffs preserve deep-link destination and safe locally entered drafts |
| APP-OPS — Operations/Admin | Rental agent, fleet, finance, manager, administrator, support, auditor | Authorized content/translation editor | Desktop first; tablet and handheld adaptation for field tasks | Operations, bookings, rentals, fleet, customers, finance, configuration, reports, integrations | Receives booking, payment, incident, return, configuration, and provider events; sends controlled outcomes to customers |

### 3.1 Role-based navigation visibility

| Role | Default landing area | Visible primary sections |
| --- | --- | --- |
| Rental agent | Today's Operations | Dashboard, Queues, Reservations/Rentals, Pickup, Return, Customers |
| Fleet staff | Fleet Readiness | Queues, Fleet, Transfers, Maintenance, Inspections, Availability Blocks |
| Finance staff | Finance Exceptions | Queues, Payments, Reconciliation, Reports |
| Support staff | Search | Reservations/Rentals, Customers, Service Cases; restricted financial/fleet detail |
| Manager | Location Dashboard | All scoped operations, commercial configuration, approvals, reports |
| Administrator | Administration | Staff/Roles, Reference Data, Languages, Notifications, Integrations, global policies |
| Auditor | Reports/Audit | Read-only reports, timelines, audit and data-quality views |

Unauthorized sections do not appear in navigation. Direct access shows `STATE-PERMISSION-DENIED` with a safe back destination; it never reveals hidden record data.

## 4. Global Navigation and Shared Behavior

### 4.1 Customer navigation

- Web header: brand/home, “Rent a car,” “My trips,” “Help,” language, account. Checkout replaces broad navigation with a compact header, “Back,” step progress, and help so users do not lose the task.
- Mobile: bottom navigation for Search, Trips, and Account outside checkout; compact top bar for back, title, language where relevant, and contextual help. Active rental replaces the default first card with a prominent “Current rental” entry but does not remove Search.
- Deep links validate session and ownership, then return to the exact reservation, payment, verification, or service case. Expired links provide verified recovery.

### 4.2 Operations navigation

- Desktop uses a collapsible left navigation grouped as Work, Records, Fleet, Finance, Configuration, and Insights. A top scope bar shows location/business scope, global search, notifications/tasks, language, and user menu.
- Tablet collapses navigation into a labelled menu while keeping scope and urgent tasks visible. Handheld task views use a single-column work surface with a sticky primary action; broad administration is view-only or directs to a larger screen when safe operation would be compromised.
- Record workspaces keep a persistent identity/status header and local tabs. A user returns to the same filtered list and scroll position.

### 4.3 Shared state vocabulary

| State ID | User-visible pattern | Recovery / next action |
| --- | --- | --- |
| STATE-LOADING | Skeleton matching final layout; existing content remains when refreshing | Wait; Cancel only for long jobs |
| STATE-EMPTY | Plain reason, first useful action, no fabricated sample records | Create/configure/search as permitted |
| STATE-NO-RESULTS | Active query/filter chips and “Clear filters” | Edit criteria or clear filters |
| STATE-VALIDATION | Focusable error summary plus inline field errors; valid input preserved | Correct first error; resubmit |
| STATE-FAILURE | What failed, what did not change, reference when useful | Retry, choose alternate, or contact/escalate |
| STATE-SUCCESS | Outcome, reference, resulting status, next actions | Continue to detail/list/next task |
| STATE-UNAVAILABLE | Resource/policy prevents action; no misleading enabled control | Choose explicit alternative or return |
| STATE-PERMISSION-DENIED | Access/action unavailable; no sensitive details | Back, request access, or contact owner if configured |
| STATE-STALE | Persistent warning with “Review latest”; consequential actions disabled | Refresh/merge, then explicitly retry |
| STATE-OFFLINE | Persistent connectivity banner; reads may show last-updated label | Retry; preserve safe local draft; never queue financial/destructive commit invisibly |
| STATE-PENDING | Current owner, reason, started/expected time when known | Refresh, cancel if allowed, or contact owner |
| STATE-EXPIRED | What expired and which facts must be rechecked | Restart/revalidate; never revive silently |

### 4.4 Shared interactive-element contracts

| Element ID | Label / control | Contract |
| --- | --- | --- |
| EL-SH-001 | Language | Visible in customer header and staff user menu. Opens COMP-SH-002; current language is named, not flag-only. Applying preserves screen, valid input, and focus context; failure keeps old language and offers retry. |
| EL-SH-002 | Account / user menu | Opens signed-in actions. Visitor menu offers Sign in/Register; signed-in menu offers Profile, Preferences, and Sign out. Staff menu adds scope-appropriate account/security actions. Escape closes and returns focus. |
| EL-SH-003 | Help | Opens contextual help drawer on web or full sheet on mobile with current flow guidance and support routes. It never clears the form. |
| EL-SH-004 | Back | Returns to the previous logical step, not blindly to browser history. Warns through COMP-SH-014 only when unsaved consequential edits would be lost. |
| EL-SH-005 | Retry | Repeats only the failed read/check, becomes busy once, and announces the result. It does not repeat a financial/destructive write until outcome is known. |
| EL-SH-006 | Dismiss notification | Hides non-critical transient feedback and restores focus. Critical/pending state remains in page content. |
| EL-SH-007 | Refresh latest | Fetches authoritative state, preserves safe filters/input, highlights changed fields, and re-enables actions only after validation. |
| EL-SH-008 | View activity | Opens the relevant timeline filtered to the record; customer and staff detail differ by permission. |
| EL-SH-009 | Download document | Shows document type/language/date, starts a tracked download, and reports failure with retry; unavailable documents explain owner/status. |
| EL-SH-010 | Contact support | Offers configured channels and carries the relevant reference; no sensitive detail is exposed before channel/identity checks. |

## 5. Flow Inventory

| Flow ID | Type | Name | Actors / applications | Main FR IDs | Start → final outcome |
| --- | --- | --- | --- | --- | --- |
| FLOW-CUS-001 | Primary | Search, choose, and book | Visitor/customer; APP-CWEB/APP-CMOB | FR-CAT-001–007, FR-PRC-002–007, FR-BKG-001–008, FR-PAY-001–004 | SCREEN-CUS-001 → confirmed SCREEN-CUS-007 or recoverable non-booked state |
| FLOW-CUS-002 | Alternate | Register or sign in without losing task | Visitor/customer; customer apps | FR-IAM-001–005, FR-BKG-001 | Origin → SCREEN-CUS-008/009/010 → origin restored |
| FLOW-CUS-003 | Alternate | Verified guest reservation lookup/link | Guest/customer; customer apps | FR-BKG-009, FR-IAM-002 | SCREEN-CUS-018 → SCREEN-CUS-015 or safe not-found/verification state |
| FLOW-CUS-004 | Primary | Modify reservation | Customer/support/agent; all | FR-RSV-001–002, FR-PAY-007 | SCREEN-CUS-015/SCREEN-OPS-005 → modified detail or original unchanged |
| FLOW-CUS-005 | Primary | Cancel reservation and track refund | Customer/support/agent; all | FR-RSV-003, FR-PAY-006 | Detail → SCREEN-CUS-017 → cancelled detail/refund status |
| FLOW-CUS-006 | Primary | View active rental and request extension | Customer/agent/manager; all | FR-RNT-005–007 | SCREEN-CUS-020 → SCREEN-CUS-021 → approved, pending, or unchanged |
| FLOW-CUS-007 | Exception/recovery | Request roadside help | Renter/support/fleet; all | FR-RNT-008, FR-INT-005 | SCREEN-CUS-020 → SCREEN-CUS-022 → owned service case |
| FLOW-CUS-008 | Exception/recovery | Report incident | Renter/agent/fleet; all | FR-RNT-009, FR-INT-005 | SCREEN-CUS-020 → SCREEN-CUS-022 → incident case and safe next instruction |
| FLOW-CUS-009 | Primary/alternate | Review return and after-hours check-in | Renter/agent/fleet; all | FR-RNT-011, FR-RNT-014 | SCREEN-CUS-023 → received/pending-inspection or alternate contact route |
| FLOW-CUS-010 | Administrative/support | Manage profile, drivers, privacy request | Customer/support; customer apps/OPS | FR-IAM-006–008 | Account screens → saved/verified/pending/blocked-with-next-action |
| FLOW-OPS-001 | Administrative/support | Staff-assisted booking | Agent/customer; APP-OPS + customer notifications | FR-BKG-010 and booking/payment FRs | SCREEN-OPS-006 → reservation workspace |
| FLOW-OPS-002 | Cross-application | Prepare pickup and assign vehicle | Agent/fleet; APP-OPS → customer | FR-RNT-001–002, FR-FLT-003/006 | SCREEN-OPS-007 → ready, reassignment, or service recovery |
| FLOW-OPS-003 | Primary | Verify pickup and open rental | Agent/renter; APP-OPS → customer | FR-RNT-003–005, FR-PAY-003 | SCREEN-OPS-008 → active rental or explicit abort resolution |
| FLOW-OPS-004 | Administrative/support | Handle no-show/late pickup | Agent/manager; all | FR-RSV-004 | Readiness queue → no-show, hold extended, new offer, or pickup |
| FLOW-OPS-005 | Cross-application | Approve/reject extension | Agent/manager/customer; all | FR-RNT-006–007 | Queue/rental workspace → amended rental or original obligation |
| FLOW-OPS-006 | Primary | Receive, inspect, charge, and close return | Agent/fleet/finance/customer; all | FR-RNT-011–016, FR-PAY-003/007 | SCREEN-OPS-011/018 → completed or owned review |
| FLOW-OPS-007 | Exception/recovery | Replace vehicle after incident | Agent/fleet/customer; all | FR-RNT-009–010 | Case/rental → amended active rental or termination recovery |
| FLOW-OPS-008 | Administrative/support | Block/maintain/return vehicle to service | Fleet/manager; APP-OPS | FR-FLT-003/005–007/009 | Vehicle/maintenance → available or explicit unavailable state |
| FLOW-OPS-009 | Administrative/support | Transfer vehicle | Fleet/manager; APP-OPS | FR-FLT-004 | SCREEN-OPS-016 → arrived/available or delayed impact queue |
| FLOW-OPS-010 | Administrative/support | Import/bulk update fleet | Fleet/admin; APP-OPS | FR-FLT-008 | SCREEN-OPS-020 → row-level accepted/rejected results |
| FLOW-OPS-011 | Administrative/support | Review customer restriction/duplicate | Manager/support; APP-OPS | FR-ADM-001–002 | SCREEN-OPS-022 → retained/merged/restricted/review outcome |
| FLOW-OPS-012 | Cross-application | Refund, dispute, or reconcile payment | Finance/customer/provider; all | FR-PAY-006–009, FR-INT-001/004 | SCREEN-OPS-023/024 → reconciled or owned escalation |
| FLOW-OPS-013 | Administrative/support | Publish pricing/policy/product version | Manager/admin; APP-OPS → all | FR-PRC-001/003–006, FR-ADM-005–007/010 | Config screen → scheduled/active or validation blocked |
| FLOW-OPS-014 | Administrative/support | Manage lookup values | Data steward; APP-OPS → all | FR-GBL-004, FR-ADM-008 | SCREEN-OPS-030/031 → saved/deactivated/restored or protected |
| FLOW-OPS-015 | Administrative/support | Manage staff access | Admin/manager; APP-OPS | FR-ADM-009 | SCREEN-OPS-032 → invitation/access change/reassignment |
| FLOW-OPS-016 | Administrative/support | Author and publish translation/template | Editor/reviewer/admin; APP-OPS → all | FR-ADM-011–012, FR-INT-002 | SCREEN-OPS-033/034 → published version or review correction |
| FLOW-OPS-017 | Administrative/support | Build/export/schedule report | Manager/finance/auditor; APP-OPS | FR-RPT-001–006 | SCREEN-OPS-035/036/037 → view/export/schedule/failure task |
| FLOW-OPS-018 | Exception/recovery | Resolve integration/partial failure | Authorized staff/provider; APP-OPS → all | FR-INT-001–005 | Queue/SCREEN-OPS-039 → reconciled, compensated, or escalated |
| FLOW-OPS-019 | Administrative/support | Apply post-rental charge/lost-property case | Finance/support/fleet/customer; all | FR-RNT-016, FR-PAY-007–008 | Rental/case → notified charge/reversal or property closure |

## 6. Shared Components and Interaction Patterns

| Component ID | Component | Used by | Behavior and interactive elements |
| --- | --- | --- | --- |
| COMP-SH-001 | App shell and navigation | All screens | Contains EL-SH-001–004 plus labelled primary navigation. Current location is visually and programmatically identified; hidden permissions remove items; deep links preserve destination. |
| COMP-SH-002 | Language and locale selector | All | Searchable list only when many languages; otherwise visible radio list. Apply/cancel are EL-COMP-002-01/02. Apply previews direction change, preserves work, announces fallback; cancel restores focus. |
| COMP-SH-003 | Status badge with explanation | Records/lists | Badge is not clickable unless labelled “Explain status” EL-COMP-003-01. Explanation names status meaning, timestamp, owner, and next action. Color is supplementary. |
| COMP-SH-004 | Notification/banner | All | Uses page-width status with EL-SH-006 and relevant action. Errors use COMP-SH-005 instead; pending/critical state remains until resolved. |
| COMP-SH-005 | Error summary and inline errors | Forms | EL-COMP-005-01 “Go to first error” moves focus; each summary link targets a labelled field. Errors state the correction, do not clear valid input, and remain until fixed. |
| COMP-SH-006 | Dynamic searchable combobox | Locations/large lookups/entities | EL-COMP-006-01 input, -02 clear, -03 retry. Debounced results show loading, no-results, inaccessible, unavailable, and stale states; keyboard navigation and typed text remain distinct from selection. |
| COMP-SH-007 | Date/time and location trip control | Search/modify/extension | EL-COMP-007-01 pickup location, -02 return-location “same/different” radios, -03 return location, -04 pickup date/time, -05 return date/time. Invalid/closed times are disabled with reason; manual input remains possible and time zone is named. |
| COMP-SH-008 | Itemized price summary | Quote/booking/rental/payments | EL-COMP-008-01 “View price details” expands line items; -02 “Explain deposit/hold”; -03 “View policy.” Totals, due-now/later, refund/hold, currency, expiry, and changed lines are unambiguous. |
| COMP-SH-009 | Entity picker | Staff/customer/vehicle/location selection | EL-COMP-009-01 search, -02 selected entity remove, -03 open entity. Queries owning records, masks results until deliberate selection, supports recent items only when permitted, and handles inactive historical values. |
| COMP-SH-010 | Filter/sort bar | Lists/queues/reports | EL-COMP-010-01 search, -02 filters, -03 sort, -04 clear, -05 save view. Active filters are chips; results count updates; mobile uses a full-height sheet; saving validates name/scope. |
| COMP-SH-011 | Data table / adaptive list | Staff records | Row title link EL-COMP-011-01 opens detail; selection EL-COMP-011-02 appears only with valid bulk actions; actions menu EL-COMP-011-03 is labelled with record. Mobile uses cards, not horizontal hiding of critical data. |
| COMP-SH-012 | Step/task progress | Checkout/pickup/return/config publish | EL-COMP-012-01 step links only to completed or safely editable steps; current/complete/error/pending states have text. It does not imply completion from mere navigation. |
| COMP-SH-013 | Consequence confirmation dialog | Small, single-decision actions | EL-COMP-013-01 confirm uses action-specific label; -02 cancel; close/Escape equals cancel. Initial focus is title or safe action; destructive primary is visually separated. Long review uses a page instead. |
| COMP-SH-014 | Unsaved-change guard | Editable forms | EL-COMP-014-01 keep editing, -02 discard, -03 save where valid. Triggered only for meaningful unsaved changes; provider/financial pending operations cannot be discarded as if not sent. |
| COMP-SH-015 | Activity timeline | Reservation/rental/vehicle/customer/payment | EL-SH-008 plus filter EL-COMP-015-01 and event detail EL-COMP-015-02. Chronological order remains LTR in RTL pages; customer and staff views obey masking. |
| COMP-SH-016 | Evidence/document uploader | Driver/inspection/incident/config | EL-COMP-016-01 choose/capture, -02 remove-before-submit, -03 retry. Shows allowed type/size/purpose, progress, scan/review state, and accessible preview description; failed file does not erase others. |
| COMP-SH-017 | Long-running job status | Imports/exports/reports | EL-COMP-017-01 view job, -02 cancel if safe, -03 download result, -04 retry failed rows/job. State shows progress, accepted/rejected counts, owner, expiry, and failure details. |
| COMP-SH-018 | Cross-role dependency card | Pending/exception work | EL-COMP-018-01 view request, -02 provide information, -03 cancel request where allowed, -04 contact owner. Names current owner and what initiating user sees while waiting. |
| COMP-SH-019 | Permission/approval gate | Sensitive staff actions | EL-COMP-019-01 request approval, -02 view approval, -03 cancel request. Shows protected rule, impact, approver group, status, and outcome; never exposes an enabled bypass. |
| COMP-SH-020 | Connectivity/stale-state bar | All live records | EL-SH-007 and EL-SH-005. Distinguishes offline, reconnecting, stale, and provider-pending; disables only actions whose correctness cannot be guaranteed. |
| COMP-CUS-001 | Trip search panel | SCREEN-CUS-001/002/016 | Uses COMP-SH-007 plus EL-CUS-C01-01 “Search cars.” Revalidates and navigates to results; validation focuses summary; same-location default can be changed explicitly. |
| COMP-CUS-002 | Vehicle offer card | SCREEN-CUS-002 | EL-CUS-C02-01 “View details,” -02 “Choose,” -03 “Price details.” Shows category/exact promise, representative-model label, capacity/features, availability status, total/period, and key condition. |
| COMP-CUS-003 | Checkout price rail | SCREEN-CUS-004–006 | Uses COMP-SH-008; desktop remains visible beside form, mobile is a sticky “Total” summary opening a full-height sheet. Quote changes require explicit review. |
| COMP-CUS-004 | Driver form | Checkout/profile/pickup support | Fields are defined in screen contracts; country/licence/entity options are dynamic. “Why we ask” uses EL-CUS-C04-01; save-for-future is checkbox EL-CUS-C04-02, never preselected. |
| COMP-CUS-005 | Extra/protection choice card | SCREEN-CUS-005 | EL-CUS-C05-01 add/remove extra or accept/decline protection, -02 details. Independent extras use checkboxes/quantity steppers; mutually exclusive plans use radios; unavailable state explains why. |
| COMP-CUS-006 | Payment panel | SCREEN-CUS-006/019 | EL-CUS-C06-01 payment method radio/list, -02 provider action, -03 change method. Clearly separates charge, authorization/hold, refund, and balance; unknown outcomes lock duplicate payment and offer status check. |
| COMP-CUS-007 | Reservation/rental summary | Detail and confirmation | EL-CUS-C07-01 expand section, -02 open document, -03 activity. Shows status, trip, promise, driver, extras, money, pickup/return, and next actions without hiding material terms. |
| COMP-OPS-001 | Staff scope bar | All APP-OPS screens | EL-OPS-C01-01 location/business scope combobox, -02 global record search, -03 task inbox. Scope change refreshes content, warns on unsaved work, and never broadens access beyond permission. |
| COMP-OPS-002 | Record workspace header | Staff detail screens | EL-OPS-C02-01 back to preserved list, -02 status explanation, -03 permitted actions menu, -04 activity. Identity, state, owner, location, alerts, and primary next action stay visible. |
| COMP-OPS-003 | Queue item / work card | Dashboard/queues | EL-OPS-C03-01 open, -02 assign to me, -03 change owner, -04 snooze, -05 escalate. Only valid actions appear; closing is inside the record after required outcomes. |
| COMP-OPS-004 | Workflow checklist | Pickup/return/incident/config | EL-OPS-C04-01 open step, -02 mark resolved only when evidence permits. Shows required/optional, complete/blocked/error, owner, and dependency; skipping requires explicit permission/reason. |
| COMP-OPS-005 | Approval drawer | Overrides/refunds/config/access | EL-OPS-C05-01 approve, -02 reject with reason, -03 request changes, -04 close. Shows before/after, customer/financial/inventory impact, requester, evidence, and policy boundary. |
| COMP-OPS-006 | Configuration version header | Pricing/policy/product/template/translation | EL-OPS-C06-01 save draft, -02 preview, -03 submit/approve/publish as permitted, -04 pause/supersede. Displays scope, effective period, status, owner, conflicts, and affected-record count. |
| COMP-OPS-007 | Report builder | Report screens | EL-OPS-C07-01 dimensions, -02 filters, -03 date basis, -04 run, -05 export, -06 schedule. Each control exposes definitions and permission; run labels stale/partial data. |

## 7. Application / Surface Specifications

### 7.1 APP-CWEB — Customer Web

- Purpose: public discovery and complete customer self-service in a browser.
- Navigation: responsive header; compact checkout header; account subnavigation on wide screens and a labelled section picker on small screens.
- High-frequency paths: search → offer → checkout; My Trips → detail → modify/cancel; Current Rental → extension/help/return.
- Responsive behavior: results use cards with a desktop filter rail and mobile filter sheet; checkout uses form plus price rail on wide screens and one column with a sticky total on mobile; no critical content depends on hover.
- Permissions: public catalogue/search; verified identity for reservation, account, rental, document, and payment data.
- Cross-application: operations and provider outcomes surface through status cards, timelines, and messages without revealing staff-only details.

### 7.2 APP-CMOB — Customer Mobile

- Purpose: provide the same customer outcomes with phone-native navigation, input, evidence capture, and deep links.
- Navigation: Search/Trips/Account bottom navigation outside focused flows; full-screen steps for checkout, modification, extension, and incident reporting.
- High-frequency paths: same as APP-CWEB, with active rental promoted on launch while it exists.
- Adaptive behavior: device date/time picker may be used only if it still enforces location hours/time zone; evidence capture offers camera or files; back gesture follows EL-SH-004 and unsaved-change rules.
- Connectivity: safe drafts may persist on device, visibly labelled “Not submitted”; financial, cancellation, handover, and status transitions are never invisibly queued offline.
- Cross-application: push deep links open the exact verified record and fall back to in-app notification history when expired.

### 7.3 APP-OPS — Operations and Admin Dashboard

- Purpose: one permission-scoped workspace for daily operations, records, fleet, finance, configuration, and insight.
- Navigation: left navigation plus COMP-OPS-001; record workspaces use COMP-OPS-002; list filters and positions persist on return.
- High-frequency paths: today queue → record → next workflow step; global search → customer/reservation/rental/vehicle; pickup and return guided checklists; finance exception → reconcile.
- Adaptive behavior: desktop supports two-pane workspaces; tablet stacks the inspector; handheld supports queues, scanning/search, pickup, inspection, incident, and return essentials with sticky actions. Complex configuration warns and becomes read-only on insufficient width rather than hiding fields.
- Permissions: navigation, fields, actions, exports, unmasking, approval, and scope are independently controlled. Read-only state explains the missing capability.
- Cross-application: every customer-impacting action previews what the customer will see and whether a message will be sent.

## 8. Detailed Screens and UI Elements

Global states in Section 4.3 apply to every relevant screen. A screen-specific state below overrides or adds detail. Shared component element contracts are not repeated.

### 8.1 Customer screens used by APP-CWEB and APP-CMOB

#### SCREEN-CUS-001 — Home and Trip Search

- Purpose/actors: Start a rental search; visitor or customer. Related: FR-CAT-001/002/004/005, FR-GBL-002/003/007; FLOW-CUS-001.
- Entry/exit/navigation: Brand/home, Search tab, or “Book another car”; exits to SCREEN-CUS-002, SCREEN-CUS-018, Help, or authentication while preserving trip draft.
- Hierarchy/layout: concise value heading → COMP-CUS-001 → current/upcoming rental card when signed in → optional active catalogue highlights. No carousel blocks the search task.
- Content: selected location names/time zones, same/different return, dates/times, promo entry only after trip criteria, and remembered values labelled and editable.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-CUS-001-01 | Search cars | Always visible; enabled when required criteria are valid | Runs availability with busy label; success opens SCREEN-CUS-002; validation focuses summary; service failure preserves criteria and offers EL-SH-005. |
| EL-CUS-001-02 | Use current location | Mobile or supported browser; permission not yet denied | Requests location only after activation; shows candidate locations for explicit choice; denial keeps manual combobox usable. |
| EL-CUS-001-03 | View current rental | Signed in with active rental | Opens SCREEN-CUS-020; stale status refreshes before actions. |
| EL-CUS-001-04 | Find my reservation | Guest lookup enabled | Opens SCREEN-CUS-018; current trip draft remains. |

- States/adaptation/handoff: first use has no prefilled personal data; no active locations shows a service-unavailable explanation and support. Mobile keeps search action above the keyboard; RTL mirrors field order but pickup precedes return semantically.

#### SCREEN-CUS-002 — Search Results

- Purpose/actors: Compare eligible offers; visitor/customer. Related: FR-CAT-001–007, FR-PRC-002/007; FLOW-CUS-001.
- Entry/exit/navigation: From search or modification; returns to criteria or opens SCREEN-CUS-003/004. Modification mode is visibly labelled and never overwrites original yet.
- Hierarchy/layout: trip summary/edit → result count and availability freshness → filter/sort → offer cards → alternatives/no-results.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-CUS-002-01 | Edit trip | Always | Expands COMP-CUS-001 inline on web/full-screen on mobile; applying refreshes results, cancelling keeps them. |
| EL-CUS-002-02 | Filters | Always when results/filter options exist | Opens dynamic filters; Apply shows active chips/count, Reset restores all; unavailable lookup offers retry without clearing results. |
| EL-CUS-002-03 | Sort by | When two or more valid sort choices | Select control for price/recommended/capacity choices supplied by configuration; refreshes order and announces it. |
| EL-CUS-002-04 | View details | Per offer | Opens SCREEN-CUS-003 retaining results/filters. |
| EL-CUS-002-05 | Choose | Eligible fresh offer | Revalidates; success opens SCREEN-CUS-004 and starts hold if applicable; changed/unavailable result shows comparison/alternatives. |
| EL-CUS-002-06 | Choose this alternative | No exact result with valid alternative | Creates explicit new criteria and refreshes; changed values remain highlighted. |

- States/adaptation/handoff: loading uses card skeletons; no results explains limiting criteria; stale badge disables Choose until refresh. Mobile filters use full-height sheet; list position and filters restore after details.

#### SCREEN-CUS-003 — Vehicle / Offer Details

- Purpose/actors: Understand the promised category/unit, features, conditions, and price. Related: FR-CAT-003, FR-PRC-002/005/006, FR-BKG-002; FLOW-CUS-001.
- Entry/exit/navigation: Offer card; exits back to same result position or checkout.
- Hierarchy/layout: promise label/title and imagery → capacity/key specs → itemized trip price → included/limited terms → eligibility → representative models → location notes.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-CUS-003-01 | Image previous/next | More than one image | Moves one image with labelled position; supports buttons/swipe, not swipe-only; image direction does not mirror in RTL. |
| EL-CUS-003-02 | View all features | More details exist | Expands inline; state persists on back. |
| EL-CUS-003-03 | Explain “or similar” / exact vehicle | Always for promise type | Opens plain-language explanation and substitution rule; close restores focus. |
| EL-CUS-003-04 | View price details | Valid quote | Expands COMP-SH-008; failure shows last-valid timestamp and refresh. |
| EL-CUS-003-05 | Choose this car/category | Offer eligible | Same revalidation behavior as EL-CUS-002-05. |

- States/adaptation/handoff: missing media uses labelled fallback; withdrawn offer keeps details read-only and provides alternatives. Sticky Choose on mobile never obscures price or focus.

#### SCREEN-CUS-004 — Checkout: Renter and Drivers

- Purpose/actors: Identify reservation owner, renter, payer relation, and drivers; customer/guest. Related: FR-IAM-007, FR-BKG-001–004, FR-BKG-009; FLOW-CUS-001/002.
- Entry/exit/navigation: Chosen offer; previous returns to results after warning only if hold/meaningful input would be lost; next is SCREEN-CUS-005.
- Hierarchy/layout: COMP-SH-012 → hold timer/status → account option → primary renter form → payer relation → additional drivers → COMP-CUS-003.
- Form behavior: legal name, contact, birth date/age evidence, licence number/country/expiry and required address use locale-aware labelled fields; country/licence type use dynamic searchable selects; conditional fields appear after explicit choices. Validate on blur for format and on Continue for business rules.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-CUS-004-01 | Sign in / Create account | Visitor | Starts FLOW-CUS-002 and returns here with valid data reconciled; duplicates route to recovery. |
| EL-CUS-004-02 | Primary renter is account holder | Signed-in account; checkbox | Copies permitted profile fields while leaving them editable; unchecking does not erase entered values. |
| EL-CUS-004-03 | Who will pay? | When payer distinction matters; visible radios | Sets renter/self/other permitted path; unsupported relation explains eligible options. |
| EL-CUS-004-04 | Add another driver | Policy permits | Adds one labelled driver section; count/eligibility/fees update; unavailable explains limit. |
| EL-CUS-004-05 | Remove driver | Additional driver exists | Uses focused consequence dialog when it changes price/pending invitation; success recalculates, failure keeps driver. |
| EL-CUS-004-06 | Continue to extras | Required fields locally valid | Runs eligibility; success opens SCREEN-CUS-005; review/ineligible result focuses decision card with correction/alternative/support. |

- States/adaptation/handoff: hold expiry preserves form as draft but blocks Continue until revalidation. Session expiry offers sign-in and return. Mobile uses one driver section at a time with summary cards; no horizontal stepper.

#### SCREEN-CUS-005 — Checkout: Extras and Protection

- Purpose/actors: Make independent extra and informed coverage choices. Related: FR-PRC-005/006, FR-BKG-005; FLOW-CUS-001.
- Entry/exit/navigation: From renter step; back preserves selection; next is review/payment.
- Hierarchy/layout: required/included first → optional equipment cards → protection radio groups/decline choice → updated price rail.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-CUS-005-01 | Add extra | Available item; checkbox or quantity stepper | Reserves/checks stock, updates total/status; failure reverses visual selection and offers alternative/continue without. |
| EL-CUS-005-02 | Quantity decrease/increase | Quantity item selected | Changes one unit within dynamic limits; announces total; disabled control explains limit. |
| EL-CUS-005-03 | View details | Every complex extra/protection | Expands content inline or full mobile sheet including terms and exclusions; returns focus. |
| EL-CUS-005-04 | Choose protection option | Applicable mutually exclusive set; radios | Updates price and accepted-term preview; no deceptive default for optional paid protection. |
| EL-CUS-005-05 | Continue to review | Required choice groups answered | Rechecks stock/price; changed item opens comparison; success opens SCREEN-CUS-006. |

- States/adaptation/handoff: no optional products states “No extras available for this trip” and Continue remains. Loading/error occurs per section so included content stays visible. Inactive historical items appear only during later reservation review.

#### SCREEN-CUS-006 — Checkout: Review and Payment

- Purpose/actors: Final informed review, terms acceptance, and payment. Related: FR-PRC-002/003/007, FR-BKG-004–007, FR-PAY-001–004, FR-INT-001/004; FLOW-CUS-001.
- Entry/exit/navigation: From extras; edit links return to relevant completed step; success to confirmation.
- Hierarchy/layout: trip/promise summary → renter/drivers → extras/protection → full price/deposit → payment method → required agreements → single confirmation action.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-CUS-006-01 | Edit trip/driver/extras | Relevant summary section | Returns to named step; hold remains if valid; re-entry forces price/availability recheck. |
| EL-CUS-006-02 | Payment method | Eligible methods loaded; radios | Selecting shows method-specific requirements; failure to load offers retry and blocks confirm. |
| EL-CUS-006-03 | Accept rental terms | Required unchecked checkbox | Opens terms through adjacent link; checkbox records explicit acceptance only; changed version clears and requests new acceptance. |
| EL-CUS-006-04 | Marketing preference | Only where lawful; optional unchecked checkbox | Independent from booking; changing it never enables/disables confirmation. |
| EL-CUS-006-05 | Confirm and pay / Confirm reservation | Enabled only after complete fresh review | Revalidates once, prevents repeats, runs provider action, then atomically confirms. Busy state names action; success opens SCREEN-CUS-007. |
| EL-CUS-006-06 | Check payment status | Provider outcome unknown | Queries existing attempt only; result resumes confirmation or shows safe method change/support, never creates new charge. |

- States/adaptation/handoff: price/availability change interrupts with old/new comparison and Accept changes/Return to results. Validation uses summary. Offline disables final commit while preserving draft. Back during provider action is blocked with status explanation, not a fake cancellation.

#### SCREEN-CUS-007 — Reservation Confirmation

- Purpose/actors: Provide unmistakable confirmation and next steps. Related: FR-BKG-006/008, FR-PAY-005; FLOW-CUS-001.
- Entry/exit/navigation: Only after verified booking confirmation; exits to reservation detail, document, directions, account creation, or new search.
- Hierarchy/layout: success panel with reference/status → trip/promise → payment/deposit → pickup checklist → communication status → next actions.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-CUS-007-01 | View reservation | Always | Opens SCREEN-CUS-015; refreshes status. |
| EL-CUS-007-02 | Download confirmation | Document ready | Uses EL-SH-009; pending shows owner/status. |
| EL-CUS-007-03 | Get directions | Mapping enabled | Opens directions after explicit location confirmation; provider failure leaves written address/instructions. |
| EL-CUS-007-04 | Create account to manage booking | Guest and linking enabled | Opens SCREEN-CUS-009 and returns to linked detail after verified ownership. |
| EL-CUS-007-05 | Book another car | Always | Starts fresh SCREEN-CUS-001; never duplicates current reservation. |

- States/adaptation/handoff: failed email/SMS appears as “Reservation confirmed; message not delivered” with resend/support route, never as booking failure. Duplicate confirmation request returns this same reference.

#### SCREEN-CUS-008 — Sign In

- Purpose/actors: Authenticate and return to intended task. Related: FR-IAM-003/005; FLOW-CUS-002.
- Entry/exit/navigation: Header/deep link/checkout gate; success returns to recorded destination, cancel returns to origin, recovery/registration branches.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-CUS-008-01 | Email/username | Always | Text input; errors do not confirm account existence. |
| EL-CUS-008-02 | Password | Credential sign-in enabled | Password field with labelled Show/Hide button; caps-lock hint; never logs value. |
| EL-CUS-008-03 | Sign in | Required entries present | Authenticates once; success returns to origin; failure gives safe retry/recovery or locked-review state. |
| EL-CUS-008-04 | Continue with provider | Each enabled provider | Starts external flow; cancellation returns here; conflict routes to verified account linking. |
| EL-CUS-008-05 | Forgot credentials? | Recovery enabled | Opens SCREEN-CUS-010 retaining return destination. |
| EL-CUS-008-06 | Create account | Always for customer | Opens SCREEN-CUS-009 retaining return destination. |

- States/adaptation/handoff: session already active redirects safely. Keyboard submits from last field. Provider popup/block failure offers same-tab retry; permission denial after staff sign-in shows scoped landing, not customer content.

#### SCREEN-CUS-009 — Register and Verify Contact

- Purpose/actors: Create/verify customer account. Related: FR-IAM-001/002; FLOW-CUS-002.
- Entry/exit/navigation: From sign-in/header/checkout/guest linking; success returns to origin.
- Hierarchy/layout: minimum account fields → consent → submit → same-screen verification state.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-CUS-009-01 | Account fields | Registration state | Labelled name/contact/password/language controls; inline validation; existing contact offers sign-in/recovery without creating duplicate. |
| EL-CUS-009-02 | Accept account/privacy terms | Required checkbox | Opens current notice; version change requires renewed review before submit. |
| EL-CUS-009-03 | Create account | Valid required fields | Creates pending/active account; duplicate/provider failure preserves fields and gives exact route. |
| EL-CUS-009-04 | Verification code | Pending verification | Locale-safe one-time code input; supports paste; incorrect/expired state does not erase contact. |
| EL-CUS-009-05 | Verify | Complete code | Verifies once; success returns to origin; used/expired offers resend. |
| EL-CUS-009-06 | Resend / Change contact | Pending and policy permits | Resend shows cooldown and delivery channel; Change returns to contact edit and invalidates old code. |

- States/adaptation/handoff: message delivery failure shows alternate verified channel/support. Abandonment leaves no booking confirmation; checkout draft/hold follows its own expiry.

#### SCREEN-CUS-010 — Account Recovery

- Purpose/actors: Recover credentials through a verified channel. Related: FR-IAM-004, FR-INT-002; FLOW-CUS-002.
- Entry/exit/navigation: Sign-in; success to sign-in or intended destination.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-CUS-010-01 | Account contact | Start state | Accepts configured email/phone; submission gives same neutral outcome for existing/non-existing contact. |
| EL-CUS-010-02 | Send recovery instructions | Valid format | Starts rate-controlled delivery; success shows check-channel; failure offers retry/alternate/support. |
| EL-CUS-010-03 | Recovery code/link confirmation | Valid challenge reached | Verifies expiry/use; invalid state offers new request. |
| EL-CUS-010-04 | New credentials | Verified challenge | Validates and confirms; success invalidates sessions per policy and returns safely. |
| EL-CUS-010-05 | Back to sign in | Always | Returns without losing intended destination. |

- States/adaptation/handoff: timeout is announced before expiry when possible. Reauthentication is requested only at the sensitive transition.

#### SCREEN-CUS-011 — Account Overview

- Purpose/actors: Give customer a concise account home. Related: FR-IAM-006/008, FR-RSV-001, FR-RNT-005; FLOW-CUS-010.
- Entry/exit/navigation: Account tab; links to profile, drivers, trips, payments, privacy.
- Hierarchy/layout: active rental → upcoming reservation → pending account/action cards → account sections; no generic analytics.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-CUS-011-01 | View current rental | Active rental exists | Opens SCREEN-CUS-020. |
| EL-CUS-011-02 | View upcoming reservation | Upcoming exists | Opens SCREEN-CUS-015. |
| EL-CUS-011-03 | Complete pending action | Pending verification/refund/info | Opens exact owning screen/card; returns here with refreshed state. |
| EL-CUS-011-04 | Profile / Drivers / Payments / Data requests | Signed in | Opens SCREEN-CUS-012/013/019/024 respectively. |

- States/adaptation/handoff: first-use account shows Search and add-driver optional actions. Partial load keeps independent cards usable and labels stale sections.

#### SCREEN-CUS-012 — Profile and Preferences

- Purpose/actors: Manage contact, locale, address, and communication choices. Related: FR-IAM-002/006, FR-GBL-002/003; FLOW-CUS-010.
- Entry/exit/navigation: Account; save returns to same page with success or back to overview.
- Form/layout: identity/contact, locale, address, transactional-channel availability, optional marketing preferences; sections save independently to avoid one invalid section blocking another.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-CUS-012-01 | Edit section | Permitted section | Enters inline edit; current verified status and consequences shown. |
| EL-CUS-012-02 | Save section | Changed and valid | Saves once; contact change moves to verification state; conflict shows current/entered comparison. |
| EL-CUS-012-03 | Cancel edit | Editing | Restores persisted values after unsaved guard where needed. |
| EL-CUS-012-04 | Communication preference checkbox | Optional channel/marketing choices | Saves explicit independent choices; mandatory operational messages are explained and not presented as optional. |
| EL-CUS-012-05 | Change password/sign-in methods | Available for account type | Reauthenticates, then opens focused security flow; cannot remove last usable method. |

- States/adaptation/handoff: historical agreements are not rewritten; confirmation explains “applies to future activity.” Dynamic country/address options handle unavailable service with manual entry only when policy permits.

#### SCREEN-CUS-013 — Saved Drivers and Documents

- Purpose/actors: Manage reusable driver data and document status. Related: FR-IAM-007; FLOW-CUS-010.
- Entry/exit/navigation: Account or checkout “use saved driver”; exits to overview or origin.
- Hierarchy/layout: primary renter card → additional saved driver cards → document expiry/review warnings → add/edit page section.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-CUS-013-01 | Add driver | Policy/account permits | Opens blank COMP-CUS-004; save checks duplicates/eligibility format but does not promise future eligibility. |
| EL-CUS-013-02 | Edit driver | Owner/permitted | Opens driver form; save affects future prefill only; active booking data remains snapshot. |
| EL-CUS-013-03 | Remove saved driver | Not required by active pending flow | Consequence dialog; removes saved reuse, not historical record. Blocker links to affected reservation. |
| EL-CUS-013-04 | Add/replace document | Document enabled | Uses COMP-SH-016; status becomes pending review/verified/rejected with reason and next action. |
| EL-CUS-013-05 | Use for checkout | Entered from checkout and eligible to select | Returns selected data to origin for reconfirmation. |

- States/adaptation/handoff: expired documents remain visible with “Expired”; no document empty state explains pickup may still require originals. Sensitive values are masked until reauthentication where configured.

#### SCREEN-CUS-014 — Reservations List

- Purpose/actors: Find upcoming and past reservations. Related: FR-RSV-001/007; FLOW-CUS-004/005.
- Entry/exit/navigation: Trips nav; row/card opens detail.
- Hierarchy/layout: segmented status filter (Upcoming, Active-linked, Past/Cancelled) → search/reference filter → chronological cards.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-CUS-014-01 | Reservation segment | Signed in | Visible radios/segmented control; switching loads count and keeps accessible heading. |
| EL-CUS-014-02 | Search reservations | More than configured threshold | Searches reference/location; clear restores segment. |
| EL-CUS-014-03 | Reservation card | Record visible | Opens SCREEN-CUS-015; card action has accessible name with reference/date. |
| EL-CUS-014-04 | Book a car | Empty or always secondary | Opens SCREEN-CUS-001; does not clear list state on back. |

- States/adaptation/handoff: empty distinguishes “none yet” from filtered no-results. Payment/refund pending appears as secondary status, not a replacement for reservation status.

#### SCREEN-CUS-015 — Reservation Detail

- Purpose/actors: Understand and act on one reservation. Related: FR-RSV-001–007, FR-BKG-008, FR-PAY-005/006; FLOW-CUS-003–005.
- Entry/exit/navigation: List, confirmation, guest lookup, deep link; exits to modify/cancel/payment/document/directions/active rental.
- Hierarchy/layout: COMP-CUS-007 header/status → next-action card/pickup checklist → trip and promise → drivers/extras → money/refund → policy → activity.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-CUS-015-01 | Modify reservation | Status/policy permits | Opens SCREEN-CUS-016; disabled state explains staff route. |
| EL-CUS-015-02 | Cancel reservation | Pre-rental status/policy permits | Opens SCREEN-CUS-017; after opening links to return/support instead. |
| EL-CUS-015-03 | Complete pending requirement | Pending item owned by customer | Opens exact verification/payment/driver action; success returns refreshed. |
| EL-CUS-015-04 | Report delayed arrival | Before pickup and enabled | Opens focused time/reason sheet; shows policy/availability result, then updates status or routes to staff request. |
| EL-CUS-015-05 | View/download document | Available document | Uses EL-SH-009; pending/error states explicit. |
| EL-CUS-015-06 | View current rental | Rental opened | Opens SCREEN-CUS-020. |

- States/adaptation/handoff: staff modification/cancellation while open triggers STATE-STALE and latest comparison. No terminal state exposes invalid actions. Guest access hides unrelated account navigation.

#### SCREEN-CUS-016 — Modify Reservation

- Purpose/actors: Safely change an eligible reservation. Related: FR-RSV-002, FR-CAT-005–007, FR-PRC-002, FR-PAY-007; FLOW-CUS-004.
- Entry/exit/navigation: Reservation detail; cancel/back leaves original unchanged; success returns to updated detail.
- Hierarchy/layout: original summary fixed at top → choose change section → dynamic fields → available replacement → old/new comparison → confirm.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-CUS-016-01 | Change trip / vehicle / drivers / extras | Only permitted categories; visible radio/cards | Reveals one focused editor; switching retains valid drafts but comparison includes all changes. |
| EL-CUS-016-02 | Check availability and price | Valid proposed changes | Runs checks; shows explicit old/new and affected terms; unavailable offers transparent alternatives. |
| EL-CUS-016-03 | Accept alternative | Alternative selected | Updates proposal only; original remains until final confirm. |
| EL-CUS-016-04 | Confirm changes and pay/refund | Fresh checks and accepted comparison | Commits as one action; success returns detail; failure preserves original and shows any owned payment resolution. |
| EL-CUS-016-05 | Discard changes | Proposal exists | Consequence dialog, then returns unchanged; cannot cancel an unknown provider action. |

- States/adaptation/handoff: concurrent staff change disables commit and shows latest/original/proposal. Mobile uses a task-list pattern with a final comparison page, not nested modals.

#### SCREEN-CUS-017 — Cancellation Review

- Purpose/actors: Review consequences and cancel. Related: FR-RSV-003, FR-PAY-006; FLOW-CUS-005.
- Entry/exit/navigation: Detail; keep reservation returns unchanged; success returns to cancelled detail.
- Hierarchy/layout: reservation identity → cancellation deadline/policy → released items → retained/refundable breakdown → reason if configured → final action.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-CUS-017-01 | Cancellation reason | Configured; dynamic radio/select based on count | Required only by policy; loading failure blocks cancellation only if genuinely mandatory and offers retry/support. |
| EL-CUS-017-02 | Cancel reservation | Eligible and fresh | Revalidates, then cancels once. Busy prevents repeat; success shows cancelled status and refund tracking. |
| EL-CUS-017-03 | Keep reservation | Always before commit | Returns to detail with no change. |
| EL-CUS-017-04 | Track refund | Refund initiated | Opens SCREEN-CUS-019 anchored to refund. |

- States/adaptation/handoff: already-cancelled returns to existing outcome; price/refund policy changed refreshes breakdown before commit. Message/refund failure never displays cancellation as failed.

#### SCREEN-CUS-018 — Guest Reservation Lookup

- Purpose/actors: Securely access one guest booking. Related: FR-BKG-009, FR-IAM-002; FLOW-CUS-003.
- Entry/exit/navigation: Home/header/deep link; verified success to detail.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-CUS-018-01 | Reservation reference | Always | Accepts normalized reference; does not reveal existence until verification. |
| EL-CUS-018-02 | Contact verification value | Always | Accepts configured matching contact fragment/full value without exposing stored value. |
| EL-CUS-018-03 | Find reservation | Valid formats | Produces neutral verify/check message; success may send challenge; no match offers retry/support without data disclosure. |
| EL-CUS-018-04 | Verification code | Challenge sent | Verifies once; expired/used offers resend. |
| EL-CUS-018-05 | Continue to reservation | Verified session | Opens SCREEN-CUS-015 scoped only to that reservation. |

- States/adaptation/handoff: rate-limited state shows when retry is available. Sign-in link preserves reference and can link only after ownership verification.

#### SCREEN-CUS-019 — Payments, Receipts, and Refunds

- Purpose/actors: Explain transaction history and pending financial outcomes. Related: FR-PAY-003/005–008; FLOW-CUS-005/OPS-012.
- Entry/exit/navigation: Account or reservation/rental money section; detail remains linked.
- Hierarchy/layout: balance/status summary → transaction/refund list → selected item detail/evidence → dispute/contact route.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-CUS-019-01 | Transaction row/card | Visible permitted record | Opens item detail, distinguishes charge/hold/release/refund/dispute. |
| EL-CUS-019-02 | Download receipt/statement | Document available | Uses EL-SH-009. |
| EL-CUS-019-03 | Check pending status | Pending/unknown item | Refreshes existing provider-linked state only. |
| EL-CUS-019-04 | Question or dispute this item | Policy permits | Opens support/case form with transaction selected; submission gives case reference/status. |

- States/adaptation/handoff: multi-currency records are not added together. Failed refund shows cancellation unchanged and finance owner/status. Empty means no payments for this scope, not zero balance.

#### SCREEN-CUS-020 — Active Rental

- Purpose/actors: Current-rental command center. Related: FR-RNT-005–009, FR-PAY-005; FLOW-CUS-006–009.
- Entry/exit/navigation: Account/home/reservation/deep link; exits to extension, help/incident, return, documents.
- Hierarchy/layout: urgent status/due time → vehicle and agreement → next return → key terms/current known balance → large task actions → activity.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-CUS-020-01 | Request extension | Active and policy allows | Opens SCREEN-CUS-021; disabled shows return/support route. |
| EL-CUS-020-02 | Get roadside help | Active | Opens SCREEN-CUS-022 in assistance mode; emergency instructions remain visible. |
| EL-CUS-020-03 | Report incident | Active | Opens SCREEN-CUS-022 in incident mode. |
| EL-CUS-020-04 | Return instructions | Active/overdue/return-started | Opens SCREEN-CUS-023 with current location/time policy. |
| EL-CUS-020-05 | View agreement / payment | Document or money section | Opens/downloads agreement or SCREEN-CUS-019. |

- States/adaptation/handoff: overdue is prominent without alarm-only color and shows unapproved status/next action. Offline keeps support phone/details visible but marks forms unsent until explicit submission.

#### SCREEN-CUS-021 — Extension Review

- Purpose/actors: Propose, price, and confirm or request an extension. Related: FR-RNT-006/007, FR-CAT-005, FR-PAY-007; FLOW-CUS-006/OPS-005.
- Entry/exit/navigation: Active rental; cancel returns unchanged.
- Hierarchy/layout: current due time → new return controls → check result → price/terms difference → confirm/request.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-CUS-021-01 | New return date/time/location | Active rental | Uses constrained controls and location time zone; invalid choices explain rule. |
| EL-CUS-021-02 | Check extension | Valid proposal | Runs availability/maintenance/price/payment checks; shows approved self-service, staff-review, or unavailable alternatives. |
| EL-CUS-021-03 | Confirm extension / Send request | Fresh result | Self-service commits payment/amendment or creates owned request; success shows new due time or pending owner. |
| EL-CUS-021-04 | Keep current return | Always before commit | Returns to active rental unchanged. |

- States/adaptation/handoff: while pending, customer sees original due time remains binding unless approval says otherwise. Unknown payment locks repeat and links to status check.

#### SCREEN-CUS-022 — Roadside Help and Incident Report

- Purpose/actors: Capture minimum safe facts and create an owned case. Related: FR-RNT-008–010, FR-INT-005; FLOW-CUS-007/008.
- Entry/exit/navigation: Active rental/help deep link; success stays on case status or returns active rental.
- Hierarchy/layout: immediate configured safety/contact notice → mode choice → location/contact → issue/incident facts → evidence optional/required → review/submit → case status.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-CUS-022-01 | Roadside issue / Incident | Start; visible radios | Chooses tailored questions; switching warns only if entered answers would be lost. |
| EL-CUS-022-02 | Use current location | Device supports | Requests permission on activation; user confirms map/address candidate; manual description remains. |
| EL-CUS-022-03 | Vehicle drivable? | Applicable; visible radios including “Not sure” | Changes guidance/routing without requiring diagnosis. |
| EL-CUS-022-04 | Add evidence | Applicable | Uses COMP-SH-016; failure permits retry and does not lose narrative. |
| EL-CUS-022-05 | Submit report/request | Minimum safe facts complete and online | Creates once; returns case reference, owner, status, next instructions; provider failure falls back to contact route. |
| EL-CUS-022-06 | Call configured assistance | Available channel | Opens device call confirmation with case/rental reference visible; call result is not falsely treated as case resolution. |

- States/adaptation/handoff: offline draft is clearly “Not submitted”; urgent contact information is available without form completion. Staff sees case on SCREEN-OPS-012; customer sees status changes and requests for information.

#### SCREEN-CUS-023 — Return Instructions and After-Hours Check-in

- Purpose/actors: Guide valid return and optionally record after-hours arrival. Related: FR-RNT-007/011/014; FLOW-CUS-009.
- Entry/exit/navigation: Active rental; directions/help/after-hours submission; returns to rental status.
- Hierarchy/layout: due/location/time zone → directions/written instructions → fuel/charge and key/equipment checklist → hours/after-hours terms → check-in form when enabled.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-CUS-023-01 | Get directions | Mapping enabled | Opens provider after showing exact location; failure preserves address/instructions. |
| EL-CUS-023-02 | Report early/late return | Policy permits | Opens time proposal and effect summary; late proposal may route to extension. |
| EL-CUS-023-03 | Start after-hours check-in | Location/time eligible | Opens focused fields for parked location, time, key drop, odometer/fuel/charge, issue/evidence. |
| EL-CUS-023-04 | Submit after-hours return | Required acknowledgement/data complete and online | Creates receipt/pending-inspection state once; clearly states custody/risk rule and staff follow-up. |
| EL-CUS-023-05 | Contact location | Always when configured | Opens verified contact options; includes rental reference. |

- States/adaptation/handoff: ineligible after-hours state gives opening hours and alternate route. Customer check-in appears in return queue; it never marks inspection complete.

#### SCREEN-CUS-024 — Account Data Requests and Closure

- Purpose/actors: Request access, correction, or account closure. Related: FR-IAM-008; FLOW-CUS-010.
- Entry/exit/navigation: Account settings; request detail/status or overview.
- Hierarchy/layout: request type cards → consequences/identity check → submission → request list/status.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-CUS-024-01 | Access / Correct / Close account | Available request types; visible cards/radios | Shows type-specific scope, retention, and prerequisites. |
| EL-CUS-024-02 | Verify identity | Before sensitive request | Starts reauthentication/verification and returns to draft. |
| EL-CUS-024-03 | Submit request | Verified and required details complete | Creates case reference/status; active rental/balance blocker is explained with direct next action. |
| EL-CUS-024-04 | Cancel request | Pending and policy permits | Shows consequence dialog; success updates terminal status; failure retains pending. |
| EL-CUS-024-05 | View request | Existing request | Opens timeline, owner/status, response, and next action. |

- States/adaptation/handoff: closure never implies immediate erasure of retained records. Staff receives scoped task without broader account access.

### 8.2 APP-OPS screens

#### SCREEN-OPS-001 — Staff Sign In

- Purpose/actors: Secure staff access and scoped landing. Related: FR-IAM-003–005, FR-ADM-009; FLOW-OPS-015.
- Entry/exit/navigation: Protected route/session expiry; success to intended permitted screen or role landing.
- Layout/content: organization identity → credentials/external provider → recovery/help → environment/service status when relevant.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-001-01 | Staff identifier | Always | Labelled text input; validation does not reveal account existence. |
| EL-OPS-001-02 | Password / external provider | Per configured method | Authenticates; provider cancellation returns; suspicious/locked state gives approved support route. |
| EL-OPS-001-03 | Sign in | Complete credentials | Success loads role/scope and intended destination; failure preserves identifier and focuses safe error. |
| EL-OPS-001-04 | Recover access | Recovery permitted | Starts verified staff recovery; never bypasses administrator-controlled suspension. |

- States/adaptation/handoff: expired session stores safe return location, not unsent secrets. Direct unauthorized route lands at permission state after authentication.

#### SCREEN-OPS-002 — Operational Dashboard

- Purpose/actors: Role-scoped overview and rapid access to work. Related: FR-RPT-001, FR-ADM-004, FR-GBL-005; FLOW-OPS-002/004/005/006/018.
- Entry/exit/navigation: Default landing; cards drill to filtered queues/records.
- Layout/content: scope/freshness → urgent tasks → today's pickups/returns → fleet readiness → finance/integration exceptions → compact trend only when actionable.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-002-01 | Scope | Always; permitted values only | Uses COMP-OPS-001; refreshes all metrics and announces scope. |
| EL-OPS-002-02 | Metric/task card | Per permission | Opens SCREEN-OPS-003 with exact scope/filter; stale metric requires refresh first. |
| EL-OPS-002-03 | Refresh dashboard | Always | Refreshes independent cards; unavailable data shows stale/unknown, never zero. |
| EL-OPS-002-04 | Start assisted booking | Booking permission | Opens SCREEN-OPS-006 with scope preselected. |

- States/adaptation/handoff: cards load independently; partial failure labels affected card. Tablet stacks; handheld shows urgent tasks and today lists before metrics.

#### SCREEN-OPS-003 — Operations Queues

- Purpose/actors: Own and resolve pending/failed work. Related: FR-ADM-004, FR-INT-004, FR-RNT-001; all operational flows.
- Entry/exit/navigation: Dashboard/task inbox; opens owning record/workflow and returns to preserved filters.
- Layout/content: queue-type tabs → COMP-SH-010 → counts/freshness → COMP-OPS-003 cards/table → bulk ownership action only where safe.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-003-01 | Queue type | Visible permitted types; tabs/section picker | Loads items and definitions; count never implies full access beyond scope. |
| EL-OPS-003-02 | Open work item | Per row | Opens exact record and step; returning keeps item position. |
| EL-OPS-003-03 | Assign selected to me | Valid selected unowned items | Preview count; conflict leaves already-owned rows unchanged and reports each result. |
| EL-OPS-003-04 | Change owner / escalate / snooze | Per permission/state | Uses COMP-OPS-003; requires reason when configured and updates age/owner visibly. |

- States/adaptation/handoff: empty says “No work matching these filters.” Stale row blocks closure action in list; closure only from record after dependencies pass.

#### SCREEN-OPS-004 — Unified Reservation and Rental Search

- Purpose/actors: Locate the correct reservation/rental safely. Related: FR-ADM-003, FR-RSV-001, FR-RNT-005; FLOW-OPS-001/003/006.
- Entry/exit/navigation: Global nav/search; opens reservation or rental workspace.
- Layout/content: search by reference/customer/driver/plate → scoped filters → results explicitly typed Reservation or Rental → urgent status.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-004-01 | Search records | Always | Searchable input with accepted identifiers; delayed search; sensitive preview masked. |
| EL-OPS-004-02 | Type/status/location/date filters | Per permission | Dynamic controls; Apply updates count/chips; dependent values reload with state. |
| EL-OPS-004-03 | Open reservation | Reservation result | Opens SCREEN-OPS-005 in scope. |
| EL-OPS-004-04 | Open rental | Rental result | Opens SCREEN-OPS-010. |
| EL-OPS-004-05 | Create assisted booking | Booking permission/no suitable result | Opens SCREEN-OPS-006 without copying unverified result data. |

- States/adaptation/handoff: no results suggests exact criteria corrections and customer search. Ambiguous names require deliberate record selection; no mass personal-data reveal.

#### SCREEN-OPS-005 — Reservation Workspace

- Purpose/actors: View and manage one reservation. Related: FR-BKG-008/010, FR-RSV-001–007, FR-PAY-005–007; FLOW-CUS-004/005, FLOW-OPS-002/004.
- Entry/exit/navigation: Search/queue/customer/confirmation; tabs Summary, Drivers, Payment, Communication, Activity.
- Layout/content: COMP-OPS-002 → next-action/dependency card → trip/promise/allocation → customer/drivers → price/payment/refund → communication/activity.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-005-01 | Modify reservation | Permitted pre-rental state | Opens SCREEN-CUS-016 in staff mode with override/consent requirements; failure keeps original. |
| EL-OPS-005-02 | Cancel reservation | Permitted pre-rental state | Opens consequence review equivalent to SCREEN-CUS-017 with acting channel/customer notice. |
| EL-OPS-005-03 | Assign / change vehicle | Category/exact model requires and permission | Opens assignment drawer linked to SCREEN-OPS-007; previews conflicts and customer effect. |
| EL-OPS-005-04 | Mark no-show / report delayed pickup | Eligible time/state | Starts FLOW-OPS-004; rechecks grace/policy, requires reason, and shows financial/inventory effect. |
| EL-OPS-005-05 | Start pickup | Required readiness and arrival | Opens SCREEN-OPS-008; blockers are linked rather than bypassed. |
| EL-OPS-005-06 | Resend confirmation | Booking exists and channel available | Previews destination/template/language; sends once and shows delivery state without changing booking. |

- States/adaptation/handoff: stale workspace disables writes and highlights new events. Customer-visible effect preview appears before any action. Rental-opened state makes reservation changes read-only and links to rental.

#### SCREEN-OPS-006 — Staff-Assisted Booking Workspace

- Purpose/actors: Create a booking on a customer's behalf. Related: FR-BKG-001–010, FR-PAY-001–004, FR-ADM-001; FLOW-OPS-001.
- Entry/exit/navigation: Dashboard/search/customer; success to reservation workspace; cancel to origin with hold released.
- Layout/content: COMP-SH-012 task list: customer/guest → trip and offer → renter/drivers → extras/protection → payment → consent/review.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-006-01 | Find or create customer | Start | Uses COMP-SH-009; possible duplicate must be resolved; guest path labelled if allowed. |
| EL-OPS-006-02 | Search availability | Valid trip | Uses customer search/results pattern in staff context; scope and channel rate visible. |
| EL-OPS-006-03 | Record customer consent | Review step | Choice identifies direct digital acceptance or permitted offline evidence; cannot be silently checked by staff. |
| EL-OPS-006-04 | Apply override | Explicitly overridable condition and permission | Uses COMP-SH-019/005; shows impact/approval. |
| EL-OPS-006-05 | Confirm assisted reservation | All prerequisites fresh | Executes same atomic booking/payment protections; success opens SCREEN-OPS-005 and triggers customer communication. |
| EL-OPS-006-06 | Save pending / Cancel | Known permitted prerequisite or active draft | Pending requires owner/expiry; cancel releases hold and records no confirmed booking. |

- States/adaptation/handoff: caller disconnect/agent interruption preserves a labelled draft only per policy. Payment unknown cannot be abandoned into a second attempt.

#### SCREEN-OPS-007 — Pickup Readiness Board

- Purpose/actors: Prepare upcoming pickups and resolve blockers. Related: FR-RNT-001/002, FR-RSV-004, FR-FLT-006; FLOW-OPS-002/004.
- Entry/exit/navigation: Dashboard/Queues; row opens reservation or assignment.
- Layout/content: date/location lane → filters → readiness cards with due time, customer/category, assigned unit, checklist, blockers, arrival status.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-007-01 | Readiness filter | Always | Filters Ready/Blocked/Unassigned/Late/Arrived; counts update and persist per user. |
| EL-OPS-007-02 | Assign vehicle | Unassigned and permission | Opens dynamic eligible-unit picker; selection shows readiness/conflicts before commit. |
| EL-OPS-007-03 | Resolve blocker | Blocker owned/permitted | Opens linked inspection/payment/document/customer-contact step; board updates on return. |
| EL-OPS-007-04 | Mark customer arrived | Confirmed reservation | Records arrival, raises priority, enables pickup when ready; repeated action returns same state. |
| EL-OPS-007-05 | Start pickup | Ready and arrived/allowed | Opens SCREEN-OPS-008. |

- States/adaptation/handoff: live changes show row-level update rather than moving focused row unexpectedly. Unready customer message is sent only through explicit approved action.

#### SCREEN-OPS-008 — Pickup and Handover Workspace

- Purpose/actors: Verify renter, record starting condition, and open rental. Related: FR-RNT-003/004, FR-PAY-003, FR-FLT-006; FLOW-OPS-003.
- Entry/exit/navigation: Reservation/Readiness; success to rental workspace; abort returns to reservation resolution.
- Layout/content: fixed customer/reservation/unit header → checklist: identity/drivers, documents/eligibility, payment/deposit, starting inspection, equipment, agreement/acknowledgement → open rental.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-008-01 | Verify check | Current checklist item | Records verified/failed/needs-review with permitted evidence; failed non-waivable item blocks opening. |
| EL-OPS-008-02 | Correct driver/payment/unit | Relevant blocker | Opens focused editor/picker; returns with revalidation and visible change. |
| EL-OPS-008-03 | Record starting inspection | Assigned unit | Opens SCREEN-OPS-018 in checkout mode; completion updates checklist. |
| EL-OPS-008-04 | Review agreement with renter | Prerequisites sufficiently complete | Shows language/version/full summary and customer-facing preview; cannot mark accepted without recorded evidence. |
| EL-OPS-008-05 | Open rental and hand over | All non-waivable checks complete/fresh | Commits once; success opens SCREEN-OPS-010 and customer active rental; partial failure creates compensation case. |
| EL-OPS-008-06 | Abort handover | Before commit | Dedicated consequence review reconciles reservation, vehicle, and payment; requires reason/approval where needed. |

- States/adaptation/handoff: tablet/handheld supports evidence capture and signature/acknowledgement with no side-by-side dependency. Session expiry preserves completed server-side checks and requires reauthentication.

#### SCREEN-OPS-009 — Active Rentals Board

- Purpose/actors: Monitor active, due, late, overdue, incident, and return-started rentals. Related: FR-RNT-005–007, FR-ADM-003/004; FLOW-OPS-005/006/007.
- Entry/exit/navigation: Work nav/dashboard; row opens rental workspace.
- Layout/content: due-time bands → filters/search → rental rows/cards with unit, renter, due, status, incident/extension/payment flags, owner.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-009-01 | Status/due filter | Always | Visible quick filters plus full filter sheet; current time zone named. |
| EL-OPS-009-02 | Open rental | Per row | Opens SCREEN-OPS-010 preserving board position. |
| EL-OPS-009-03 | Contact renter | Permitted row/action | Opens message/call drawer with template/language and records attempt; no auto-send. |
| EL-OPS-009-04 | Review extension request | Pending request | Opens SCREEN-OPS-010 at request card. |
| EL-OPS-009-05 | Start return | Eligible/arrived | Opens SCREEN-OPS-011. |

- States/adaptation/handoff: overdue status updates without color-only cues; auto-refresh does not steal focus or collapse open menus. Partial data is labelled.

#### SCREEN-OPS-010 — Rental Workspace

- Purpose/actors: Operate one active or completed rental. Related: FR-RNT-005–010/015/016, FR-PAY-005/007; FLOW-OPS-005/007/019.
- Entry/exit/navigation: Board/search/reservation/vehicle/customer; tabs Summary, Agreement, Vehicle history, Payments, Cases, Activity.
- Layout/content: COMP-OPS-002 → due/status/urgent banner → customer/unit/agreement → extension/request → incident/replacement → return/financial summary.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-010-01 | Approve/reject extension | Pending and authorized | Opens impact comparison/COMP-OPS-005; success updates due/payment/customer status; rejection preserves original obligation. |
| EL-OPS-010-02 | Create staff extension | Active and permitted | Opens proposed return/price flow; same checks as customer request. |
| EL-OPS-010-03 | Open/report incident | Active or historical case | Opens SCREEN-OPS-012; new report blocks unit when indicated. |
| EL-OPS-010-04 | Arrange replacement | Incident/vehicle issue and permission | Starts FLOW-OPS-007 with eligible-unit picker and agreement amendment. |
| EL-OPS-010-05 | Start return | Active/overdue | Opens SCREEN-OPS-011. |
| EL-OPS-010-06 | Add post-rental item | Completed and permitted | Opens SCREEN-OPS-012 in toll/fine/claim/property mode; requires linkage/evidence. |

- States/adaptation/handoff: completed rental is read-only except linked adjustment/case actions. Unknown payment or stale agreement disables dependent commits and links to reconciliation.

#### SCREEN-OPS-011 — Return and Closeout Workspace

- Purpose/actors: Receive custody, inspect, adjust, settle, and close. Related: FR-RNT-011–015, FR-PAY-003/007; FLOW-OPS-006.
- Entry/exit/navigation: Active rental/return queue/after-hours check-in; success to completed rental or pending review.
- Layout/content: header → receive facts → inspection → adjustment review → payment/deposit → vehicle next state → customer statement.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-011-01 | Record return facts | Not yet received | Captures time/location, odometer, fuel/charge, keys/equipment, condition; validates against start and after-hours submission. |
| EL-OPS-011-02 | Start return inspection | Custody recorded | Opens SCREEN-OPS-018 in return mode; unit becomes pending inspection, not available. |
| EL-OPS-011-03 | Add adjustment/credit | Evidence/permission | Opens itemized drawer with dynamic reason, basis, tax, evidence, approval; duplicate warning blocks or escalates. |
| EL-OPS-011-04 | Review with customer | Known immediate items | Shows customer-language statement and disputed/pending distinctions; records review outcome. |
| EL-OPS-011-05 | Settle and close | Required checks complete or permitted deferral explicit | Applies payment/deposit actions once, sets vehicle next state, issues statement; partial failure creates owned finance case. |
| EL-OPS-011-06 | Save pending review | Inspection/approval/finance unresolved | Requires owner/reason; possession ends while financial/vehicle states remain explicit. |

- States/adaptation/handoff: after-hours record is visually separated from staff-verified facts. Offline allows local evidence draft but not custody/financial close commit.

#### SCREEN-OPS-012 — Incident and Service Case Workspace

- Purpose/actors: Triage and resolve roadside, incident, claim, toll/fine, and lost-property cases. Related: FR-RNT-008–010/016, FR-ADM-004, FR-INT-005; FLOW-CUS-007/008, FLOW-OPS-007/019.
- Entry/exit/navigation: Queue/rental/customer/vehicle; returns to parent record with case state.
- Layout/content: case type/status/priority/owner → immediate instructions → linked records → evidence/timeline → tasks/provider → resolution and customer communication.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-012-01 | Triage severity/type | New/incomplete and permitted | Dynamic constrained radios/select; unsafe impact can block vehicle immediately; changes audited. |
| EL-OPS-012-02 | Assign/transfer owner | Open case | Entity picker; receiver acknowledgement/pending state visible. |
| EL-OPS-012-03 | Request customer/provider information | Missing item | Previews language/channel/questions; creates pending task, not closure. |
| EL-OPS-012-04 | Dispatch/record assistance | Roadside/provider configured | Sends request once; provider pending/failure shows fallback and case remains owned. |
| EL-OPS-012-05 | Start replacement / adjustment | Applicable | Opens linked workflow; completion returns with reference/outcome. |
| EL-OPS-012-06 | Resolve/close case | Required tasks/results complete | Selects dynamic resolution, summary, customer notice; stale or unresolved dependency blocks closure. |

- States/adaptation/handoff: duplicate case can link/merge only with preserved histories. Customer sees appropriate case status, not internal liability/risk notes.

#### SCREEN-OPS-013 — Fleet Inventory

- Purpose/actors: Find and manage fleet units. Related: FR-FLT-001/003/008/009; FLOW-OPS-008/010.
- Entry/exit/navigation: Fleet nav; row to vehicle detail; create/import/export.
- Layout/content: scope/status totals → COMP-SH-010 → adaptive table with unit, plate, category, location, status, odometer, due alerts, next booking.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-013-01 | Add vehicle | Create permission | Opens SCREEN-OPS-014 in draft-create mode; duplicate identifiers block save. |
| EL-OPS-013-02 | Vehicle row | Visible scope | Opens SCREEN-OPS-014. |
| EL-OPS-013-03 | Change status/block | Selected valid units and permission | Bulk preview identifies conflicts; unsafe/high-risk units route individually. |
| EL-OPS-013-04 | Import / Export | Permission | Opens SCREEN-OPS-020 with current scope. |
| EL-OPS-013-05 | Saved view | Permitted | Uses COMP-SH-010; private/shared scope explicit. |

- States/adaptation/handoff: no units suggests Add/Import only when permitted. Incomplete counts are labelled, and inactive/retired units require explicit filter.

#### SCREEN-OPS-014 — Vehicle Unit Detail

- Purpose/actors: Manage one physical vehicle and its history. Related: FR-FLT-001/003–007/009, FR-RNT-010; FLOW-OPS-008/009.
- Entry/exit/navigation: Fleet/search/assignment/rental; tabs Overview, Schedule, Inspections, Maintenance, Documents, History.
- Layout/content: COMP-OPS-002 → unit identity/status/location → next obligations/reservations → specifications → work/history.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-014-01 | Edit vehicle | Permitted and field editable | Inline/dedicated form; active conflicts disable affected fields with linked work. |
| EL-OPS-014-02 | Change lifecycle status | Valid transition permission | Shows only valid states; requires reason/work link; impact preview before commit. |
| EL-OPS-014-03 | Create maintenance/inspection/block | Permission | Opens SCREEN-OPS-017/018/019 with unit selected. |
| EL-OPS-014-04 | Transfer vehicle | Valid state/permission | Opens SCREEN-OPS-016; schedule conflict preview. |
| EL-OPS-014-05 | Add/renew document | Permission | Dynamic document type plus COMP-SH-016; critical expiry updates availability. |
| EL-OPS-014-06 | Retire / archive erroneous draft | Valid state | Dedicated consequence review; operational unit retires, only unused draft may be deleted. |

- States/adaptation/handoff: live rental makes unit facts read-only except incident/block actions. Historical label/value resolution remains even when catalogue values inactive.

#### SCREEN-OPS-015 — Vehicle Categories and Public Catalogue

- Purpose/actors: Manage bookable categories and localized content. Related: FR-FLT-002, FR-CAT-001/003, FR-ADM-012; FLOW-OPS-013/016.
- Entry/exit/navigation: Fleet/Configuration; list to category detail/preview.
- Layout/content: category list/status → detail form → specifications/features → images → eligibility/location applicability → translations/public preview.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-015-01 | Add category | Permission | Creates draft with stable unique code; cannot publish incomplete category. |
| EL-OPS-015-02 | Edit category | Draft/active within permission | Saves draft version; structural changes show affected units/reservations. |
| EL-OPS-015-03 | Manage images/features/translations | Permission | Uses uploader/dynamic lookups; language completeness visible. |
| EL-OPS-015-04 | Preview customer card/detail | Sufficient content | Opens responsive preview by language/market; no production effect. |
| EL-OPS-015-05 | Activate/deactivate | Valid and approved | Shows future sales/affected reservations; deactivation preserves history. |

- States/adaptation/handoff: representative-model wording is mandatory for category mode. Missing translations block launch language publication or use configured fallback with warning according to policy.

#### SCREEN-OPS-016 — Vehicle Transfers

- Purpose/actors: Plan and confirm location movement. Related: FR-FLT-004, FR-CAT-005; FLOW-OPS-009.
- Entry/exit/navigation: Fleet/unit/queue; detail opens unit and affected reservations.
- Layout/content: transfer calendar/list → create/edit form → availability impact → departure/arrival checklist.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-016-01 | Plan transfer | Permission | Selects unit, origin/destination entity, dates, owner; check runs availability/conflicts. |
| EL-OPS-016-02 | Confirm departure | Scheduled and ready | Records custody/odometer/fuel-charge; state becomes Transfer. |
| EL-OPS-016-03 | Confirm arrival | Departed | Records actual arrival/condition/location; runs readiness and sets next state. |
| EL-OPS-016-04 | Delay/cancel transfer | Eligible | Shows impacted demand/tasks; requires reason and creates reassignment/customer-impact work. |

- States/adaptation/handoff: delayed transfer never remains counted at destination as available. Concurrent unit status change forces refresh.

#### SCREEN-OPS-017 — Maintenance Board and Work Detail

- Purpose/actors: Schedule and complete preventive/corrective work. Related: FR-FLT-005/009, FR-RNT-008; FLOW-OPS-008.
- Entry/exit/navigation: Fleet/queue/unit; board/list to work detail.
- Layout/content: Due/Overdue/In progress calendar/list → work detail with trigger, priority, owner/vendor, expected duration, cost, evidence, affected reservations, readiness result.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-017-01 | Create/schedule work | Permission | Dynamic work type, date/odometer trigger, owner/vendor, duration; impact preview before save. |
| EL-OPS-017-02 | Start work | Scheduled/authorized | Moves unit to maintenance if required and starts work timeline. |
| EL-OPS-017-03 | Reschedule/cancel | Eligible | Shows reservation/availability impact and requires reason; safety-critical rule may block cancellation. |
| EL-OPS-017-04 | Add evidence/cost | In progress | Uses uploader and currency-aware fields; failed file does not block other saved work. |
| EL-OPS-017-05 | Complete and assess readiness | Required checklist complete | Records result; pass may set Available, fail creates follow-up and keeps unavailable. |
| EL-OPS-017-06 | Reopen | Closed and permitted | Requires reason; returns to in-progress/unavailable with history. |

- States/adaptation/handoff: overdue items surface on queues/dashboard. External vendor is an entity picker, not a hard-coded dropdown.

#### SCREEN-OPS-018 — Inspection Workspace

- Purpose/actors: Perform checkout, return, maintenance, or ad hoc inspection. Related: FR-FLT-006, FR-RNT-004/011/012; FLOW-OPS-003/006/008.
- Entry/exit/navigation: Pickup/return/unit/maintenance; completion returns to origin checklist.
- Layout/content: inspection context/version → odometer/fuel-charge → checklist sections → condition map/list → evidence → findings → readiness result/review.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-018-01 | Checklist answer | Each required item; radios Pass/Issue/Not applicable when allowed | Saves progress; Not applicable requires configured reason; failing item creates finding. |
| EL-OPS-018-02 | Add condition finding | Permission | Dynamic type/severity/location, note/evidence; duplicates warn and may link. |
| EL-OPS-018-03 | Compare previous condition | Prior inspection exists | Opens side-by-side/stacked evidence with timestamps; does not overwrite current answers. |
| EL-OPS-018-04 | Save draft | Started | Persists completed items with status In progress; offline local draft is labelled until sync. |
| EL-OPS-018-05 | Submit inspection | Required items complete and online | Produces Passed/Failed/Needs review; returns outcome to origin and updates unit state/tasks. |
| EL-OPS-018-06 | Correct/supersede | Submitted and authorized | Creates new result with reason; original remains visible. |

- States/adaptation/handoff: handheld uses one checklist section and large capture controls. Evidence thumbnails have text alternatives. RTL does not mirror vehicle orientation diagrams unless localized semantic mapping is provided.

#### SCREEN-OPS-019 — Availability Blocks

- Purpose/actors: Block/release unit or category capacity with impact control. Related: FR-FLT-007, FR-CAT-005; FLOW-OPS-008.
- Entry/exit/navigation: Fleet/unit/queue; detail links affected demand.
- Layout/content: timeline/list → create block → scope/reason/period → impact preview → resolution tasks.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-019-01 | Create block | Permission | Selects unit/category, location, range, dynamic reason; runs impact check. |
| EL-OPS-019-02 | View affected demand | Check finds impact | Opens filtered reservations/holds with severity and reassignment status. |
| EL-OPS-019-03 | Confirm block | Valid and impact accepted/approved | Commits block and creates tasks; high impact uses approval. |
| EL-OPS-019-04 | Shorten/release block | Active and permitted | Rechecks reason/work dependency; success recalculates availability but does not auto-confirm demand. |
| EL-OPS-019-05 | Cancel draft | Draft only | Discards safely; no inventory effect. |

- States/adaptation/handoff: a block conflict cannot be hidden by confirmation. Customer communication occurs through each affected reservation task.

#### SCREEN-OPS-020 — Fleet Import and Export Jobs

- Purpose/actors: Preview and run validated bulk fleet changes/exports. Related: FR-FLT-008, FR-GBL-008; FLOW-OPS-010.
- Entry/exit/navigation: Fleet; result links affected units/rows.
- Layout/content: import/export choice → file/scope → mapping/preview → validation results → confirm job → COMP-SH-017.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-020-01 | Import / Export | Permission; visible radios | Selects workflow and reveals relevant controls. |
| EL-OPS-020-02 | Choose file | Import | Uses uploader; validates file type/size and never commits on upload. |
| EL-OPS-020-03 | Validate and preview | Parsed file/scope valid | Shows row accepted/rejected/unchanged, conflicts, and high-risk exclusions. |
| EL-OPS-020-04 | Run import / Create export | Fresh preview or valid export scope | Starts tracked job once; result gives counts and downloadable errors/output. |
| EL-OPS-020-05 | Retry failed rows | Completed partial import and corrected source | Creates new linked job for failures only; accepted rows are not duplicated. |
| EL-OPS-020-06 | Cancel job | Pending/running and safe | Explains partial-commit possibility; outcome shows completed/cancelled rows accurately. |

- States/adaptation/handoff: permission/masking apply to exported fields. Closing page does not cancel a job; task inbox shows completion.

#### SCREEN-OPS-021 — Customers

- Purpose/actors: Find the correct customer with privacy-safe previews. Related: FR-ADM-001, FR-IAM-008; FLOW-OPS-011.
- Entry/exit/navigation: Records nav/global search; row opens customer workspace.
- Layout/content: permitted search → filters → masked result list with verification/contact status, upcoming/active indicator, potential-duplicate marker.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-021-01 | Search customers | Always | Supports permitted identifiers; delayed search; broad query is constrained to prevent unnecessary exposure. |
| EL-OPS-021-02 | Customer row | Result and permission | Opens SCREEN-OPS-022 after deliberate selection; access event recorded where required. |
| EL-OPS-021-03 | Add customer | Create permission | Opens create state after duplicate check; no password can be chosen/viewed by staff. |
| EL-OPS-021-04 | Review possible duplicates | Duplicate-review permission | Opens comparison queue without auto-merge. |

- States/adaptation/handoff: no match offers assisted guest/new-customer path. Masking remains until record open; export absent unless separately authorized.

#### SCREEN-OPS-022 — Customer Workspace

- Purpose/actors: Assist one verified customer and manage permitted data/restrictions. Related: FR-ADM-001/002, FR-IAM-006–008; FLOW-OPS-011.
- Entry/exit/navigation: Customer search/reservation/rental; tabs Overview, Trips, Drivers, Payments, Cases, Consents, Activity.
- Layout/content: COMP-OPS-002 → identity/verification → active/upcoming work → contact/preferences → restriction/review cards → linked history.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-022-01 | Edit permitted customer data | Field permission | Opens scoped form; verified-contact change triggers customer verification; history snapshots remain. |
| EL-OPS-022-02 | Initiate verification/recovery | Support permission | Sends approved challenge/instructions; staff cannot mark success without governed evidence. |
| EL-OPS-022-03 | Add/review restriction | Specific permission | Opens rule/evidence/scope/period/approval drawer; free text alone cannot enforce denial. |
| EL-OPS-022-04 | Compare/merge duplicate | Merge permission and verified candidates | Shows field/link conflicts and survivor; approval then preserves mapping/reversal evidence. |
| EL-OPS-022-05 | Open reservation/rental/payment/case | Linked record and permission | Opens owning workspace; return context preserved. |
| EL-OPS-022-06 | Review data request | Assigned request permission | Opens request status, verification, retention/blockers, response action. |

- States/adaptation/handoff: sensitive fields masked with explicit authorized reveal where allowed. Restriction customer message preview excludes internal risk notes.

#### SCREEN-OPS-023 — Payments and Refunds

- Purpose/actors: Track payment, hold, capture, refund, reversal, dispute, and balances. Related: FR-PAY-001–008; FLOW-OPS-012/019.
- Entry/exit/navigation: Finance nav/record money tab/queue; row to transaction drawer or parent record.
- Layout/content: scoped totals by currency → filters → transaction table → selected detail with provider/internal states, ledger links, evidence, allowed actions.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-023-01 | Transaction row | Visible permission | Opens detail; exact purpose/status/history shown. |
| EL-OPS-023-02 | Issue refund | Captured eligible balance and permission | Dedicated amount/reason/evidence/customer-impact review; approval when required; sends once. |
| EL-OPS-023-03 | Reverse adjustment | Reversible item and permission | Shows linked counter-transaction; never erases original. |
| EL-OPS-023-04 | Record/review dispute | Applicable | Opens evidence/deadline/outcome workflow; updates balance/report status. |
| EL-OPS-023-05 | Check provider status | Pending/unknown | Queries existing reference; cannot create new payment. |
| EL-OPS-023-06 | Download receipt/evidence | Permitted | Uses EL-SH-009 with masking. |

- States/adaptation/handoff: totals never combine currencies without approved basis. Refund failure leaves reservation/rental state unchanged and routes SCREEN-OPS-024.

#### SCREEN-OPS-024 — Payment Reconciliation

- Purpose/actors: Resolve mismatches and unknown provider outcomes. Related: FR-PAY-004/009, FR-INT-001/004; FLOW-OPS-012/018.
- Entry/exit/navigation: Finance queue/payments/integration health; resolution returns to linked records.
- Layout/content: exception type/count → filters → side-by-side provider and business facts → recommended safe actions → owner/history.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-024-01 | Open exception | Per row | Shows linked/missing references, amounts/currency/timestamps and current customer impact. |
| EL-OPS-024-02 | Refresh provider state | Existing provider reference | Fetches only current outcome; repeated events deduplicate. |
| EL-OPS-024-03 | Link transaction | Verified unmatched pair and permission | Preview checks amount/currency/purpose; commit records reason and removes exception only if consistent. |
| EL-OPS-024-04 | Compensate/refund/retry | Safe applicable remedy | Opens approval/consequence flow; retry cannot duplicate unknown write. |
| EL-OPS-024-05 | Mark explained / Escalate | Evidence sufficient / unresolved | Requires reason/evidence or new owner/deadline; no deletion. |

- States/adaptation/handoff: stale provider state blocks resolution; customer-facing message uses verified facts. Resolved exception remains searchable/auditable.

#### SCREEN-OPS-025 — Pricing and Rate Plans

- Purpose/actors: Draft, preview, approve, and activate rates. Related: FR-PRC-001/002, FR-ADM-005; FLOW-OPS-013.
- Entry/exit/navigation: Configuration; list/calendar to rate version detail.
- Layout/content: scope/effective calendar → rate plan list/status → version header → conditions/prices → conflict/quote preview → usage/history.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-025-01 | Create rate version | Permission | Selects scope/category/period/currency and creates draft; overlapping scope flagged. |
| EL-OPS-025-02 | Edit conditions/prices | Draft and permission | Dynamic location/category/entity selectors, duration/season conditions, money fields; save validates completeness. |
| EL-OPS-025-03 | Preview sample quote | Draft sufficiently complete | Requires explicit trip/driver context; shows full line items and which rule won. |
| EL-OPS-025-04 | Submit/approve/activate | Role/state permits | Uses COMP-OPS-006/005; blocks conflict/gap and shows affected future offers. |
| EL-OPS-025-05 | Pause/supersede | Active and permitted | Shows future-sales effect; creates new version/state, never reprices confirmed bookings. |

- States/adaptation/handoff: mobile/handheld is read-only. Missing reference data links to its owner and preserves draft.

#### SCREEN-OPS-026 — Charges, Deposits, Discounts, and Promotions

- Purpose/actors: Govern non-base price rules. Related: FR-PRC-003/004/007, FR-ADM-005; FLOW-OPS-013.
- Entry/exit/navigation: Configuration/pricing; detail uses version workflow.
- Layout/content: type tabs → scoped rule list → applicability → calculation/display → limits/combinability → preview/approval/usage.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-026-01 | Add rule/promotion | Permission | Creates draft with stable code/type; system-fixed charge type remains constrained. |
| EL-OPS-026-02 | Edit applicability/calculation | Draft | Uses dynamic entities/lookups; invalid overlap, currency, or threshold relation shown inline/summary. |
| EL-OPS-026-03 | Test eligibility/total | Draft complete enough | Shows scenario, accepted/rejected reason category, line-item/rounding result. |
| EL-OPS-026-04 | Publish/pause/archive | State/permission | Uses version/impact/approval flow; archive only terminal unused draft or historical view. |
| EL-OPS-026-05 | View usage | Rule used | Opens filtered offers/reservations/payments without editing history. |

- States/adaptation/handoff: promotion secrets/limits are masked by permission. Historical transaction label and value remain stable after rename/deactivation.

#### SCREEN-OPS-027 — Extras and Protection Products

- Purpose/actors: Manage products, stock behavior, terms, and public choices. Related: FR-PRC-005/006, FR-ADM-006; FLOW-OPS-013/016.
- Entry/exit/navigation: Configuration; product list/detail/preview.
- Layout/content: product type/status → localized content → applicability/price → stock/fulfilment → terms/coverage → customer preview → future affected reservations.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-027-01 | Add extra/protection | Permission | Chooses product family with correct constrained fields; creates draft. |
| EL-OPS-027-02 | Edit applicability/stock/terms | Draft/permitted fields | Dependent dynamic selectors; coverage/integration codes locked with reason where required. |
| EL-OPS-027-03 | Preview choice card/agreement | Content present | Shows customer language, included/optional/decline behavior, price and exclusions. |
| EL-OPS-027-04 | Activate/deactivate | Valid/approved | Impact preview identifies future reservations/stock; creates resolution tasks if fulfilment changes. |
| EL-OPS-027-05 | Manage translations | Translation permission | Opens SCREEN-OPS-034 filtered to product. |

- States/adaptation/handoff: no optional products is a valid customer state. Deactivation never silently removes existing booked items.

#### SCREEN-OPS-028 — Rental Locations and Hours

- Purpose/actors: Manage location identity, hours, routes, and instructions. Related: FR-CAT-004, FR-ADM-007, FR-FLT-004; FLOW-OPS-013.
- Entry/exit/navigation: Configuration/Fleet; list/map optional to detail.
- Layout/content: location list/status → contact/address/time zone → hours/exceptions → services/categories/payment → one-way routes → pickup/return/after-hours instructions → impact.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-028-01 | Add/edit location | Permission | Entity form; time zone required; map suggestion must be confirmed, with manual address fallback. |
| EL-OPS-028-02 | Add exceptional hours/closure | Permission | Date/range plus open/closed/times; impact check identifies pickups/returns/transfers. |
| EL-OPS-028-03 | Manage one-way route | Permission | Origin/destination entity picker and policy; reciprocal direction is not assumed. |
| EL-OPS-028-04 | Preview customer instructions | Content exists | Language/device preview for search, confirmation, pickup, return. |
| EL-OPS-028-05 | Activate/archive | Valid and approved | Activation publishes; archive blocks new use and creates impact tasks while retaining history. |

- States/adaptation/handoff: similarly named locations always show city/address/airport code as applicable. Changing time zone requires high-impact confirmation and future-record review.

#### SCREEN-OPS-029 — Business Policies

- Purpose/actors: Govern eligibility and operational rules. Related: FR-ADM-010, FR-RSV-006, FR-BKG-002; FLOW-OPS-013.
- Entry/exit/navigation: Configuration; policy families to scoped version detail.
- Layout/content: family/scope/effective state → plain-language outcome → values/precedence → non-overridable marker → scenario preview → impact/approval/history.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-029-01 | Create policy version | Permission | Selects family/scope/effective period; inherits only with explicit source/override labels. |
| EL-OPS-029-02 | Edit allowed values | Draft and field editable | Correct UI by value: numeric/date fields, radios, checkboxes, or entity/lookup pickers; locked invariant explains why. |
| EL-OPS-029-03 | Test scenario | Sufficient configuration | Shows which rule/scope wins and customer/staff outcome. |
| EL-OPS-029-04 | Submit/approve/activate | Valid role/state | Blocks gaps, precedence conflict, missing translation/owner; publishes prospective version. |
| EL-OPS-029-05 | Emergency pause/supersede | Authorized | Shows affected flows and fallback; requires reason/approval and creates replacement version. |

- States/adaptation/handoff: policy family includes eligibility, holds/buffers, cancellation/no-show, deposit, extension, mileage/fuel/charging, after-hours, documents, approvals, notification. No generic free-text policy controls logic.

#### SCREEN-OPS-030 — Reference Data Catalogue

- Purpose/actors: Discover every lookup/reference source and its governance. Related: FR-GBL-004, FR-ADM-008; FLOW-OPS-014.
- Entry/exit/navigation: Configuration; row to reference detail or owning entity area.
- Layout/content: classification/status filters → table with type/code, purpose, owner, scope, source, editability/reason, counts, usage, last change/sync, consuming surfaces.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-030-01 | Search/filter catalogue | Always | Filters type, area, class, scope, editable/status; no-results shows clear filters. |
| EL-OPS-030-02 | Open reference type | Visible permission | Opens SCREEN-OPS-031 for lookup/system/external type or owning screen for entity-owned data. |
| EL-OPS-030-03 | View where used | Type visible | Opens usage panel with screens/fields/record counts and historical impact. |
| EL-OPS-030-04 | Refresh external source | Externally managed and permission | Requests one sync/check; shows status/last success/errors; repeated click does not duplicate job. |

- States/adaptation/handoff: system-fixed rows remain visible read-only with reason. Source failure does not replace current options with empty list.

#### SCREEN-OPS-031 — Reference Type and Values

- Purpose/actors: View or safely manage one option set. Related: FR-GBL-004, FR-ADM-008; FLOW-OPS-014.
- Entry/exit/navigation: Catalogue/dynamic selector error; returns to catalogue or originating form after refresh.
- Layout/content: type metadata/governance → value search/list → translations/order/default/status/usage → audit/sync status.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-031-01 | Add value | Configurable and permission | Stable unique code plus labels/scope; duplicates/conflicts block save. |
| EL-OPS-031-02 | Edit value/translations | Editable attributes only | Shows usage; rename updates future display, historical rule previewed; concurrent conflict compares versions. |
| EL-OPS-031-03 | Reorder / Set default | Type supports and permission | Buttons/position field, never drag-only; validates one allowed default and scope. |
| EL-OPS-031-04 | Deactivate / Restore | Allowed | Impact/usage confirmation; inactive removed from new selectors, preserved historically; restore revalidates conflicts. |
| EL-OPS-031-05 | Delete unused draft | Never used, draft, permission | Consequence confirmation; otherwise absent and deactivation offered. |
| EL-OPS-031-06 | Retry/refresh sync | External type | Shows last successful data while retrying; result updates source status. |

- States/adaptation/handoff: read-only values show code, meaning, owner, usages, and lock reason. Originating selector can refresh without losing form data.

#### SCREEN-OPS-032 — Staff and Roles

- Purpose/actors: Manage staff lifecycle, roles, scopes, and permissions. Related: FR-ADM-009, FR-IAM-003/005; FLOW-OPS-015.
- Entry/exit/navigation: Administration; staff/roles tabs and detail drawer/page.
- Layout/content: staff list/invitations → role/scope assignments → owned open work → security/access history; role detail shows protected permission matrix.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-032-01 | Invite staff | Permission | Email/contact, role(s), scope(s), language; duplicate offers resend/edit; send failure retains pending invitation. |
| EL-OPS-032-02 | Add/edit role | Role-admin permission | Compose from system-fixed action permissions grouped by risk; self-escalation and invalid combinations blocked. |
| EL-OPS-032-03 | Change role/scope | Permitted target | Shows gained/lost access and open-work reassignment; high risk uses approval/reauthentication. |
| EL-OPS-032-04 | Suspend/deactivate | Permitted and not last admin | Shows session/access/work impact; requires reason; historical actions retained. |
| EL-OPS-032-05 | Resend/revoke invitation | Pending invite | Resend cooldown/status; revoke ends invitation without staff deletion. |
| EL-OPS-032-06 | Reassign open work | Access removal finds owned work | Entity picker/bulk preview; per-item conflicts reported. |

- States/adaptation/handoff: current user cannot remove own last administrative path. Directly affected user and approvers receive configured notifications.

#### SCREEN-OPS-033 — Notification Templates and Rules

- Purpose/actors: Configure transactional messages and delivery behavior. Related: FR-ADM-011, FR-INT-002; FLOW-OPS-016.
- Entry/exit/navigation: Configuration; event/template list to version detail.
- Layout/content: event/channel/language status matrix → editor → required variables/legal content → preview/test → trigger/retry/escalation → approval/history.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-033-01 | Create/edit template version | Permission | Selects fixed event, channel, language; variable picker prevents unknown keys; draft autosave status visible. |
| EL-OPS-033-02 | Preview | Draft exists | Uses safe sample or selected test fixture; shows text expansion/RTL/channel limits. |
| EL-OPS-033-03 | Send test | Permission/verified test recipient | Explicitly labelled test, no real booking state change; delivery result tracked. |
| EL-OPS-033-04 | Configure channel/timing/retry | Rule permission | Constrained controls; required message cannot be disabled without valid fallback. |
| EL-OPS-033-05 | Submit/approve/publish | Complete variables/languages/legal content | Uses version approval; future events use new version, history retained. |
| EL-OPS-033-06 | Pause version | Authorized | Impact/fallback shown; does not retract sent messages. |

- States/adaptation/handoff: missing translation appears in SCREEN-OPS-034 queue. Provider failure is not template failure; test result separates them.

#### SCREEN-OPS-034 — Translation Catalogue

- Purpose/actors: Reach complete, reviewed multilingual coverage. Related: FR-GBL-002/003, FR-ADM-012; FLOW-OPS-016.
- Entry/exit/navigation: Configuration or context link; translation item returns to owning content.
- Layout/content: language completeness → content type/status filters → source/fallback/current translation → text-expansion/RTL preview → review workflow.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-034-01 | Select language/content type | Permitted values | Dynamic controls update completeness and queue; fallback clearly named. |
| EL-OPS-034-02 | Edit translation | Translator permission | Unicode input, source context, variable protection; saves draft with conflict detection. |
| EL-OPS-034-03 | Preview in context | Mapping exists | Opens exact customer/staff screen state in selected direction/size; no publication. |
| EL-OPS-034-04 | Submit/approve/reject | Role/state permits | Review preserves comments; rejected returns draft; approval publishes only complete valid item. |
| EL-OPS-034-05 | Mark fallback accepted | Policy allows and authorized | Requires reason/scope/expiry; remains reportable as fallback, not “translated.” |

- States/adaptation/handoff: missing/outdated entries link to source change. Codes, variables, plates, money, and timeline direction are previewed with explicit bidi handling.

#### SCREEN-OPS-035 — Reports Hub

- Purpose/actors: Choose operational, revenue, utilization, booking/payment, and data-quality reports. Related: FR-RPT-001–006; FLOW-OPS-017.
- Entry/exit/navigation: Insights; report card to viewer; exports/schedules.
- Layout/content: report families → definitions/last run/freshness → saved reports → scheduled delivery status.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-035-01 | Report card | Permission | Opens SCREEN-OPS-036 with default permitted scope and visible definition. |
| EL-OPS-035-02 | Search reports | Many reports | Filters by name/purpose; no-results clear. |
| EL-OPS-035-03 | Open saved view | Owner/shared permission | Opens viewer with filters; unavailable dimension shows correction, not silent removal. |
| EL-OPS-035-04 | Manage exports/schedules | Export/schedule permission | Opens SCREEN-OPS-037. |

- States/adaptation/handoff: report unavailable/stale is labelled; a failed source is not shown as zero. Handheld offers read-only summaries and safe export status.

#### SCREEN-OPS-036 — Report Viewer

- Purpose/actors: Configure, run, inspect, and drill into one report. Related: FR-RPT-001–006; FLOW-OPS-017.
- Entry/exit/navigation: Reports hub/dashboard drill; row/data point to contributing records if permitted.
- Layout/content: definition/time basis/freshness → COMP-OPS-007 → summary/table/chart only when useful → drill-down → save/export/schedule.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-036-01 | Run report | Required scope/date/currency basis valid | Runs tracked query; partial/stale result labelled with affected measures. |
| EL-OPS-036-02 | Sort/page/drill down | Result supports | Table controls preserve filters; chart point has accessible table equivalent and opens exact records. |
| EL-OPS-036-03 | Save view | Permission | Names private/shared scope; conflict asks overwrite-as-new or cancel. |
| EL-OPS-036-04 | Export | Permission/result available | Opens export review or starts tracked job with format/scope/masking. |
| EL-OPS-036-05 | Schedule | Permission | Opens SCREEN-OPS-037 with definition/filter snapshot. |

- States/adaptation/handoff: currency/date-basis ambiguity blocks misleading total. Utilization data-quality gap links to SCREEN-OPS-038.

#### SCREEN-OPS-037 — Exports and Schedules

- Purpose/actors: Track exports and recurring authorized delivery. Related: FR-RPT-005, FR-ADM-009; FLOW-OPS-017.
- Entry/exit/navigation: Reports; links to source report/result/job.
- Layout/content: jobs list/status/expiry → schedule list/recipients → create/edit schedule → delivery history.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-037-01 | Create export | Export permission | Selects format/fields/scope; shows masking and starts COMP-SH-017 job. |
| EL-OPS-037-02 | Download result | Completed and unexpired | Downloads with generated time/definition; expiry offers regenerate. |
| EL-OPS-037-03 | Create/edit schedule | Schedule permission | Frequency/time zone, report snapshot, verified authorized recipients, format; preview before save. |
| EL-OPS-037-04 | Pause/delete schedule | Owner/admin | Consequence confirmation; stops future sends, preserves history. |
| EL-OPS-037-05 | Retry failed delivery | Still authorized/current report | Sends existing generated result or regenerates as explicitly shown; logs outcome. |

- States/adaptation/handoff: recipient loss of authorization automatically pauses/removes delivery and creates owner task. Export never bypasses row/field scope.

#### SCREEN-OPS-038 — Audit and Data Quality

- Purpose/actors: Investigate consequential actions and contradictions. Related: FR-GBL-008, FR-RPT-006; FLOW-OPS-011/012/013/015/018.
- Entry/exit/navigation: Insights/Admin/record activity; finding/action links to owning records.
- Layout/content: Audit/Data Quality tabs → scoped filters → event/finding list → before/after/evidence/owner → resolution.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-038-01 | Search/filter events/findings | Permission | Filters actor/action/object/date/severity/status/scope; sensitive values remain masked. |
| EL-OPS-038-02 | Open event/finding | Visible | Shows attributable source, before/after, related records and attempts; no edit. |
| EL-OPS-038-03 | Assign finding | Open finding | Sets owner/deadline with acknowledgement status. |
| EL-OPS-038-04 | Resolve / false positive / reopen | Permission and evidence | Requires reason/evidence; new materially different issue can reappear; history retained. |
| EL-OPS-038-05 | Export audit evidence | Specific permission | Tracked, watermarked/labelled as configured, and scope/masking enforced. |

- States/adaptation/handoff: ordinary users cannot delete audit events. Missing source data is a finding, not a blank detail page.

#### SCREEN-OPS-039 — Integration Health and Recovery

- Purpose/actors: See provider health and resolve failed/partial interactions. Related: FR-INT-001–005, FR-PAY-004/009; FLOW-OPS-018.
- Entry/exit/navigation: Administration/queue/reconciliation; provider card to events/exceptions.
- Layout/content: provider/service cards with enabled state, last success, current health → affected flows → event/exception list → safe recovery actions → configuration owner.
- Elements:

| ID | Label/control | Visibility/enabled | Action, feedback, outcome/recovery |
| --- | --- | --- | --- |
| EL-OPS-039-01 | Provider/service card | Integration-view permission | Opens scoped health, last success, errors and affected flows without exposing secrets. |
| EL-OPS-039-02 | Test/check connection | Permission and safe provider action | Runs non-transactional check; result timestamped; cannot simulate real payment/message as success. |
| EL-OPS-039-03 | Open failed event/case | Visible exception | Opens SCREEN-OPS-024 or case detail with verified current facts. |
| EL-OPS-039-04 | Retry / use manual fallback | Action-specific permission and safe state | Shows side effects and existing provider reference; repeated action is deduplicated. |
| EL-OPS-039-05 | Pause/resume integration | Administrator and configured fallback | Uses approval/consequence view; shows impacted customer/staff flows and fallback readiness. |
| EL-OPS-039-06 | Escalate | Unresolved | Assigns owner/deadline/provider reference; customer communication status linked. |

- States/adaptation/handoff: system keeps last known reference data when a source sync fails and labels staleness. Provider disagreement stays open until reconciled.

## 9. Detailed End-to-End Flows

The step tables define the normal path. The “Branches and closure” line for each flow defines validation, dependency, permission, stale/concurrent, timeout, interruption, cancellation/reversal, and final next actions where applicable. Shared state presentation follows Section 4.3.

### FLOW-CUS-001 — Search, Choose, and Book

- Objective/FRs: create one fulfillable, paid-as-required reservation; FR-CAT-001–007, FR-PRC-002–007, FR-BKG-001–008, FR-PAY-001–004.
- Actors/apps/devices: visitor/customer on APP-CWEB/APP-CMOB; payment/message providers; staff only on exception. Trigger: trip search. Preconditions: launch market/location/policies available.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Enter trip in COMP-SH-007; EL-CUS-001-01 | Inline constraints, named time zone, busy search | SCREEN-CUS-002 with fresh eligible offers or transparent alternatives |
| 2 | Filter/inspect via EL-CUS-002-02/04 and choose EL-CUS-002-05 | Promise type, full-trip price, revalidation | Hold/draft created; SCREEN-CUS-004 |
| 3 | Supply renter/drivers via EL-CUS-004-01–06 | Eligibility status and price effects per driver | Eligible/review result; SCREEN-CUS-005 or corrective card |
| 4 | Choose extras/protection via EL-CUS-005-01–05 | Stock and total update; decline remains explicit | Fresh selections; SCREEN-CUS-006 |
| 5 | Review terms/payment; EL-CUS-006-02–05 | One busy commit, provider status, duplicate prevention | SCREEN-CUS-007 only after confirmed booking; inventory/payment linked |
| 6 | EL-CUS-007-01/02/03 | Confirmation reference, pickup checklist, communication state | Reservation detail/document/directions |

- Decision branches: no results → alternative with every changed criterion; ineligible → correct driver/category or staff review; quote/stock/availability changed → compare and accept or return; payment failed → retry/change method; payment unknown → EL-CUS-006-06 only; guest/account path → FLOW-CUS-002/003.
- Closure/recovery: cancel/abandon releases hold and creates no confirmation; offline preserves labelled draft but final commit disabled; session expiry returns after authentication; stale/concurrent result requires fresh review; permission is not relevant to public search but ownership is required after booking. Partial success creates FLOW-OPS-018 and customer sees verified pending status. Final next actions are view, prepare, modify/cancel, or new search.
- Objects: SCREEN-CUS-001–007; COMP-CUS-001–006, COMP-SH-005/007/008/012/020; STATE-LOADING/VALIDATION/UNAVAILABLE/FAILURE/PENDING/SUCCESS/EXPIRED.
- Acceptance walkthrough: two rapid Confirm actions produce one reference; a lost provider response shows Check status; a changed price is never accepted silently; the confirmation specifies category or exact unit.

### FLOW-CUS-002 — Register or Sign In Without Losing Task

- Objective/FRs: authenticate or create/verify an account and restore the originating journey; FR-IAM-001–005, FR-BKG-001.
- Actors/apps/devices: visitor/customer on customer web/mobile plus optional identity/message provider. Trigger: header, protected deep link, or checkout account choice. Preconditions: safe origin context recorded.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Choose EL-CUS-004-01 or account menu | Origin and valid form draft retained | SCREEN-CUS-008 |
| 2 | Sign in EL-CUS-008-01–04, or register EL-CUS-008-06 | Busy once; safe credential/provider errors | Authenticated, or SCREEN-CUS-009 |
| 3 | Register/verify EL-CUS-009-01–06 | Duplicate route, delivery/cooldown/expiry states | Active account or recoverable pending verification |
| 4 | If needed recover via SCREEN-CUS-010 | Neutral delivery result and single-use verification | Credentials changed; security notice |
| 5 | System reconciles saved profile with entered draft | Differences shown; user chooses retained value when material | Original checkout/detail/deep-link screen restored |

- Branches and closure: provider cancellation returns to sign-in; conflicting identity requires verified linking/support; delivery failure offers resend/alternate; locked/suspended account shows approved support route; session timeout restarts only verification, not trip entry. Cancel returns to origin as visitor if permitted. Stale hold/quote is revalidated before continuation. No permissions are broadened by sign-in. Final next action is the exact originating action.
- Objects: SCREEN-CUS-008–010 and origin; COMP-SH-005/014/020; STATE-VALIDATION/PENDING/EXPIRED/FAILURE/SUCCESS.
- Acceptance walkthrough: start checkout, register, verify, and return to the renter step with trip and valid fields intact; an existing contact routes to sign-in/recovery, not a duplicate account.

### FLOW-CUS-003 — Verified Guest Reservation Lookup and Link

- Objective/FRs: grant access to exactly one guest reservation and optionally link it to a verified account; FR-BKG-009, FR-IAM-002.
- Actors/apps/devices: guest/customer on customer apps; message provider. Trigger: Find my reservation/deep link. Preconditions: guest access enabled.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Enter reference/contact; EL-CUS-018-01–03 | Neutral response; rate-limit state if needed | Challenge sent or safe retry/support |
| 2 | Enter/verify code; EL-CUS-018-04/05 | Incorrect/expired/used feedback | Scoped guest session; SCREEN-CUS-015 |
| 3 | Choose account linking from detail/confirmation | Reauthentication and ownership comparison | Linked to correct account or conflict/support case |

- Branches and closure: no match reveals no record; resend invalidates older challenge as configured; connectivity preserves reference but not secret challenge state; expired session re-verifies. Already-linked reservation directs to sign-in. Linking conflict never merges accounts silently. Customer may leave without linking; reservation remains guest-managed. Final actions follow reservation status.
- Objects: SCREEN-CUS-018/015/009; COMP-SH-005/020; STATE-NO-RESULTS/PENDING/EXPIRED/PERMISSION-DENIED/SUCCESS.
- Acceptance walkthrough: knowing only a booking reference cannot reveal trip/customer data; verified guest can open only that reservation.

### FLOW-CUS-004 — Modify Reservation

- Objective/FRs: replace an eligible reservation promise atomically while retaining the original on failure; FR-RSV-001/002, FR-CAT-005–007, FR-PRC-002, FR-PAY-007.
- Actors/apps/devices: customer on customer apps or authorized agent/support in APP-OPS; providers as needed. Trigger: EL-CUS-015-01/EL-OPS-005-01. Preconditions: modifiable state/policy.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Select change type EL-CUS-016-01 | Only permitted fields and current values shown | Proposal draft; original fixed |
| 2 | Edit and check EL-CUS-016-02 | Availability/eligibility/price check; alternatives | Old/new comparison or unavailable result |
| 3 | Accept alternative if needed EL-CUS-016-03 | Changed criterion highlighted | Updated proposal, not committed |
| 4 | Confirm EL-CUS-016-04 | One busy action; payment/refund status | Updated SCREEN-CUS-015/SCREEN-OPS-005 or original unchanged |

- Branches and closure: invalid input focuses summary; unavailable option keeps original; price/terms difference requires acceptance; restricted field routes to staff; payment failure keeps original; unknown provider result locks retry and creates reconciliation; stale/concurrent update displays current/proposal comparison. Discard EL-CUS-016-05 removes only proposal. Permission denial shows who can help. Final actions are view modified booking, try another proposal, keep, or cancel separately.
- Objects: SCREEN-CUS-015/016, SCREEN-OPS-005; COMP-CUS-001/003, COMP-SH-008/013/020; reservation Original/Proposal/Modified states.
- Acceptance walkthrough: simultaneous staff cancellation makes customer commit unavailable and shows the accepted cancellation rather than overwriting it.

### FLOW-CUS-005 — Cancel Reservation and Track Refund

- Objective/FRs: terminate a pre-rental reservation, release resources, and transparently track financial follow-up; FR-RSV-003, FR-PAY-006, FR-INT-002/004.
- Actors/apps/devices: customer or authorized staff; payment/message provider. Trigger: EL-CUS-015-02 or staff action. Preconditions: rental not opened and policy permits cancellation path.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Open cancellation review | Policy/price refreshed | SCREEN-CUS-017 with retained/refundable breakdown |
| 2 | Choose reason if required EL-CUS-017-01 | Dynamic reason loading/validation | Ready to cancel or explicit lookup recovery |
| 3 | Confirm EL-CUS-017-02 | Busy once; consequence named | Reservation Cancelled; inventory/extras released |
| 4 | View result/track EL-CUS-017-04 | Refund/communication state separate | SCREEN-CUS-015/019; pending owner shown |

- Branches and closure: Keep reservation exits unchanged; already cancelled returns existing result; rental opened redirects to return/support; stale policy refreshes review; refund/message failure never reverses cancellation and creates owned case; offline commit disabled; session expiry reauthenticates before final action. Reversal of an incorrect no-show/cancellation is staff-audited, not customer undo. Final actions are refund tracking, support, new booking.
- Objects: SCREEN-CUS-015/017/019, SCREEN-OPS-005/023/024; COMP-SH-008/013/018/020; Cancelled/Refund-pending/Refunded/Finance-review.
- Acceptance walkthrough: repeated Cancel yields one terminal event/refund; failed email reads “Cancelled; message not delivered.”

### FLOW-CUS-006 — View Active Rental and Request Extension

- Objective/FRs: expose active obligations and obtain an extension only after availability, price, payment, and approval checks; FR-RNT-005–007, FR-CAT-005, FR-PAY-007.
- Actors/apps/devices: renter/customer, agent/manager; customer apps and APP-OPS. Trigger: current rental or extension action. Preconditions: active/overdue rental and authenticated ownership.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Open SCREEN-CUS-020 | Due time/time zone, status, current terms visible | Choose extension/help/return |
| 2 | Propose new return EL-CUS-021-01/02 | Constraints then availability/maintenance/price result | Self-service-confirmable, staff-review, or unavailable |
| 3 | Confirm/send request EL-CUS-021-03 | New total/terms or owner/pending status | Amended active rental or pending request |
| 4 | Staff reviews EL-OPS-010-01 if needed | Impact/approval/customer preview | Approved with new due time or rejected with original due time |

- Branches and closure: unavailable offers shorter/different valid option; payment failure keeps original due; unknown result creates reconciliation; pending request clearly says original due remains binding; duplicate request returns existing; stale downstream reservation/maintenance forces recheck; unauthorized staff/customer sees contact owner. User may cancel proposal, not an already-sent provider action. Final actions are continue under displayed due time, return, or contact staff.
- Objects: SCREEN-CUS-020/021, SCREEN-OPS-010/003; COMP-SH-007/008/018/020, COMP-OPS-005; Active/Active-extended/Request-pending/Overdue.
- Acceptance walkthrough: request conflicting with the next booking cannot show approval; rejection leaves agreement and payment unchanged.

### FLOW-CUS-007 — Request Roadside Help

- Objective/FRs: create a safe, owned assistance case with clear fallback; FR-RNT-008, FR-INT-005.
- Actors/apps/devices: renter/customer mobile/web, support/fleet, assistance provider. Trigger: EL-CUS-020-02. Preconditions: identifiable active rental; emergency contact remains accessible even when sign-in/connectivity fails.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Select Roadside issue EL-CUS-022-01 | Immediate configured safety/contact notice | Focused minimum-question form |
| 2 | Confirm location/contact/drivability EL-CUS-022-02/03 | Map candidate requires confirmation; “Not sure” allowed | Review-ready request |
| 3 | Submit EL-CUS-022-05 or call EL-CUS-022-06 | Case reference/owner/status or clear call-only state | SCREEN-OPS-012 queue; customer instructions |
| 4 | Staff/provider update case | Customer sees verified status/request for info | Advice, dispatch, tow/repair, replacement, or termination flow |

- Branches and closure: provider failure offers alternate channel and retains owned case; offline draft says Not submitted and exposes phone; duplicate submits return case; stale rental/unit state links rather than overwrites; permission/identity failure exposes emergency contact but not rental data. Customer cancellation is allowed only before dispatch if policy permits; later change is a case action. Final next action is wait with owner/time, provide info, call, or follow replacement/return instruction.
- Objects: SCREEN-CUS-020/022, SCREEN-OPS-012; COMP-SH-016/018/020; Case Open/Waiting-provider/In-progress/Resolved/Escalated.
- Acceptance walkthrough: a provider outage does not leave a spinner; customer gets a case or an alternate contact and staff owns the failure.

### FLOW-CUS-008 — Report Incident

- Objective/FRs: record incident facts, protect safety/availability, and route review without premature liability judgment; FR-RNT-009/010, FR-FLT-003/006.
- Actors/apps/devices: renter/customer, agent/fleet/manager; customer apps and APP-OPS. Trigger: EL-CUS-020-03. Preconditions: identifiable rental; urgent guidance available.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Select Incident EL-CUS-022-01 | Safety/authority/contact instructions | Incident form with known rental/unit |
| 2 | Enter facts/location/drivability/evidence | Required/optional clarity; files upload independently | Review with missing-item warnings |
| 3 | Submit EL-CUS-022-05 | One case reference; unit may become blocked | SCREEN-OPS-012 triage and customer next instructions |
| 4 | Staff triages EL-OPS-012-01–05 | Owner/severity/provider/replacement status | Continue, replace FLOW-OPS-007, recover/return, or investigate |

- Branches and closure: incomplete submission may save pending if minimum safe facts exist; duplicate report links; offline unsent draft is unmistakable; unsafe unit block is immediate and visible; provider delay has manual fallback; customer can correct by adding information, not erasing submitted facts. Permission denial does not hide emergency guidance. Final actions are follow instructions, supply evidence, accept replacement amendment, or track case.
- Objects: SCREEN-CUS-022, SCREEN-OPS-012/010/018; COMP-SH-016/018/020; Incident Reported/Triaged/Response/Review/Resolved.
- Acceptance walkthrough: incident submit immediately removes an unsafe unit from future assignment while preserving the active rental's correct review state.

### FLOW-CUS-009 — Return Instructions and After-Hours Check-in

- Objective/FRs: guide a valid return and ensure unattended returns reach staff inspection; FR-RNT-007/011/014.
- Actors/apps/devices: renter/customer, agent/fleet; customer apps and APP-OPS. Trigger: EL-CUS-020-04. Preconditions: active/overdue/return-started rental.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Open SCREEN-CUS-023 | Exact location, time zone, due time, hours, checklist | Directions, timing update, or after-hours path |
| 2 | Choose directions/timing action | Provider fallback or price/policy effect | Valid return plan/extension route |
| 3 | Start after-hours EL-CUS-023-03 if eligible | Custody/risk rule and required facts shown | Review-ready check-in |
| 4 | Submit EL-CUS-023-04 | Receipt/reference and “Pending staff inspection” | SCREEN-OPS-011 queue; customer active rental shows pending return |

- Branches and closure: ineligible after-hours gives staffed hours/alternate contact; mapping failure retains stored instructions; offline form remains unsent; repeated submit returns same check-in; staff finding later updates review/statement rather than changing submitted timestamp. Session expiry reauthenticates but urgent instructions remain. Final actions are await inspection, contact location, view return status.
- Objects: SCREEN-CUS-023/020, SCREEN-OPS-011/018; COMP-SH-016/018/020; Active/Return-started/Returned-pending-inspection.
- Acceptance walkthrough: customer check-in cannot make unit Available; staff queue and customer both show pending inspection.

### FLOW-CUS-010 — Manage Profile, Drivers, and Account Request

- Objective/FRs: maintain future-use customer data and submit governed access/correction/closure requests; FR-IAM-006–008.
- Actors/apps/devices: customer, authorized support; customer apps/APP-OPS. Trigger: Account overview. Preconditions: authenticated account; reauthentication for sensitive action.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Choose account section EL-CUS-011-04 | Current verification/expiry status | SCREEN-CUS-012/013/024 |
| 2 | Edit/save profile or driver | Inline validation, dynamic reference states | Future profile saved, contact pending verification, or document review pending |
| 3 | Select data request EL-CUS-024-01 and verify | Consequences, retention, active obligations | Ready request or explicit blocker |
| 4 | Submit EL-CUS-024-03 | Case reference/owner/status | SCREEN-OPS-022 task; customer request timeline |

- Branches and closure: concurrent profile change shows comparison; document failure preserves other fields; driver removal blocked/redirected when active use exists; closure blocked by active rental/unpaid issue with direct action; support lacks password access. Cancel edit restores persisted values; cancel request only when pending/permitted. Historical agreements remain unchanged. Final actions are verify contact, track review/request, complete blocker, or return account.
- Objects: SCREEN-CUS-011–013/024, SCREEN-OPS-022; COMP-CUS-004, COMP-SH-016/018/020; Verified/Pending/Rejected/Request-in-review/Closed.
- Acceptance walkthrough: editing a phone creates a verification state and does not rewrite the contact on a completed rental agreement.

### FLOW-OPS-001 — Staff-Assisted Booking

- Objective/FRs: create an attributable reservation for a customer through staff without bypassing ordinary protections; FR-BKG-010 plus FR-BKG/PAY/CAT/PRC booking requirements.
- Actors/apps/devices: rental/support agent on APP-OPS; customer and providers. Trigger: EL-OPS-002-04/004-05. Preconditions: booking permission and active scope.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Find/create customer EL-OPS-006-01 | Duplicate/verification status; guest option if allowed | Identified booking owner |
| 2 | Search and choose offer EL-OPS-006-02 | Staff scope/channel rate/promise | Held offer and task list |
| 3 | Complete renter/extras/payment steps | Same eligibility/price/provider feedback as customer flow | Review-ready draft or pending prerequisite |
| 4 | Record consent EL-OPS-006-03 | Acceptance channel/version visible | Consent complete or blocked |
| 5 | Confirm EL-OPS-006-05 | Atomic status; communication preview/result | SCREEN-OPS-005 and customer confirmation |

- Branches and closure: no customer match permits safe create; duplicates require selection/review; override uses approval; caller interruption becomes owned expiring draft; payment unknown routes reconciliation; customer decline/cancel releases hold. Permission or scope loss stops and reassigns draft. Stale rate/availability forces new comparison. Final actions are view reservation, send confirmation, complete pending item, or cancel draft.
- Objects: SCREEN-OPS-006/005, customer checkout components in staff mode, COMP-OPS-005; Draft/Pending/Confirmed/Expired.
- Acceptance walkthrough: staff cannot check customer consent by default or confirm twice; acting staff and channel appear in history.

### FLOW-OPS-002 — Prepare Pickup and Assign Vehicle

- Objective/FRs: make every upcoming reservation ready with a valid unit or owned recovery; FR-RNT-001/002, FR-FLT-003/006.
- Actors/apps/devices: rental agent/fleet on APP-OPS; customer receives status. Trigger: upcoming queue. Preconditions: confirmed reservation.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Filter readiness EL-OPS-007-01 | Ready/blocked/unassigned counts | Prioritized work cards |
| 2 | Resolve checklist blockers EL-OPS-007-03 | Owning screen and returned outcome | Reservation closer to ready or explicit unresolved owner |
| 3 | Assign unit EL-OPS-007-02 | Eligible units, conflicts, readiness and promise impact | Unit held/assigned or alternative review |
| 4 | Mark ready through required inspection/tasks | All checklist outcomes visible | Pickup-ready and customer instruction, or service recovery |

- Branches and closure: no same-category unit → eligible upgrade/downgrade/location/time options and customer/manager acceptance; unit becomes unavailable → FLOW-OPS-008 and reassignment; stale/concurrent assignment rejected; permission denial permits assignment request/owner handoff. Cancellation/no-show releases unit through owning flow. Final actions are wait for arrival, start pickup, or contact/reaccommodate customer.
- Objects: SCREEN-OPS-007/005/014/018/019, COMP-OPS-003/004; Unassigned/Assigned/Blocked/Pickup-ready/Recovery.
- Acceptance walkthrough: taking an assigned unit out of service generates a visible reassignment task; customer is never told “Ready” while a blocking check is open.

### FLOW-OPS-003 — Verify Pickup and Open Rental

- Objective/FRs: hand over one ready unit only after non-waivable identity, eligibility, payment, inspection, and agreement checks; FR-RNT-003–005, FR-PAY-003.
- Actors/apps/devices: agent/renter/additional drivers; APP-OPS with customer surfaces. Trigger: EL-OPS-007-05/005-05. Preconditions: confirmed reservation and candidate unit.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Open checklist SCREEN-OPS-008 | Known blockers and customer-facing promise | Opening-pending |
| 2 | Verify identity/drivers/documents EL-OPS-008-01/02 | Per-check verified/failed/review, allowed alternatives | Eligible or blocked |
| 3 | Verify payment/deposit | Exact charge/hold distinction and provider state | Financially ready or payment recovery |
| 4 | Record inspection EL-OPS-008-03 | Starting facts/evidence and customer dispute correction | Unit condition accepted |
| 5 | Review agreement/acknowledgement EL-OPS-008-04 | Language/version/full terms | Acceptance recorded |
| 6 | Open rental EL-OPS-008-05 | One atomic commit | SCREEN-OPS-010 + SCREEN-CUS-020; unit On-rent |

- Branches and closure: failed document may correct/change eligible driver/category/manual review; non-overridable failure blocks. Starting-condition dispute returns to inspection. Payment unknown enters reconciliation without handover. Substitute uses FLOW-OPS-002. Abort EL-OPS-008-06 reconciles booking/unit/payment. Session expiry retains completed accepted checks and requires reauth. Stale unit/reservation refreshes. Final actions are active rental support/return or explicit reservation recovery.
- Objects: SCREEN-OPS-008/018/010, SCREEN-CUS-020; COMP-OPS-004/005, COMP-SH-008/016/020; Opening-pending/Active/Aborted-resolution.
- Acceptance walkthrough: handover cannot become Active twice; a non-waivable failed licence check leaves vehicle unhanded and shows valid next options.

### FLOW-OPS-004 — Handle Late Pickup and No-show

- Objective/FRs: apply configured grace/contact/no-show behavior with inventory and finance effects visible; FR-RSV-004, FR-PRC-003.
- Actors/apps/devices: agent/manager on APP-OPS; customer surfaces/messages. Trigger: at-risk readiness item or customer delay report. Preconditions: pre-pickup reservation.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Open at-risk card/reservation | Due/grace time zone, contact history, guarantee | Contact/hold/no-show options |
| 2 | Record delay/contact outcome | Availability and downstream impact | Pickup time update/request or still at-risk |
| 3 | Extend hold or mark no-show EL-OPS-005-04 | Policy/price/inventory impact and approval | Confirmed delayed, No-show, or rejected override |
| 4 | Notify and release/retain unit accordingly | Delivery separate from state | Customer sees verified outcome; work closes or escalates |

- Branches and closure: customer arrives before commit → start pickup; no unit after release → new quote/service recovery; stale clock/state → refresh; permission denial → manager request; incorrect no-show correction is audited and financial effects reversed by linked actions. Offline no-show commit disabled. Final actions are pickup, new booking, refund/charge review, or close no-show.
- Objects: SCREEN-OPS-007/005, SCREEN-CUS-015/019; COMP-SH-013/018/020; Confirmed-delayed/No-show/Corrected.
- Acceptance walkthrough: marking no-show once releases inventory and applies one disclosed financial result with actor/time/reason.

### FLOW-OPS-005 — Approve or Reject Extension

- Objective/FRs: resolve a customer/staff extension request with downstream availability protected; FR-RNT-006/007, FR-CAT-005, FR-PAY-007.
- Actors/apps/devices: agent/manager on APP-OPS; customer; provider. Trigger: queue/rental request. Preconditions: active rental and pending proposal.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Open request EL-OPS-009-04 | Current/proposed due, availability, maintenance, price/payment | Impact review |
| 2 | Choose approve/reject/request change EL-OPS-010-01 | Approval authority and customer preview | Ready commit or higher approval |
| 3 | Confirm decision | Provider/payment and agreement update status | Active-extended or original Active/Overdue |
| 4 | Customer receives status | New due or rejection reason category/alternatives | Continue/return/contact |

- Branches and closure: conflict offers shorter time/replacement reallocation only through explicit work; payment failure leaves original due; unknown provider state routes reconciliation; stale request refreshes; duplicate decision returns accepted outcome; requester can cancel while unreviewed if permitted. Permission denial reassigns. Final actions use displayed due time and close request only after customer status/financial outcome is owned.
- Objects: SCREEN-OPS-010/003/024, SCREEN-CUS-021/020; COMP-OPS-005, COMP-SH-008/018/020.
- Acceptance walkthrough: rejection never silently changes return time; approval updates agreement, fleet plan, price, and customer status together.

### FLOW-OPS-006 — Receive, Inspect, Charge, and Close Return

- Objective/FRs: end possession, establish condition/usage, settle known amounts, and place unit correctly; FR-RNT-011–016, FR-PAY-003/007.
- Actors/apps/devices: agent/fleet/finance on APP-OPS; renter/customer. Trigger: scheduled/after-hours return. Preconditions: active/return-started rental.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Record return facts EL-OPS-011-01 | Comparison with agreement/after-hours data | Returned-pending-inspection; possession status ended |
| 2 | Inspect EL-OPS-011-02 → SCREEN-OPS-018 | Finding/evidence/readiness outcome | Passed, failed, or review task; unit not prematurely available |
| 3 | Add adjustments/credits EL-OPS-011-03 | Evidence/basis/tax/approval and duplicate checks | Itemized final/interim statement |
| 4 | Review with customer EL-OPS-011-04 | Disputed vs undisputed/pending items | Acknowledged or review case |
| 5 | Settle/close EL-OPS-011-05 | Payment/deposit/provider and vehicle-next-state results | Completed or financially/operationally pending with owners |

- Branches and closure: missing keys/damage → case/maintenance; disputed finding → review without hiding undisputed balance; payment/release failure → finance queue while vehicle state follows inspection; after-hours data remains unverified until staff receive; stale rental/unit blocks commit; offline allows evidence draft only. Save pending EL-OPS-011-06 requires owner. Later items use FLOW-OPS-019. Final actions are customer statement/refund tracking and fleet readiness work.
- Objects: SCREEN-OPS-011/018/023/024/014/017, SCREEN-CUS-019/023; COMP-OPS-004/005; Return-started/Returned-pending-inspection/Financial-review/Completed.
- Acceptance walkthrough: returned vehicle can enter Cleaning while refund is pending; the system does not keep it On-rent or mark it Available incorrectly.

### FLOW-OPS-007 — Replace Vehicle After Incident

- Objective/FRs: move an active rental from an unusable unit to an eligible unit with continuous history; FR-RNT-009/010, FR-FLT-003.
- Actors/apps/devices: agent/fleet/manager on APP-OPS; customer. Trigger: EL-OPS-012-05/010-04. Preconditions: incident/issue assessed and replacement appropriate.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Start replacement from case/rental | Old unit condition/recovery and remaining agreement visible | Replacement-in-progress |
| 2 | Search/select eligible unit | Availability, category/features, location, price/protection impact | Candidate comparison |
| 3 | Obtain approval/customer acknowledgement | Upgrade/downgrade/financial terms explicit | Accepted candidate or alternatives |
| 4 | Record old-unit custody and new-unit inspection/handover | Checklist prevents ambiguous custody | Agreement amended; rental Active with replacement |

- Branches and closure: no unit → other location/time/service recovery/termination; customer declines changed promise → alternative/termination; payment failure holds amendment; stale unit assignment refreshes; offline cannot finalize transfer. Abort restores clear custody/state and preserves case. Permissions route approval. Final actions are continue rental, recover/repair old unit, or early termination/return.
- Objects: SCREEN-OPS-012/010/014/018/007, SCREEN-CUS-020; COMP-SH-009/008, COMP-OPS-004/005; Replacement-in-progress/Active-replaced/Terminated-review.
- Acceptance walkthrough: timeline shows exact unit and effective interval; neither unit is ambiguously available/on-rent.

### FLOW-OPS-008 — Block, Maintain, and Return Vehicle to Service

- Objective/FRs: prevent unsafe/unready sale and restore availability only after valid work; FR-FLT-003/005–007/009.
- Actors/apps/devices: fleet/manager on APP-OPS. Trigger: inspection/incident/due document/manual block. Preconditions: visible unit/current state.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Create block/work EL-OPS-014-03 or SCREEN-OPS-019/017 | Reservation/assignment impact | Unit/capacity unavailable and work owned |
| 2 | Resolve affected demand | Reassignment/customer tasks | Promises recovered or escalated |
| 3 | Perform maintenance/inspection | Evidence/progress/readiness | Completed pass or follow-up failure |
| 4 | Release/set Available EL-OPS-017-05/019-04 | Dependency and lifecycle validation | Available at correct location or remains unavailable |

- Branches and closure: conflicting future reservation cannot be ignored; safety-critical work cannot be cancelled; document expiry remains blocker; stale status rejects transition; permission denial creates task; offline evidence draft not state commit. Reopen creates new history and unavailable state. Final actions are assignment eligibility or further work/retirement.
- Objects: SCREEN-OPS-014/017–019/007, COMP-OPS-004/005; Available/Unavailable/Maintenance/Damage-review/Cleaning.
- Acceptance walkthrough: manual “Available” is disabled while critical maintenance/document blocker remains.

### FLOW-OPS-009 — Transfer Vehicle

- Objective/FRs: move location custody without overpromising future availability; FR-FLT-004, FR-CAT-005.
- Actors/apps/devices: fleet/manager on APP-OPS. Trigger: EL-OPS-014-04/016-01. Preconditions: valid unit state and route/scope.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Plan transfer EL-OPS-016-01 | Origin/destination/time and future-demand impact | Scheduled or conflict resolution |
| 2 | Confirm departure EL-OPS-016-02 | Actual custody/odometer/fuel-charge | Transfer state; no location double-count |
| 3 | Confirm arrival EL-OPS-016-03 | Condition/readiness and actual time | Destination state Available or work-required |
| 4 | Handle delay/cancel EL-OPS-016-04 | Affected reservations/tasks and owner | Replanned/cancelled/escalated |

- Branches and closure: no route/permission blocks plan; concurrent rental/block refreshes; delay removes destination capacity and triggers reassignment; offline does not finalize custody; cancellation after departure requires return/reroute, not draft delete. Final actions are readiness/assignment or exception queue.
- Objects: SCREEN-OPS-016/014/007/003; Transfer Scheduled/In-transit/Arrived/Delayed/Cancelled.
- Acceptance walkthrough: a delayed unit is not shown Available at destination and every impacted booking is listed.

### FLOW-OPS-010 — Import or Bulk Update Fleet

- Objective/FRs: apply supported fleet changes with row-level validation and no hidden partial failure; FR-FLT-008, FR-GBL-008.
- Actors/apps/devices: fleet/admin on desktop APP-OPS. Trigger: EL-OPS-013-04. Preconditions: import/export permission.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Choose workflow/file/scope EL-OPS-020-01/02 | Upload/parsing status | Uploaded draft only |
| 2 | Validate/preview EL-OPS-020-03 | Per-row accepted/rejected/unchanged and conflict reasons | Confirmable subset or correction |
| 3 | Run EL-OPS-020-04 | Tracked job, progress/counts | Completed/partial/failed job |
| 4 | Download errors or retry failed EL-OPS-020-05 | New linked job for corrected failures only | All valid changes applied or residual owned errors |

- Branches and closure: invalid file preserves no commit; duplicates/conflicting operational state reject row; permission loss stops high-risk columns; cancellation reports already committed rows; session/browser close leaves job running visibly; repeated Run returns same job. Export follows masking/scope. Final actions are inspect units, correct failures, download result.
- Objects: SCREEN-OPS-020/013/014, COMP-SH-016/017; Draft/Validated/Running/Partial/Completed/Failed/Cancelled.
- Acceptance walkthrough: one bad category rejects its row, other valid rows are explicitly accepted, and retry does not duplicate them.

### FLOW-OPS-011 — Review Customer Restriction or Duplicate

- Objective/FRs: correct/merge verified customer data or apply a lawful governed restriction; FR-ADM-001/002, FR-IAM-008.
- Actors/apps/devices: manager/authorized support on APP-OPS. Trigger: duplicate marker, eligibility review, or data request. Preconditions: specific permission and scoped customer.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Open customer EL-OPS-021-02/022 | Masked identity/verification and linked obligations | Review context |
| 2 | For duplicate, compare EL-OPS-022-04 | Field/link conflicts and proposed survivor | Verified merge proposal or keep separate |
| 3 | For restriction, add/review EL-OPS-022-03 | Type/scope/period/evidence/customer-treatment | Approval or saved review flag |
| 4 | Confirm permitted outcome | Audit/customer/booking impact | Merged mapping, enforced scoped restriction, correction, or rejection |

- Branches and closure: uncertain identity stays separate; active obligations prevent destructive closure; free text cannot enforce; expired restriction stops applying; customer appeal/correction appends history. Stale profile/permission refreshes. Reauthentication/approval applies to high risk. Cancel leaves unchanged. Final actions are resolve affected booking, notify appropriately, or review later.
- Objects: SCREEN-OPS-021/022/038, SCREEN-CUS-024; COMP-OPS-005, COMP-SH-009/018/020.
- Acceptance walkthrough: restriction applies only to defined person/scope/period; merge never exposes or loses reservations from either candidate.

### FLOW-OPS-012 — Refund, Dispute, or Reconcile Payment

- Objective/FRs: produce one explainable financial resolution without over-refund or duplicate transaction; FR-PAY-006–009, FR-INT-001/004.
- Actors/apps/devices: finance/manager on APP-OPS; customer/provider. Trigger: cancellation, adjustment, dispute, mismatch, or failed/unknown item.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Open transaction/exception EL-OPS-023-01/024-01 | Internal/provider facts, eligible balance, customer impact | Review state |
| 2 | Refresh/link/evidence EL-OPS-024-02/03 | Consistency checks and existing references | Reconciled fact set or still unknown |
| 3 | Choose refund/reverse/dispute/compensate | Amount/reason/approval/deadline preview | Confirmable action or approval request |
| 4 | Commit once | Provider pending/success/failure | Updated ledger/customer status or owned exception |
| 5 | Notify/close exception | Verified outcome and receipt/evidence | Resolved-linked/compensated/explained or escalated |

- Branches and closure: over-refund blocked; provider unknown disables new money action; permission/threshold routes approval; stale balance refreshes; repeated submit returns existing transaction; provider failure keeps underlying cancellation/return effective. User can cancel before provider commit; later correction uses reversal. Final actions are customer tracking, provider escalation, or report reconciliation.
- Objects: SCREEN-OPS-023/024/038/039, SCREEN-CUS-019; COMP-OPS-005, COMP-SH-008/018/020.
- Acceptance walkthrough: two finance users cannot refund the same remaining amount; failed refund stays visible with one owner.

### FLOW-OPS-013 — Publish Pricing, Policy, Location, or Product Version

- Objective/FRs: activate conflict-free prospective business behavior with preview and history; FR-PRC-001/003–006, FR-ADM-005–007/010.
- Actors/apps/devices: manager/admin/editor on desktop APP-OPS. Trigger: create/edit configuration. Preconditions: permission and owning scope.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Create version on SCREEN-OPS-025–029 | Draft scope/effective period/status | Editable draft |
| 2 | Configure with dynamic sources | Inline/summary validation and source availability | Saved draft or explicit dependency blocker |
| 3 | Preview scenario/customer surface | Winning rule, total/conditions, translations, impact | Ready or correction list |
| 4 | Submit/approve/publish via COMP-OPS-006 | Approval/conflict/gap check | Scheduled/Active or blocked/rejected |
| 5 | Pause/supersede if needed | Future effect/fallback/customer tasks | Paused/Expired/Superseded; history intact |

- Branches and closure: overlap/gap/missing translation blocks publication; locked invariant links to owner; stale version compares changes; permission loss makes read-only; session interruption preserves draft; rejected returns comments; emergency pause requires fallback and audit. Confirmed bookings never silently reprice. Final actions are monitor usage, schedule successor, or fix draft.
- Objects: SCREEN-OPS-025–029/033/034/038, COMP-OPS-005/006; Draft/Review/Scheduled/Active/Paused/Expired/Superseded.
- Acceptance walkthrough: publishing a future rate changes matching new quotes after effective time but not any confirmed booking snapshot.

### FLOW-OPS-014 — Manage Lookup Values

- Objective/FRs: provide dynamic, governed options while preserving historical meaning; FR-GBL-004, FR-ADM-008.
- Actors/apps/devices: data steward/admin/manager on APP-OPS. Trigger: catalogue or failing selector. Preconditions: reference type resolved.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Search/open type EL-OPS-030-01/02 | Classification/source/editability/reason | SCREEN-OPS-031 or owning entity screen |
| 2 | Add/edit/reorder/default EL-OPS-031-01–03 | Unique code, translation, usage, conflict validation | Saved active/draft value |
| 3 | Deactivate/restore EL-OPS-031-04 | Usage and new-versus-history effect | Inactive/active with audit |
| 4 | Return to origin/refresh selector | Authoritative options reload | New form sees valid value; historical form resolves inactive label |

- Branches and closure: system-fixed is read-only; external source uses sync status/retry; entity-owned links to owning area; value in use cannot delete; concurrent edit compares; missing translation blocks/flags per policy. Cancel/discard uses unsaved guard. Final actions are continue originating form, translate, inspect usage/history.
- Objects: SCREEN-OPS-030/031 and owning screens; COMP-SH-006/009/014/020; Active/Inactive/Read-only/Sync-failed.
- Acceptance walkthrough: deactivate a cancellation reason; it disappears from new cancellation choices but remains on old reservation history.

### FLOW-OPS-015 — Manage Staff Access

- Objective/FRs: invite/change/suspend staff with least privilege and owned-work continuity; FR-ADM-009, FR-IAM-003/005.
- Actors/apps/devices: administrator/delegated manager on APP-OPS. Trigger: Staff/Roles. Preconditions: permission and protected admin continuity.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Invite EL-OPS-032-01 | Duplicate/pending/status and role/scope summary | Sent/pending invite or retryable delivery failure |
| 2 | Edit role EL-OPS-032-02 | Protected actions grouped by risk; invalid combination | Draft/active role version |
| 3 | Change assignment EL-OPS-032-03 | Gained/lost access, approval, owned-work impact | Applied or pending approval |
| 4 | Reassign work EL-OPS-032-06 | Per-item eligibility/conflicts | New owners acknowledged/pending |
| 5 | Suspend/deactivate EL-OPS-032-04 | Session/access/history effect | Suspended/deactivated; history retained |

- Branches and closure: cannot self-escalate or remove last admin; duplicate invite offers resend/revoke; scope permission constrains targets; stale role refreshes; high risk reauth/approval; delivery failure does not create duplicate staff. Revocation ends pending invite. Final actions are resend, review access history, or reactivate through governed flow.
- Objects: SCREEN-OPS-032/003/038, COMP-OPS-005; Invited/Active/Suspended/Deactivated/Approval-pending.
- Acceptance walkthrough: removing a location role identifies and reassigns open pickup tasks before access is removed.

### FLOW-OPS-016 — Author and Publish Translation or Template

- Objective/FRs: publish complete localized content with protected variables and context preview; FR-ADM-011/012, FR-INT-002.
- Actors/apps/devices: editor/translator/reviewer/admin on APP-OPS. Trigger: template/translation queue. Preconditions: source content and language configured.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Select event/content/language | Completeness/fallback/source version | Draft editor |
| 2 | Edit EL-OPS-033-01 or 034-02 | Variable/code protection and autosave/conflict | Saved draft |
| 3 | Preview/test EL-OPS-033-02/03 or 034-03 | Context, device, RTL, expansion, channel delivery | Ready or corrections |
| 4 | Submit/review/publish | Comments/approval/completeness | Published, rejected-to-draft, or fallback exception |

- Branches and closure: missing required variable/legal content blocks; provider test failure differs from content failure; stale source marks translation outdated; permission controls author/reviewer separation; session interruption keeps draft; fallback exception requires scope/reason/expiry. Pause affects future events only. Final actions are monitor delivery/completeness, revise, or publish other languages.
- Objects: SCREEN-OPS-033/034/039, COMP-OPS-006; Draft/In-review/Approved/Published/Outdated/Paused.
- Acceptance walkthrough: RTL cancellation template preview shows correct mixed-direction reference and final sent event retains template version.

### FLOW-OPS-017 — Build, Export, or Schedule Report

- Objective/FRs: produce defined, scoped, non-misleading insight and authorized delivery; FR-RPT-001–006.
- Actors/apps/devices: manager/finance/auditor on APP-OPS. Trigger: dashboard/report hub. Preconditions: report/row/field permissions.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Choose report EL-OPS-035-01 | Definition, freshness, default scope | SCREEN-OPS-036 |
| 2 | Set dimensions/filters/date basis EL-OPS-C07-01–03 | Invalid/ambiguous currency/time definitions | Runnable specification |
| 3 | Run/drill EL-OPS-036-01/02 | Loading then labelled complete/partial/stale result | View contributing records or adjust |
| 4 | Export/schedule EL-OPS-036-04/05 | Masking/recipient/time-zone preview | Tracked job or active schedule |
| 5 | Download/monitor EL-OPS-037-02–05 | Expiry/delivery/authorization status | File delivered, regenerated, paused, or failed-owned task |

- Branches and closure: source failure not zero; cross-currency total blocked; empty valid result labelled; permission changes remove data and pause schedules; browser close keeps job; repeated export returns/creates explicitly separate job; expired link regenerates. Cancel running job reports partial state. Final actions are inspect, export, schedule, fix data quality, or return hub.
- Objects: SCREEN-OPS-035–038, COMP-OPS-007, COMP-SH-017/020; Ready/Running/Complete/Partial/Failed/Expired/Scheduled/Paused.
- Acceptance walkthrough: utilization report names denominator/time zone and drilling the count opens the exact contributing intervals.

### FLOW-OPS-018 — Resolve Integration or Partial Failure

- Objective/FRs: reconcile every cross-system partial action to a consistent outcome or visible escalation; FR-INT-001–005, FR-PAY-004/009.
- Actors/apps/devices: authorized operations/finance/admin on APP-OPS; providers; affected customer. Trigger: detected exception. Preconditions: linked case/reference where available.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Open queue/provider exception | Verified local facts, customer impact, current owner | Investigation state |
| 2 | Check provider EL-OPS-039-02/03 or 024-02 | Timestamped known/unknown/contradictory result | Safe action set recalculated |
| 3 | Retry/link/compensate/manual fallback | Side-effect preview, permissions, existing references | Reconciled result or still pending |
| 4 | Communicate verified outcome | Customer channel status separate | Customer sees confirmed/cancelled/refund-pending etc. |
| 5 | Resolve/escalate EL-OPS-039-06 | Evidence/owner/deadline | Closed consistent case or unresolved escalation |

- Branches and closure: no safe retry means escalate; provider unavailable uses defined manual fallback; duplicate callbacks deduplicate; stale record refreshes; permission routes specialist; unknown financial result never repeats blindly. Cancellation of investigation only transfers/escalates, never hides case. Final actions are linked business record, provider follow-up, customer communication, audit/report.
- Objects: SCREEN-OPS-003/024/039/038, customer detail/status; COMP-SH-018/020, COMP-OPS-005; Open/Investigating/Reconciled-success/Reconciled-failure/Compensated/Escalated.
- Acceptance walkthrough: paid-but-unconfirmed booking resolves to confirmed booking or verified refund; it cannot disappear as “failed.”

### FLOW-OPS-019 — Apply Post-rental Charge or Lost-property Case

- Objective/FRs: link later events to the responsible rental period and notify/resolve fairly; FR-RNT-016, FR-PAY-007/008.
- Actors/apps/devices: finance/support/fleet on APP-OPS; customer. Trigger: later toll/fine/claim or found item. Preconditions: unit/time evidence and permitted action.

| # | Actor action / element | Immediate feedback | Resulting state and next action |
| ---: | --- | --- | --- |
| 1 | Add item EL-OPS-010-06 | Case type and unit/time matching | Linked rental candidate or investigation queue |
| 2 | Enter evidence/amount/property facts | Policy/charge/retention validation | Review-ready case |
| 3 | Approve/charge/notify or record property | Financial/provider or storage/claimant status | Customer notice and case timeline |
| 4 | Handle dispute/claim/return/disposal | Verified identity/evidence and deadlines | Reversed/upheld charge or property closed |

- Branches and closure: unmatched item remains investigation; current renter is never assumed liable; duplicate charge/property report links; provider failure routes reconciliation; customer dispute separates disputed balance; stale closed case can reopen with reason. Permission/threshold approval required. Final actions are payment/dispute tracking, property return, or audited closure.
- Objects: SCREEN-OPS-010/012/023/024, SCREEN-CUS-019; COMP-SH-016/018, COMP-OPS-005; Open/Matched/Review/Charged/Disputed/Reversed/Property-held/Returned/Closed.
- Acceptance walkthrough: a toll timestamp maps to the correct historical rental, not the vehicle's present renter, and notice contains evidence/contact route.

## 10. Cross-Application Handoffs

| Handoff ID | Initiating action/state | Receiver and appearance | Acknowledgement/failure/timeout | Initiator while waiting | Reconciliation and final owner |
| --- | --- | --- | --- | --- | --- |
| HANDOFF-001 | Customer confirms booking | APP-OPS reservation/readiness; provider payment; message delivery | Payment verified before confirmation; message may fail separately | Confirmation or verified pending state with reference | FLOW-OPS-018 owns partial payment/booking; operations owns readiness |
| HANDOFF-002 | Customer submits additional-driver info request | Driver secure task and APP-OPS pending prerequisite | Completed/rejected/expired; notification non-delivery visible | Reservation shows pending item/deadline and original booking state | Customer supplies data; support owns delivery issue; agent owns pickup decision |
| HANDOFF-003 | Customer modifies/cancels | APP-OPS reservation, fleet availability, finance, notifications | Atomic record update; provider/message failure separated | Updated/cancelled state plus payment/message status | Finance owns unresolved payment; reservation action is not rolled back by message failure |
| HANDOFF-004 | Fleet marks unit unavailable | APP-OPS readiness/assignment queues; affected customers only after staff decision | Reassignment accepted/rejected/timed out | Customer sees current promise until a verified change/service notice | Location manager owns affected promise; fleet owns unit work |
| HANDOFF-005 | Customer requests extension | APP-OPS rental queue and finance/provider | Approve/reject/request change; overdue deadline remains visible | Pending card names owner and states original due time is binding | Rental agent/manager owns decision; finance owns payment partial failure |
| HANDOFF-006 | Customer reports roadside/incident | APP-OPS case queue, fleet availability, assistance provider | Case accepted/provider pending/failed/manual fallback | Case reference, current owner, safety/next instruction | Support/fleet case owner until resolved; manager owns replacement/service recovery |
| HANDOFF-007 | Customer after-hours check-in | APP-OPS return queue and fleet | Staff receives/inspects; non-acknowledged item escalates | “Submitted; pending inspection,” receipt, contact route | Return location owns custody verification/inspection |
| HANDOFF-008 | Staff opens/closes rental | Customer active rental/statement, vehicle state, finance/provider | Partial commit creates compensation case | Customer sees only verified Active/Returned/Financial review | Initiating location owns operations; finance owns money; fleet owns readiness |
| HANDOFF-009 | Admin publishes config/translation/template | All consuming surfaces and roles | Activation validation or blocked; stale clients refresh | Admin sees version/use/propagation status | Configuration owner resolves; prior active version remains until safe replacement |
| HANDOFF-010 | Provider sends delayed/repeated event | APP-OPS reconciliation and affected customer record | Event verified/deduplicated/contradictory | Customer sees current verified state, not provider raw state | Finance/integration case owner reconciles and communicates final outcome |

Every pending handoff uses COMP-SH-018. The receiving role sees source, age, customer impact, dependencies, and allowed response. The initiating user sees a status suitable for their role, not internal notes. A timeout escalates to the named owner; it does not silently expire when money, custody, safety, or a customer promise is involved.

## 11. Edge-Case Flow Matrix

### 11.1 Edge profiles

Each flow is assigned a profile below. Every profile explicitly covers all required edge categories; the mapping table adds flow-specific overrides. “Not applicable” is avoided because even read-only, administrative, or background flows can receive empty, stale, unauthorized, interrupted, or failed states.

| Profile | No data / first use | Invalid or incomplete | Duplicate / repeat | Unavailable / exhausted | Expired / already complete/reversed | Stale / concurrent |
| --- | --- | --- | --- | --- | --- | --- |
| EDGE-A — Discovery/read | Explain absence and give first useful action | Inline plus summary; preserve criteria | Repeated read returns current result | Show valid alternatives/retry, never fabricate | Label terminal/expired and offer new valid start | Mark freshness; disable consequential continuation until refresh |
| EDGE-B — Draft/form | Empty form with purpose/default source | Field error plus correction; valid fields remain | Detect duplicate entity/submission before commit | Preserve draft; offer alternate source/support | Revalidate draft; completed item opens result | Compare entered/current values and require deliberate resolution |
| EDGE-C — Financial/destructive commit | Block with missing prerequisite | Consequence-specific error before commit | Return existing transaction/action | Keep original business state; provide alternate/owned case | Show existing terminal outcome; reversal is separate linked action | Lock commit; refresh amount/state/permission and reconfirm |
| EDGE-D — Operational state transition | Queue/card explains no current work | Checklist identifies blocking item and owner | Return already-applied transition | Do not change state; offer valid unit/owner/escalation | Show terminal state and only legal next workflow | Reject transition, show accepted state and affected work |
| EDGE-E — Configuration/version | Empty catalogue offers create/import when permitted | Block publication with exact gap/conflict | Detect duplicate code/scope/version | Keep prior active version/source; show dependency | Historical version read-only; supersede rather than reopen silently | Compare draft versions; merge safe fields or save as new version |
| EDGE-F — Job/report/provider case | Empty valid result distinct from missing source | Block run with definition/format errors | Return existing job/event or create explicitly named new run | Label unavailable/partial and retain last known safe data | Expired download regenerates; closed case may reopen with reason | Label source freshness/version and rerun before resolution |

| Profile | Insufficient permission | Partial completion | External delay/failure | Connectivity loss | User cancellation / abandonment / reversal | Interruption / session expiry / resume | Handoff not acknowledged |
| --- | --- | --- | --- | --- | --- | --- | --- |
| EDGE-A | Hide inaccessible actions; direct route shows safe denial | Show available sections and label unknown, not zero | Keep stored facts; retry/fallback | Last-updated read-only view; no false fresh result | Leaving read has no side effect | Restore filter/position after sign-in/return | Status explains receiver/refresh/support when relevant |
| EDGE-B | Read-only/deny and preserve safe draft; link owner | Save only explicitly supported draft; list missing parts | Keep input; retry/alternate/manual path | Label local draft Not submitted | Discard confirmation only for meaningful edits; no business reversal implied | Resume last safe step after reauth; revalidate expiring facts | Pending card names receiver, deadline, cancel/contact options |
| EDGE-C | Approval/authorized-owner route; no bypass | Create compensation/reconciliation case | Do not retry unknown write; check existing provider reference | Final commit disabled; input retained | Cancel only before send; after success use linked reversal/refund | Reauth, query outcome, return to result; never resend blindly | Escalate financial/customer-impact case; initiating state remains accurate |
| EDGE-D | Show who can perform action/request approval | State each completed side and owned remainder | Manual fallback/queue; operational state stays truthful | Evidence draft may save; custody/safety/money transition waits online | Cancel only valid pending work; applied state uses compensating transition | Persist server-complete checklist, reauth, refresh state | Escalate queue item with owner; do not close source work |
| EDGE-E | Read-only fields and request/approval path | Draft remains non-active; prior active version serves | External source keeps last good values and sync error | Local unsent edit not published; warn before leave | Discard draft; pause/supersede active; preserve history | Draft restores with version comparison and unsaved guard | Approval timeout returns/escalates; no automatic publish |
| EDGE-F | Mask result/disable export or action by permission | Show per-item/source success/failure counts | Retry only safe idempotent read/event; otherwise owned exception | Running server job continues; local-only request remains unsent | Cancel reports already completed parts; reversal is new job/action | Job/case accessible from inbox after session; inputs preserved where safe | Escalate owner/recipient/provider; result remains pending/failed, not closed |

### 11.2 Flow-to-edge-profile mapping and specific overrides

| Flow ID | Profile | Specific edge decisions beyond the profile |
| --- | --- | --- |
| FLOW-CUS-001 | EDGE-B + EDGE-C at final payment | No results uses nearby valid alternatives; hold expiry requires new availability; unknown payment exposes Check status only |
| FLOW-CUS-002 | EDGE-B | Existing account routes recovery; provider cancellation returns; account suspension never bypassed |
| FLOW-CUS-003 | EDGE-B | No match remains neutral; expired challenge may resend; reference alone never grants access |
| FLOW-CUS-004 | EDGE-C | Original booking remains on every failed/abandoned modification; concurrent cancellation wins and is displayed |
| FLOW-CUS-005 | EDGE-C | Already cancelled shows same result; refund/message failure does not reactivate reservation |
| FLOW-CUS-006 | EDGE-C + EDGE-D for approval | Pending approval explicitly preserves original due obligation; duplicate request returns same request |
| FLOW-CUS-007 | EDGE-B + EDGE-F provider case | Offline exposes call route; urgent contact does not require full form; dispatch cancellation depends on provider state |
| FLOW-CUS-008 | EDGE-B + EDGE-D | Minimum safe facts can create pending case; unsafe unit block is immediate; submitted facts corrected by append |
| FLOW-CUS-009 | EDGE-B + EDGE-D | After-hours submission is not inspection; duplicate check-in returns receipt; mapping failure keeps written instructions |
| FLOW-CUS-010 | EDGE-B | Active rental/balance blocks closure with direct next action; saved driver removal never deletes history |
| FLOW-OPS-001 | EDGE-B + EDGE-C | Caller interruption creates expiring owned draft; consent cannot be inferred; payment unknown routes reconciliation |
| FLOW-OPS-002 | EDGE-D | No unit creates reassignment/service recovery; assigned unit failure creates impact queue |
| FLOW-OPS-003 | EDGE-D + EDGE-C | Non-waivable failed check blocks handover; starting-condition dispute must resolve before open |
| FLOW-OPS-004 | EDGE-D + EDGE-C | Customer arrival before commit cancels no-show action; correction uses audited financial/inventory compensation |
| FLOW-OPS-005 | EDGE-D + EDGE-C | Downstream reservation conflict blocks approval; rejection never changes due time |
| FLOW-OPS-006 | EDGE-D + EDGE-C | Possession may end while finance remains pending; unit cannot be available before readiness |
| FLOW-OPS-007 | EDGE-D | No replacement leads to termination/service recovery; neither unit may have ambiguous custody |
| FLOW-OPS-008 | EDGE-D | Safety/document blockers prevent Available; cancelled work cannot erase block reason |
| FLOW-OPS-009 | EDGE-D | After departure, cancellation becomes reroute/return; delayed unit removed from destination capacity |
| FLOW-OPS-010 | EDGE-F | Row-level partial result; retry failed rows only; browser close does not cancel server job |
| FLOW-OPS-011 | EDGE-D + EDGE-C for restriction | Uncertain identity never merges; expired restriction stops applying; free text cannot enforce |
| FLOW-OPS-012 | EDGE-C + EDGE-F | Eligible balance prevents over-refund; provider unknown blocks new money action |
| FLOW-OPS-013 | EDGE-E | Previous active version remains through draft/rejection; confirmed bookings retain snapshot |
| FLOW-OPS-014 | EDGE-E | System-fixed read-only; external sync retains last good; inactive historical label resolves |
| FLOW-OPS-015 | EDGE-E + EDGE-D | Last admin/self-escalation blocked; access removal requires work reassignment |
| FLOW-OPS-016 | EDGE-E + EDGE-F for test delivery | Stale source marks translation outdated; provider test failure distinct from content validation |
| FLOW-OPS-017 | EDGE-F | Missing source not zero; schedule pauses when recipient loses authorization; currency ambiguity blocks total |
| FLOW-OPS-018 | EDGE-F + EDGE-C for financial case | Unknown side effect never blindly retried; unresolved case cannot be cancelled away |
| FLOW-OPS-019 | EDGE-D + EDGE-C | Event must match rental interval; duplicate/unmatched item links or investigates; current renter not assumed responsible |

## 12. Error, Recovery, Interruption, and Resume UX

### 12.1 Validation and business rejection

- Validate simple formats when the user leaves a field and full business rules on Continue/Review; do not show errors before a person has had a reasonable chance to answer.
- On submit, move focus to COMP-SH-005, prefix the page title with an error indication for assistive technology, and use identical concise correction text in summary and beside the field.
- A business rejection names the affected choice and valid recovery: change criteria, provide missing information, choose an alternative, request review, or keep the original. It never says only “Something went wrong.”
- Cross-field errors appear at the first responsible section and link all affected fields. Hidden conditional fields cannot keep an invisible error.

### 12.2 Delayed and unknown outcomes

- After a normal short wait, replace indefinite spinners with STATE-PENDING: submitted time, current owner/provider, known business state, and “Check status” or safe navigation.
- A financial or destructive action with unknown outcome disables repeat and queries the existing action. A new attempt becomes available only after a verified failure/cancellation.
- Background jobs may continue after navigation; task inbox and job screen preserve status. The user is not required to keep the page open.

### 12.3 Connectivity and offline behavior

- Reads may show last successful data with timestamp and scope. Search/availability/price never claim real-time while offline.
- Customer profile, driver, incident narrative, and inspection evidence may hold a local draft only when clearly labelled Not submitted. The user explicitly submits after reconnection.
- Booking confirmation, payment/refund, reservation modification/cancellation, pickup handover, vehicle custody/state, return closeout, access change, and configuration publication require an online verified result.
- Reconnection refreshes reference data and authoritative record versions, then presents differences before allowing commit.

### 12.4 Unsaved changes, interruption, and session expiry

- COMP-SH-014 appears only when leaving would lose meaningful entered work. Navigation within a saved task does not produce repetitive dialogs.
- Session-expiry warning gives time remaining and “Continue session” where allowed. On expiry, secrets/payment frames clear, safe draft and destination persist, and sign-in returns to the same logical step.
- Server-accepted checklist steps, uploads, jobs, and provider actions remain accepted after expiry; the UI reloads them rather than repeating.
- Switching language, scope, device orientation, or responsive size preserves the active task and current focus target where possible.

### 12.5 Feedback hierarchy

1. Inline hint/validation for one field.
2. Error summary for failed form submission.
3. In-page status card/banner for record-wide pending, stale, unavailable, or partial state.
4. Toast only for non-critical short confirmation such as a saved view; it is never the sole evidence for money, cancellation, booking, custody, or access.
5. Confirmation page/panel for completed multi-step or consequential actions.
6. Notification/inbox item for work completed after navigation.

## 13. Accessibility and Adaptive/Responsive Behavior

### 13.1 Interaction accessibility

- All controls have a persistent visible label or an accessible name matching the visible wording. Icon-only use is limited to standard close/reveal/previous-next actions and always has tooltip plus accessible name.
- Logical keyboard order follows reading/task order; visible focus is never obscured by sticky bars, drawers, or virtual keyboards. Skip navigation is available on web and staff surfaces.
- Touch targets meet the chosen accessibility standard; critical mobile actions are comfortably larger. Adjacent destructive/safe actions have sufficient separation.
- No action requires hover, drag, swipe, long press, motion, color perception, audio, or a particular orientation. Reorder offers buttons/position input; image galleries offer buttons as well as swipe.
- Status uses text plus shape/icon where useful. Charts have data tables and summaries; tables retain row/column associations.
- Dynamic status, result count, price change, validation, upload/job progress, and successful commit are announced without unexpectedly moving focus.

### 13.2 Forms and time limits

- Required/optional meaning is stated in text. Examples and format hints precede input; error text states how to correct.
- Autocomplete/prefill is used only for appropriate personal fields and is reviewable. Pasted codes and password managers are supported.
- Hold and session timers are announced at meaningful intervals, explain consequences, and offer extension/restart when policy permits. Animation is not the only timer cue.
- Legal/financial/data deletion actions present a review, permit correction, and provide a confirmation/reference afterward.

### 13.3 Responsive layout contracts

| Pattern | Wide web/desktop | Tablet | Phone/handheld |
| --- | --- | --- | --- |
| Customer search/results | Search panel; filter rail; 2–3 card grid when content fits | One/two cards; compact filter drawer | One card; full-height filters; sticky Search/Choose that does not obscure focus |
| Checkout | Main form + persistent price rail | Stacked or narrow price rail | One task per screen; sticky total opens full sheet; no tiny horizontal stepper |
| Customer detail | Summary plus secondary side card | One column with anchored sections | One column; primary actions grouped near status; documents/activity below |
| Staff lists | Data table, saved filters, optional inspector | Table/cards; inspector stacks | Adaptive cards with critical fields; complex bulk actions unavailable with reason |
| Staff workspaces | Persistent record header; two-pane checklist/detail | Stacked panes, sticky task action | One checklist step; capture controls large; full summary before commit |
| Configuration | Full version form and impact panels | Stacked editable panels | Read-only summary or carefully supported simple action; directs to larger screen for unsafe complex edit |

Content reflows up to high text zoom without clipping, overlapping, two-dimensional scrolling for ordinary content, or hidden status/action. Tables may use a labelled scroll region only when a card transformation would lose relationships.

## 14. Multilingual, Locale, and Bidirectional UX

### 14.1 Language selection and fallback

- First visit uses configured default or safe device preference when supported; the selected language is always visible through EL-SH-001.
- Signed-in account preference follows the user; a deliberate device/session change may be kept locally until the user chooses to update account preference.
- Changing language preserves route, selected record, form values, checkout step, filters, and unsent safe draft. The control never relies only on a flag.
- Missing translation uses the configured fallback and is reported to SCREEN-OPS-034. Raw keys never appear. Critical legal/financial content may block publication/use when fallback is not permitted.

### 14.2 Localized information

- Dates/times show location time zone when relevant; input order follows locale while underlying pickup-before-return logic remains clear. Daylight-saving ambiguity prompts explicit choice/offset explanation.
- Currency uses transaction currency and locale formatting; display conversion remains secondary and labelled informational. Numbers, distance units, and plural forms follow configured market rules.
- Names and addresses do not force one cultural order. Phone fields preserve international prefix. Unicode search uses language-aware matching while stable codes remain exact-searchable.
- Navigation, controls, field hints/errors, statuses, lookups, catalogue content, locations, extras/protection, policies, messages, receipts, agreements, reports, and generated documents participate in translation governance.

### 14.3 RTL and mixed direction

- Page chrome, side navigation, form label alignment, back/forward meaning, drawers, and progress indicators mirror in RTL.
- Vehicle images, maps, charts, chronological timelines, number strings, currencies, dates where the locale requires, booking references, VIN/plate codes, URLs, email, and phone numbers retain semantically correct direction with isolation.
- Previous/next icons mirror only when they mean reading/navigation direction; media rotation and vehicle left/right condition references do not mirror automatically.
- Tables keep logical column order chosen for the language; pinned identifier/action columns move appropriately without reversing codes. Focus order follows the rendered reading order.
- SCREEN-OPS-034 previews long text, short text, mixed Arabic/Latin-like values, narrow mobile, desktop table, form errors, overlay focus, and generated documents before launch approval.

## 15. Reference Data / Lookup Catalogue and Management UX

### 15.1 Dynamic selector contract

Every combobox, select, radio group, checkbox group, reason picker, status label, and entity picker displays a skeleton/loading label while retrieving authoritative options. It distinguishes:

- empty source: “No values are configured” plus owning area/contact when permitted;
- no search result: query remains with Clear/Edit;
- unavailable source: last good value list may remain labelled stale; Retry does not clear the form;
- permission restriction: current historical value may display, but search/new selection reveals no unauthorized records;
- dependent source: child field disables with “Choose [parent] first,” then resets only if its selected value becomes invalid;
- inactive history: shown with “Inactive — historical value” on existing records, excluded from new choices unless a governed restore is performed;
- concurrent settings change: selector refreshes and asks the user to choose again only when the old selection became invalid;
- long datasets: searchable combobox/entity picker with incremental loading, exact identifier support, clear selection, and keyboard navigation;
- small stable sets: visible radio group for mutually exclusive decision or checkboxes for independent choices; the values still load dynamically.

### 15.2 Management experience

SCREEN-OPS-030 is the catalogue; SCREEN-OPS-031 manages lookup/system/external sources and links entity-owned data to its proper screen. Every type shows purpose, owner, scope, classification, source of truth, editable attributes, lock reason, value counts, active/inactive use, last change/sync, consuming screens, and audit history.

Add/edit includes unique stable code, localized labels, descriptions where needed, scope, order, default, active/effective state, and permitted constrained attributes. Save validates duplicates and concurrent version. Deactivate shows usage and future effect. Delete exists only for never-used erroneous drafts. Restore revalidates code, scope, conflicts, and translations. System-fixed values show meaning and locked lifecycle/security/integration rationale. External values show source, last success, error, and safe refresh. Entity-owned selectors link to their owning management area.

## 16. UI-Control Selection Decisions for Critical Actions

| Decision ID | Task | Selected control/pattern | Why this is the simplest safe choice | Rejected default |
| --- | --- | --- | --- | --- |
| UI-DEC-001 | Same/different return location | Two visible radios, then conditional location combobox | Small exclusive decision changes form; consequence stays visible | Switch would imply immediate setting and unclear off meaning |
| UI-DEC-002 | Rental location/customer/vehicle search | Searchable combobox or entity picker | Dataset is large/dynamic and identity must be explicit | Static dropdown would be long/stale |
| UI-DEC-003 | Dates/times | Paired date/time controls constrained by location hours/time zone | Prevents invalid order while supporting keyboard/native entry | Free text alone is error-prone; calendar alone is inaccessible/slow |
| UI-DEC-004 | Vehicle comparison | Scannable cards plus filters; detail page | Supports visual/spec/price comparison without dense rows | Carousel hides alternatives; table is poor on mobile |
| UI-DEC-005 | Independent extras | Checkbox; quantity stepper only after selection | Choice is submitted with checkout; quantity is explicit | Switch falsely suggests immediate persistent setting |
| UI-DEC-006 | Protection plan | Visible radio cards including decline when optional | Small exclusive, high-consequence set should remain visible | Dropdown hides terms/decline |
| UI-DEC-007 | Checkout progress | Short step/task indicator with safe back links | Shows position and recoverable sections | Tab bar suggests arbitrary order and skips validation |
| UI-DEC-008 | Price/deposit | Persistent summary plus expandable details | Total always visible; detail available without navigation | Tooltip cannot hold material financial information |
| UI-DEC-009 | Final booking/payment | One action-specific button on review screen | Prevents ambiguous double actions and supplies error-prevention review | Separate Pay and Book could create partial intent |
| UI-DEC-010 | Cancellation | Dedicated review page | Consequences/refund/policy need space and mobile accessibility | Small generic modal is insufficient |
| UI-DEC-011 | Staff record navigation | Scoped table/adaptive cards with labelled row link | High-frequency scanning and preserved filters | Whole row with hidden multiple actions is ambiguous |
| UI-DEC-012 | Status change | Valid-state menu followed by impact review | Dynamic lifecycle options and consequence validation | Editable free-text status or unrestricted dropdown is unsafe |
| UI-DEC-013 | Pickup/return | Guided checklist workspace | Required steps, evidence, blockers, and resume need explicit state | Long undifferentiated form invites missed checks |
| UI-DEC-014 | Override/refund/access approval | Drawer for review when context is short; full page for multi-step case | Keeps source visible without nested dialogs | Instant icon action lacks consequence/evidence |
| UI-DEC-015 | Reason with few options | Visible radios; select when moderate; searchable combobox when large | Option count and need to compare determine control | Universal dropdown is slower and hides choices |
| UI-DEC-016 | Reference ordering | Move up/down and position field | Keyboard/touch accessible and precise | Drag-only ordering excludes users |
| UI-DEC-017 | Destructive actions | Action-specific consequence dialog or review page; no toast undo for money/custody | Confident prevention and recorded reversal path | Tiny undo window is unreliable for high stakes |
| UI-DEC-018 | Report metrics | Table as source; chart only when relation is clearer | Exact values and accessibility retained | Decorative dashboard charts add density |

### 16.1 Minimum-necessary-step review

| Flow | User decisions/actions after valid entry | Removed friction | Steps retained for safety/clarity |
| --- | ---: | --- | --- |
| FLOW-CUS-001 booking | Search; choose; renter/drivers; extras/protection; review/pay | Sign-in returns to task; same-location default; saved profile prefill; one final commit; price always visible | Eligibility data, explicit optional choices, complete financial/terms review |
| FLOW-CUS-004 modification | Choose change; edit; check/compare; confirm | One proposal workspace; original fixed; no separate “save” per section | Reavailability/reprice and old/new consent |
| FLOW-CUS-005 cancellation | Open review; optional/required reason; confirm | No multi-page wizard; no redundant second dialog | Refund/consequence review and action-specific commit |
| FLOW-CUS-006 extension | Propose; check; confirm/request | Current rental/due prefilled; approval happens asynchronously | Availability/payment/changed terms and original-obligation notice |
| FLOW-OPS-003 pickup | Verify checklist; inspection; agreement; open | Known booking/unit/customer prefilled; focused corrections return to checklist | Non-waivable verification, starting condition, payment/deposit, consent |
| FLOW-OPS-006 return | Receive; inspect; adjustments; review; close | Agreement/start facts prefilled; one close action coordinates outcomes | Custody, condition evidence, financial review, correct vehicle state |
| FLOW-OPS-014 lookup edit | Open type; edit; save | Catalogue links back to origin; no separate CRUD per consumer screen | Usage impact, stable code, translation, historical rule |

## 17. Design Coverage Matrix

“All customer” means APP-CWEB and APP-CMOB. Every row maps a requirement to implementable design objects and its meaningful success/failure state. Coverage is “Complete” only because the listed screen/component/element/flow contracts define both normal and recovery behavior against the accepted baseline.

| FR ID | Application | Screen(s) | Component(s) | Element(s) | Flow(s) | State(s) | Coverage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FR-GBL-001 | All | All record/detail screens | COMP-SH-003/015/020, COMP-OPS-002 | EL-SH-007/008, EL-OPS-C02-02/04 | All cross-app flows | Fresh, Stale, Conflict, Accepted | Complete |
| FR-GBL-002 | All | CUS-001/012; OPS-033/034 | COMP-SH-002 | EL-SH-001, EL-COMP-002-01/02 | CUS-002, OPS-016 | Selected, Fallback, Missing, Published | Complete |
| FR-GBL-003 | All | CUS-001–006/015/020–023; OPS-025–029/034/036 | COMP-SH-007/008 | EL-COMP-007-01–05, EL-COMP-008-01–03 | CUS-001/004/006; OPS-013/017 | Locale-valid, Ambiguous-time, Mixed-direction | Complete |
| FR-GBL-004 | All | OPS-030/031 and every dynamic form | COMP-SH-006/009 | EL-OPS-030-01–04, EL-OPS-031-01–06 | OPS-014 | Loading, Active, Inactive-history, Read-only, Sync-failed | Complete |
| FR-GBL-005 | All | CUS-007/015/019/020; OPS-003/005/010/014/023 | COMP-SH-003/015/018 | EL-COMP-003-01, EL-SH-008, EL-COMP-018-01–04 | All record flows | Current, Pending, Failed, Terminal, Next-action | Complete |
| FR-GBL-006 | All | CUS-006/016/017; OPS-008/011/023/024/039 | COMP-SH-020 | EL-SH-007, EL-CUS-006-05/06, EL-OPS-024-02–04 | CUS-001/004/005; OPS-003/006/012/018 | Duplicate-returned, Stale, Unknown, Conflict | Complete |
| FR-GBL-007 | All | All | COMP-SH-001/005/010–014/016/017 | All documented elements | All | Focus, Keyboard, Touch, Zoom, Announced-status | Complete |
| FR-GBL-008 | APP-OPS; customer subset | OPS-038 and all workspaces; CUS-015/019 | COMP-SH-015, COMP-OPS-002 | EL-SH-008, EL-OPS-038-01–05 | OPS-011–019 | Recorded, Masked, Exported, Corrected-by-append | Complete |
| FR-IAM-001 | All customer | CUS-009; origin checkout | COMP-SH-005/014 | EL-CUS-009-01–03 | CUS-002 | Draft, Duplicate, Pending-verification, Active | Complete |
| FR-IAM-002 | All | CUS-009/012/018; OPS-022 | COMP-SH-018 | EL-CUS-009-04–06, EL-CUS-018-04/05, EL-OPS-022-02 | CUS-002/003/010 | Sent, Verified, Incorrect, Expired, Delivery-failed | Complete |
| FR-IAM-003 | All | CUS-008; OPS-001 | COMP-SH-001/020 | EL-CUS-008-01–04, EL-OPS-001-01–03, EL-SH-002 | CUS-002, OPS-015 | Active-session, Failed, Locked, Suspended, Signed-out | Complete |
| FR-IAM-004 | All | CUS-010; OPS-001/022 | COMP-SH-005/020 | EL-CUS-010-01–05, EL-OPS-001-04/022-02 | CUS-002, OPS-015 | Requested, Verified, Expired, Changed, Review | Complete |
| FR-IAM-005 | All | CUS-008; OPS-001/039 | COMP-SH-020 | EL-CUS-008-04, EL-OPS-001-02/039-01 | CUS-002, OPS-018 | Provider-pending, Cancelled, Linked, Conflict, Unavailable | Complete |
| FR-IAM-006 | All | CUS-011/012; OPS-022 | COMP-SH-014 | EL-CUS-012-01–05, EL-OPS-022-01 | CUS-010 | View, Edit, Verification-pending, Conflict, Saved | Complete |
| FR-IAM-007 | All | CUS-004/013; OPS-008/022 | COMP-CUS-004, COMP-SH-016 | EL-CUS-004-02–06, EL-CUS-013-01–05, EL-OPS-008-01/02 | CUS-001/010, OPS-003 | Eligible, Needs-review, Expired, Ineligible, Verified | Complete |
| FR-IAM-008 | All | CUS-024; OPS-022 | COMP-SH-018 | EL-CUS-024-01–05, EL-OPS-022-06 | CUS-010, OPS-011 | Draft, Verified, Blocked, In-review, Completed, Cancelled | Complete |
| FR-CAT-001 | All customer; OPS content | CUS-001/002; OPS-015 | COMP-CUS-002 | EL-CUS-002-04/05, EL-OPS-015-03–05 | CUS-001, OPS-013 | Active, Empty, Unavailable, Deactivated | Complete |
| FR-CAT-002 | All customer | CUS-001/002 | COMP-CUS-001/002, COMP-SH-010 | EL-CUS-001-01, EL-CUS-002-01–06 | CUS-001 | Loading, Results, No-results, Filtered, Error | Complete |
| FR-CAT-003 | All | CUS-003; OPS-015 | COMP-CUS-002/003 | EL-CUS-003-01–05, EL-OPS-015-04 | CUS-001 | Fresh, Representative, Exact, Missing-media, Withdrawn | Complete |
| FR-CAT-004 | All | CUS-001/003/023; OPS-028 | COMP-SH-006/007 | EL-COMP-007-01–05, EL-OPS-028-01–05 | CUS-001/009, OPS-013 | Open, Closed, Exceptional-hours, Archived | Complete |
| FR-CAT-005 | All | CUS-002/006/016/021; OPS-007/019 | COMP-SH-020 | EL-CUS-002-05, EL-CUS-006-05, EL-CUS-016-02/04, EL-OPS-019-01–04 | CUS-001/004/006, OPS-002/005/008/009 | Available, Held, Unavailable, Stale, Conflict | Complete |
| FR-CAT-006 | All customer/assisted | CUS-004–006; OPS-006 | COMP-CUS-003, COMP-SH-012 | EL-CUS-004-06, EL-CUS-006-05 | CUS-001, OPS-001 | Hold-active, Warning, Expired, Converted, Released | Complete |
| FR-CAT-007 | All customer/assisted | CUS-002/016; OPS-006/007 | COMP-CUS-002 | EL-CUS-002-06, EL-CUS-016-03 | CUS-001/004, OPS-002 | No-match, Alternatives, Difference-disclosed, None-valid | Complete |
| FR-PRC-001 | APP-OPS; consumed all | OPS-025 | COMP-OPS-006 | EL-OPS-025-01–05 | OPS-013 | Draft, Conflict, Scheduled, Active, Paused, Superseded | Complete |
| FR-PRC-002 | All | CUS-002/003/006/016; OPS-006/025 | COMP-SH-008, COMP-CUS-003 | EL-COMP-008-01–03, EL-OPS-025-03 | CUS-001/004, OPS-001/013 | Estimated, Fresh, Expired, Changed, Unavailable | Complete |
| FR-PRC-003 | All | CUS-006/017/019; OPS-026/029 | COMP-SH-008 | EL-CUS-017-01/02, EL-OPS-026-01–05 | CUS-001/005, OPS-004/013 | Applied, Missing-config, Override-pending, Historical | Complete |
| FR-PRC-004 | All | CUS-001/006; OPS-026 | COMP-SH-008 | EL-OPS-026-01–05 | CUS-001/004, OPS-013 | Valid, Invalid, Expired, Exhausted, Removed | Complete |
| FR-PRC-005 | All | CUS-005/015; OPS-027 | COMP-CUS-005 | EL-CUS-005-01–03, EL-OPS-027-01–05 | CUS-001/004, OPS-013 | Available, Reserved, Out-of-stock, Removed-with-consent, Historical | Complete |
| FR-PRC-006 | All | CUS-005/006/015; OPS-027 | COMP-CUS-005 | EL-CUS-005-03/04, EL-OPS-027-01–05 | CUS-001, OPS-013 | Applicable, Accepted, Declined, Ineligible, Versioned | Complete |
| FR-PRC-007 | All | CUS-002/006/019; OPS-023/025/026/036 | COMP-SH-008 | EL-COMP-008-01/02, EL-OPS-C07-03/04 | CUS-001/004, OPS-012/017 | Transaction-currency, Informational-conversion, Unsupported, Reconciled | Complete |
| FR-BKG-001 | All customer/assisted | CUS-004–006/008–010; OPS-006 | COMP-SH-012/014 | EL-CUS-004-01/06, EL-SH-004 | CUS-001/002, OPS-001 | Draft, Resumable, Hold-expired, Abandoned, Restored | Complete |
| FR-BKG-002 | All | CUS-004; OPS-006/008/029 | COMP-CUS-004, COMP-OPS-004 | EL-CUS-004-06, EL-OPS-008-01/02, EL-OPS-029-03 | CUS-001, OPS-001/003 | Eligible, Review, Ineligible, Correctable, Non-waivable | Complete |
| FR-BKG-003 | All | CUS-004; OPS-006/008 | COMP-CUS-004 | EL-CUS-004-02–05, EL-OPS-008-01 | CUS-001, OPS-001/003 | Owner, Renter, Payer, Additional-driver-pending | Complete |
| FR-BKG-004 | All | CUS-002/006; OPS-006/007 | COMP-SH-020 | EL-CUS-002-05, EL-CUS-006-05, EL-OPS-007-02 | CUS-001, OPS-001/002 | Hold, Reserved-capacity, Lost-availability, Recovery-case | Complete |
| FR-BKG-005 | All | CUS-005/006; OPS-006/008 | COMP-SH-012, COMP-CUS-005 | EL-CUS-006-03/04, EL-OPS-006-03/008-04 | CUS-001, OPS-001/003 | Reviewed, Accepted-version, Declined, Changed-reaccept | Complete |
| FR-BKG-006 | All | CUS-006/007; OPS-005/006 | COMP-CUS-006, COMP-SH-020 | EL-CUS-006-05/06, EL-OPS-006-05 | CUS-001, OPS-001/018 | Confirming, Confirmed, Failed-no-booking, Partial-owned | Complete |
| FR-BKG-007 | All | CUS-006/007; OPS-006 | COMP-SH-020 | EL-CUS-006-05/06, EL-OPS-006-05 | CUS-001, OPS-001 | First-submit, Duplicate-returned, Possible-duplicate-review | Complete |
| FR-BKG-008 | All | CUS-007/015; OPS-005/033 | COMP-CUS-007, COMP-SH-018 | EL-CUS-007-01–05, EL-OPS-005-06 | CUS-001, OPS-016 | Confirmed, Message-queued/delivered/failed, Resent | Complete |
| FR-BKG-009 | All customer/OPS support | CUS-018/015/009; OPS-022 | COMP-SH-005 | EL-CUS-018-01–05, EL-CUS-007-04 | CUS-003 | Challenge, Scoped-access, Expired, Linked, Conflict | Complete |
| FR-BKG-010 | APP-OPS | OPS-006/005 | COMP-SH-012, COMP-OPS-005 | EL-OPS-006-01–06 | OPS-001 | Draft, Pending-owned, Confirmed, Cancelled/Expired | Complete |
| FR-PAY-001 | All | CUS-006; OPS-006/008/023 | COMP-CUS-006 | EL-CUS-006-02, EL-CUS-C06-01–03 | CUS-001, OPS-001/003 | Eligible-methods, No-method, Selected, Unsupported-hold | Complete |
| FR-PAY-002 | All | CUS-006/007; OPS-006/023 | COMP-CUS-006, COMP-SH-020 | EL-CUS-006-05/06, EL-OPS-023-05 | CUS-001, OPS-001/012 | Action-required, Authorized, Captured, Failed, Unknown | Complete |
| FR-PAY-003 | All | CUS-006/019; OPS-008/011/023 | COMP-SH-008, COMP-CUS-006 | EL-COMP-008-02, EL-OPS-011-05 | CUS-001, OPS-003/006 | Required, Authorized, Failed, Adjusted, Released, Captured | Complete |
| FR-PAY-004 | All | CUS-006/019; OPS-024/039 | COMP-SH-020 | EL-CUS-006-06, EL-CUS-019-03, EL-OPS-024-02/04 | CUS-001, OPS-012/018 | Declined, Cancelled, Unknown, Reconciled, Safe-retry | Complete |
| FR-PAY-005 | All | CUS-007/019; OPS-023 | COMP-CUS-007 | EL-CUS-019-01/02, EL-OPS-023-01/06 | CUS-001/005, OPS-006/012 | Receipt-ready/pending/failed-copy, Balanced | Complete |
| FR-PAY-006 | All | CUS-017/019; OPS-023/024 | COMP-SH-008/018 | EL-CUS-017-02/04, EL-OPS-023-02 | CUS-005, OPS-012 | Refund-not-due, Requested, Processing, Succeeded, Failed-review | Complete |
| FR-PAY-007 | All | CUS-016/019; OPS-011/023 | COMP-SH-008/016 | EL-OPS-011-03/04, EL-OPS-023-03 | CUS-004/006, OPS-006/019 | Draft-adjustment, Approved, Charged, Credited, Disputed, Reversed | Complete |
| FR-PAY-008 | All | CUS-019; OPS-023/024 | COMP-OPS-005, COMP-SH-016 | EL-CUS-019-04, EL-OPS-023-02–04 | OPS-012/019 | Eligible, Approval, Processing, Won/Lost, Refunded/Reversed | Complete |
| FR-PAY-009 | APP-OPS; customer status | OPS-024/023/038; CUS-019 | COMP-SH-018/020 | EL-OPS-024-01–05 | OPS-012/018 | Open, Investigating, Linked, Compensated, Explained, Escalated | Complete |
| FR-RSV-001 | All | CUS-014/015; OPS-004/005 | COMP-CUS-007, COMP-OPS-002 | EL-CUS-014-01–03, EL-OPS-004-03 | CUS-003–005, OPS-004 | Upcoming, Active-linked, Completed, Cancelled, Missing/denied | Complete |
| FR-RSV-002 | All | CUS-016/015; OPS-005 | COMP-CUS-001/003, COMP-SH-008 | EL-CUS-016-01–05, EL-OPS-005-01 | CUS-004 | Proposal, Compared, Modified, Original-unchanged, Conflict | Complete |
| FR-RSV-003 | All | CUS-017/015/019; OPS-005/023 | COMP-SH-008/013 | EL-CUS-017-01–04, EL-OPS-005-02 | CUS-005 | Review, Cancelled, Already-cancelled, Refund-pending/failed | Complete |
| FR-RSV-004 | All | CUS-015; OPS-007/005 | COMP-OPS-003 | EL-CUS-015-04, EL-OPS-005-04, EL-OPS-007-04 | OPS-004 | On-time, Delay-reported, Grace, No-show, Corrected | Complete |
| FR-RSV-005 | All | CUS-015/011; OPS-003/005/006 | COMP-SH-018 | EL-CUS-015-03, EL-OPS-006-06 | CUS-001, OPS-001 | Pending-known-item, Deadline, Expired, Completed-after-recheck | Complete |
| FR-RSV-006 | APP-OPS | OPS-005/006/010/025–029 | COMP-SH-019, COMP-OPS-005 | EL-OPS-006-04, EL-COMP-019-01–03, EL-OPS-C05-01–04 | OPS-001/002/005/013 | Requested, Approved, Rejected, Non-overridable, Revoked-linked | Complete |
| FR-RSV-007 | All | CUS-015; OPS-005/010/038 | COMP-SH-015 | EL-SH-008, EL-COMP-015-01/02 | CUS-004/005, OPS-003/004/006 | Chronological, Customer-masked, Staff-detail, Corrected-by-event | Complete |
| FR-RNT-001 | All | OPS-002/003/007; CUS-015 | COMP-OPS-003/004 | EL-OPS-007-01–05 | OPS-002 | Ready, Blocked, Unassigned, Delayed, Escalated | Complete |
| FR-RNT-002 | APP-OPS; customer acknowledgement | OPS-007/005/014; CUS-015 | COMP-SH-009, COMP-OPS-005 | EL-OPS-007-02, EL-OPS-005-03 | OPS-002/007 | Candidate, Assigned, Conflict, Substitution-review, Recovery | Complete |
| FR-RNT-003 | APP-OPS; customer instructions | OPS-008/022; CUS-015 | COMP-OPS-004, COMP-CUS-004 | EL-OPS-008-01/02 | OPS-003 | Verified, Failed, Needs-review, Waived-permitted, Non-waivable | Complete |
| FR-RNT-004 | All | OPS-008/018; CUS-020 | COMP-OPS-004, COMP-SH-016 | EL-OPS-008-03–05, EL-OPS-018-01–05 | OPS-003 | Opening-pending, Condition-disputed, Accepted, Active, Aborted | Complete |
| FR-RNT-005 | All | CUS-020; OPS-009/010 | COMP-CUS-007, COMP-OPS-002 | EL-CUS-020-01–05, EL-OPS-009-02 | CUS-006–009, OPS-005–007 | Active, Extended, Incident, Overdue, Completed-read-only | Complete |
| FR-RNT-006 | All | CUS-021; OPS-010/003 | COMP-SH-007/008/018 | EL-CUS-021-01–04, EL-OPS-010-01/02 | CUS-006, OPS-005 | Proposal, Self-service-ready, Pending, Approved, Rejected, Unknown | Complete |
| FR-RNT-007 | All | CUS-020/023; OPS-009/010 | COMP-SH-003/018 | EL-CUS-023-02, EL-OPS-009-01/03/05 | CUS-006/009, OPS-004–006 | Due, Grace, Late, Overdue, Early-return, Return-started | Complete |
| FR-RNT-008 | All | CUS-022; OPS-012/039 | COMP-SH-016/018 | EL-CUS-022-01–06, EL-OPS-012-02–06 | CUS-007, OPS-018 | Draft-unsent, Submitted, Provider-pending/failed, Dispatched, Resolved | Complete |
| FR-RNT-009 | All | CUS-022; OPS-012/010/018 | COMP-SH-016, COMP-OPS-004 | EL-CUS-022-01–05, EL-OPS-012-01–06 | CUS-008, OPS-007 | Reported, Triaged, Unit-blocked, Review, Resolved | Complete |
| FR-RNT-010 | APP-OPS; customer acknowledgement | OPS-010/012/007/018; CUS-020 | COMP-SH-009, COMP-OPS-005 | EL-OPS-010-04, EL-OPS-012-05 | OPS-007 | Replacement-in-progress, Accepted, No-unit, Active-replaced, Terminated-review | Complete |
| FR-RNT-011 | All | CUS-023; OPS-011/018 | COMP-OPS-004 | EL-CUS-023-03/04, EL-OPS-011-01/02 | CUS-009, OPS-006 | Active, Return-started, Received, Pending-inspection | Complete |
| FR-RNT-012 | APP-OPS; customer result | OPS-018/011; CUS-019 | COMP-SH-016, COMP-OPS-004 | EL-OPS-018-01–06 | OPS-006/008 | In-progress, Passed, Failed, Needs-review, Superseded | Complete |
| FR-RNT-013 | APP-OPS; customer statement | OPS-011/023; CUS-019 | COMP-SH-008/016 | EL-OPS-011-03/04, EL-CUS-019-01/04 | OPS-006/019 | Draft, Evidence-needed, Approved, Disputed, Interim/final | Complete |
| FR-RNT-014 | All | CUS-023; OPS-011/003 | COMP-SH-016/018 | EL-CUS-023-03–05, EL-OPS-011-01 | CUS-009, OPS-006 | Eligible, Ineligible, Submitted, Unacknowledged, Pending-inspection | Complete |
| FR-RNT-015 | All | OPS-011/023/024; CUS-019 | COMP-SH-008/018/020 | EL-OPS-011-05/06, EL-OPS-024-01–05 | OPS-006/012 | Returned, Financial-review, Completed, Provider-failed, Corrected | Complete |
| FR-RNT-016 | All | OPS-010/012/023; CUS-019 | COMP-SH-016/018 | EL-OPS-010-06, EL-OPS-012-01–06, EL-CUS-019-04 | OPS-019 | Unmatched, Matched, Review, Charged/Disputed/Reversed, Property-closed | Complete |
| FR-FLT-001 | APP-OPS | OPS-013/014 | COMP-SH-009/011 | EL-OPS-013-01/02, EL-OPS-014-01/06 | OPS-008/010 | Draft, Duplicate-blocked, Active, Retired, Archived-error | Complete |
| FR-FLT-002 | APP-OPS; customer output | OPS-015; CUS-002/003 | COMP-CUS-002, COMP-OPS-006 | EL-OPS-015-01–05, EL-CUS-003-03 | CUS-001, OPS-013/016 | Draft, Preview, Active, Deactivated-history | Complete |
| FR-FLT-003 | APP-OPS; all availability | OPS-014/013/007; CUS-002 | COMP-SH-003, COMP-OPS-002 | EL-OPS-014-02, EL-OPS-013-03 | OPS-002/003/006–009 | Available, Assigned, Ready, On-rent, Inspection, Work, Retired, Invalid-transition | Complete |
| FR-FLT-004 | APP-OPS | OPS-016/014/007 | COMP-SH-009/018 | EL-OPS-016-01–04 | OPS-009 | Scheduled, Transfer, Arrived, Delayed, Cancelled/rerouted | Complete |
| FR-FLT-005 | APP-OPS | OPS-017/014/007 | COMP-OPS-004, COMP-SH-016 | EL-OPS-017-01–06 | OPS-008 | Scheduled, In-progress, Overdue, Completed-pass/fail, Reopened | Complete |
| FR-FLT-006 | APP-OPS | OPS-018/008/011/014 | COMP-OPS-004, COMP-SH-016 | EL-OPS-018-01–06 | OPS-002/003/006/008 | Due, Draft, Submitted, Passed, Failed, Needs-review, Superseded | Complete |
| FR-FLT-007 | APP-OPS; availability output all | OPS-019/014/007 | COMP-OPS-005, COMP-SH-018 | EL-OPS-019-01–05 | OPS-002/008 | Draft, Impact, Approval, Active-block, Released, Expired | Complete |
| FR-FLT-008 | APP-OPS | OPS-020/013 | COMP-SH-016/017 | EL-OPS-020-01–06 | OPS-010 | Uploaded, Validated, Partial, Completed, Failed-rows, Cancelled | Complete |
| FR-FLT-009 | APP-OPS | OPS-014/017/003 | COMP-SH-016/018 | EL-OPS-014-05, EL-OPS-017-01/05 | OPS-008 | Missing, Expiring, Active, Expired-block, Renewed | Complete |
| FR-ADM-001 | APP-OPS | OPS-021/022 | COMP-SH-009/011 | EL-OPS-021-01–04, EL-OPS-022-01/04/05 | OPS-001/011 | No-match, Masked-results, Selected, Duplicate-review, Merged | Complete |
| FR-ADM-002 | APP-OPS; customer explanation | OPS-022/038; CUS-004/015 | COMP-OPS-005, COMP-SH-018 | EL-OPS-022-03 | OPS-011 | Draft-review, Approval, Active-scope, Expired, Removed/corrected | Complete |
| FR-ADM-003 | APP-OPS | OPS-004/005/010 | COMP-SH-010/011 | EL-OPS-004-01–05 | OPS-001/003/006 | Searching, Results, No-results, Permission-masked, Preserved-return | Complete |
| FR-ADM-004 | APP-OPS | OPS-002/003 and all workspaces | COMP-OPS-003, COMP-SH-018 | EL-OPS-003-01–04, EL-OPS-C03-01–05 | All OPS flows | Open, Assigned, Waiting, Snoozed, Escalated, Resolved/Reopened | Complete |
| FR-ADM-005 | APP-OPS; customer output | OPS-025/026/029 | COMP-OPS-006 | EL-OPS-025-01–05, EL-OPS-026-01–05 | OPS-013 | Draft, Conflict, Approval, Scheduled, Active, Paused, Historical | Complete |
| FR-ADM-006 | APP-OPS; customer output | OPS-027/034; CUS-005 | COMP-OPS-006, COMP-CUS-005 | EL-OPS-027-01–05 | OPS-013/016 | Draft, Preview, Active, Unavailable-impact, Deactivated-history | Complete |
| FR-ADM-007 | APP-OPS; all location use | OPS-028; CUS-001/023 | COMP-SH-006/007, COMP-OPS-006 | EL-OPS-028-01–05 | CUS-001/009, OPS-009/013 | Draft, Open, Closure-impact, Active, Archived | Complete |
| FR-ADM-008 | APP-OPS; all selectors | OPS-030/031 | COMP-SH-006/009 | EL-OPS-030-01–04, EL-OPS-031-01–06 | OPS-014 | Configurable, Constrained, Fixed, External, Entity-owned, Inactive-history | Complete |
| FR-ADM-009 | APP-OPS | OPS-032/001/038 | COMP-SH-019, COMP-OPS-005 | EL-OPS-032-01–06 | OPS-015 | Invited, Active, Approval, Suspended, Deactivated, Work-reassignment | Complete |
| FR-ADM-010 | APP-OPS; all governed flows | OPS-029/038 | COMP-OPS-006 | EL-OPS-029-01–05 | OPS-013 | Draft, Inherited/overridden, Conflict/gap, Active, Paused, Versioned | Complete |
| FR-ADM-011 | APP-OPS; messages all | OPS-033/039 | COMP-OPS-006 | EL-OPS-033-01–06 | OPS-016/018 | Draft, Tested, In-review, Published, Delivery-failed, Paused | Complete |
| FR-ADM-012 | APP-OPS; localized output all | OPS-034/015/027/028/033 | COMP-SH-002, COMP-OPS-006 | EL-OPS-034-01–05 | OPS-016 | Missing, Draft, In-review, Published, Outdated, Fallback-exception | Complete |
| FR-RPT-001 | APP-OPS | OPS-002/003 | COMP-OPS-003, COMP-SH-020 | EL-OPS-002-01–04 | OPS-002/004–006/008/018 | Fresh, Partial, Stale, Unknown-not-zero, Drilled | Complete |
| FR-RPT-002 | APP-OPS | OPS-035/036/023 | COMP-OPS-007 | EL-OPS-035-01, EL-OPS-036-01–05 | OPS-017 | Defined-date/currency, Complete, Partial, Reconciled | Complete |
| FR-RPT-003 | APP-OPS | OPS-035/036/014/017 | COMP-OPS-007 | EL-OPS-036-01/02 | OPS-017 | Defined-denominator, Complete, Data-gap, Drilled | Complete |
| FR-RPT-004 | APP-OPS | OPS-035/036/024 | COMP-OPS-007 | EL-OPS-036-01–03 | OPS-017 | Defined-metric, Filtered, Complete, Incomplete-event | Complete |
| FR-RPT-005 | APP-OPS | OPS-036/037 | COMP-SH-017, COMP-OPS-007 | EL-OPS-036-04/05, EL-OPS-037-01–05 | OPS-017 | Queued, Running, Complete, Failed, Expired, Scheduled, Paused | Complete |
| FR-RPT-006 | APP-OPS | OPS-038/036 | COMP-SH-011/018 | EL-OPS-038-01–05 | OPS-011–018 | Open-finding, Assigned, Resolved, False-positive, Reopened | Complete |
| FR-INT-001 | All; APP-OPS management | CUS-006/019; OPS-023/024/039 | COMP-CUS-006, COMP-SH-020 | EL-CUS-006-06, EL-OPS-024-02–04, EL-OPS-039-01–04 | CUS-001, OPS-012/018 | Sent, Delayed, Repeated-deduped, Contradictory, Reconciled | Complete |
| FR-INT-002 | All | CUS-007/015; OPS-005/033/039 | COMP-SH-018, COMP-OPS-006 | EL-OPS-005-06, EL-OPS-033-01–06 | CUS-005/007–009, OPS-016/018 | Queued, Sent, Delivered, Failed, Suppressed, Retried | Complete |
| FR-INT-003 | All where enabled | CUS-001/007/023; OPS-028/039 | COMP-SH-006 | EL-CUS-001-02, EL-CUS-007-03, EL-CUS-023-01, EL-OPS-039-01 | CUS-001/009, OPS-018 | Suggested-unconfirmed, Confirmed, Failed-fallback, Disabled | Complete |
| FR-INT-004 | APP-OPS; customer status | OPS-003/024/039; CUS-007/015/019 | COMP-SH-018/020 | EL-OPS-024-01–05, EL-OPS-039-03–06 | CUS-001/004–006, OPS-012/018 | Open, Owned, Waiting, Reconciled, Compensated, Escalated | Complete |
| FR-INT-005 | All where configured | CUS-008/022; OPS-012/039 | COMP-SH-018/020 | EL-CUS-022-05/06, EL-OPS-012-04, EL-OPS-039-01–06 | CUS-007/008, OPS-018 | Enabled, Pending, Provider-failed, Manual-fallback, Paused | Complete |

Coverage result: 104 of 104 FR IDs have explicit application, screen, component, element, flow, state, and behavioral coverage in this document. This is complete traceability against the accepted v1.0 baseline, not a guarantee that unknown future business needs do not exist.

## 18. Flow Coverage Matrix

| FLOW ID | Type | FR IDs | Start | Success End | Alternate/Failure End | Recovery/Next Action | Closed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FLOW-CUS-001 | Primary | CAT-001–007, PRC-002–007, BKG-001–008, PAY-001–004 | CUS-001 | CUS-007 confirmed | No results, eligibility correction, payment failure/unknown, hold expiry | Alternatives, retry/check status, refresh quote, support-owned partial case | Yes |
| FLOW-CUS-002 | Alternate | IAM-001–005, BKG-001 | Origin task | Origin restored authenticated | Duplicate account, provider cancel/fail, verification pending/expired | Sign in, recover, resend/change channel, return as guest if allowed | Yes |
| FLOW-CUS-003 | Alternate | BKG-009, IAM-002 | CUS-018 | CUS-015 scoped access/linked | Neutral no-match, expired challenge, account conflict | Retry/resend, support, verified linking | Yes |
| FLOW-CUS-004 | Primary | RSV-001/002, CAT-005–007, PRC-002, PAY-007 | CUS-015/OPS-005 | Updated detail | Original unchanged, unavailable, payment unknown, stale conflict | Edit proposal, choose alternative, check status, refresh/keep original | Yes |
| FLOW-CUS-005 | Primary | RSV-003, PAY-006, INT-002/004 | Detail | Cancelled detail/refund status | Keep booking, already cancelled, refund/message failure | Track refund, finance case, support, new booking | Yes |
| FLOW-CUS-006 | Primary | RNT-005–007, CAT-005, PAY-007 | CUS-020 | Active-extended/new due | Pending/rejected/unavailable/payment unknown | Try valid proposal, wait for owner, return under original due, reconcile | Yes |
| FLOW-CUS-007 | Exception/recovery | RNT-008, INT-005 | CUS-020 | Owned resolved assistance case | Provider/offline/identity failure | Call/manual fallback, wait/provide info, escalation | Yes |
| FLOW-CUS-008 | Exception/recovery | RNT-009/010, FLT-003/006 | CUS-020 | Incident triaged/resolved | Incomplete, duplicate, offline, provider/replacement unavailable | Add facts, link case, call/manual route, replacement/termination | Yes |
| FLOW-CUS-009 | Primary/alternate | RNT-007/011/014 | CUS-023 | Return submitted/received pending inspection | Ineligible after-hours, mapping/offline failure | Staffed return, written directions, contact location, resubmit online | Yes |
| FLOW-CUS-010 | Administrative/support | IAM-006–008 | CUS-011 | Saved/verified or request created | Validation/conflict, document fail, active-obligation blocker | Correct/verify/retry, complete blocker, track request | Yes |
| FLOW-OPS-001 | Administrative/support | BKG-010 plus booking/payment set | OPS-006 | OPS-005 confirmed | Duplicate customer, caller interruption, payment unknown, pending prerequisite | Resolve identity, owned draft, reconcile, complete/cancel | Yes |
| FLOW-OPS-002 | Cross-application | RNT-001/002, FLT-003/006 | OPS-007 | Pickup-ready assigned | No unit, blocker, unit unavailable/concurrent | Resolve, reassign, alternative/customer recovery, escalate | Yes |
| FLOW-OPS-003 | Primary | RNT-003–005, PAY-003 | OPS-008 | OPS-010 Active/CUS-020 | Failed non-waivable check, payment unknown, disputed condition, abort | Correct/alternative/reconcile/inspect or reservation recovery | Yes |
| FLOW-OPS-004 | Administrative/support | RSV-004, PRC-003 | OPS-007/005 | Delayed-confirmed, pickup, or No-show | Customer arrives, no unit after release, policy/permission conflict | Start pickup, new quote/recovery, approval, audited correction | Yes |
| FLOW-OPS-005 | Cross-application | RNT-006/007, CAT-005, PAY-007 | OPS-010/003 | Amended Active rental | Rejected/original due, payment unknown, downstream conflict | Alternative, reconcile, return by original due, escalate | Yes |
| FLOW-OPS-006 | Primary | RNT-011–016, PAY-003/007 | OPS-011 | Completed rental and correct vehicle state | Inspection/charge dispute, finance/hold failure, pending review | Case/approval/reconcile; unit readiness work independent | Yes |
| FLOW-OPS-007 | Exception/recovery | RNT-009/010, FLT-003 | OPS-012/010 | Active with replacement | No unit, customer decline, payment/custody failure | Other location/time, service recovery, termination, reconcile | Yes |
| FLOW-OPS-008 | Administrative/support | FLT-003/005–007/009 | OPS-014/017/019 | Available after readiness or explicit unavailable | Safety/document blocker, affected reservations, failed inspection | Reassign demand, complete work/document, further work/retire | Yes |
| FLOW-OPS-009 | Administrative/support | FLT-004, CAT-005 | OPS-016 | Arrived and correct destination state | Delay/cancel/reroute, status conflict | Impact queue, replan, readiness/maintenance | Yes |
| FLOW-OPS-010 | Administrative/support | FLT-008, GBL-008 | OPS-020 | Complete/explicit partial job | Invalid file/rows, permission, cancellation | Correct and retry failed rows, inspect/download results | Yes |
| FLOW-OPS-011 | Administrative/support | ADM-001/002, IAM-008 | OPS-021/022 | Corrected/merged/restricted/reviewed | Uncertain identity, active blocker, expired/rejected restriction | Keep separate, verify, approval, correction/removal | Yes |
| FLOW-OPS-012 | Cross-application | PAY-006–009, INT-001/004 | OPS-023/024 | Refunded/reversed/reconciled/resolved | Over-refund blocked, provider unknown/fail, approval pending | Refresh/link, approval, safe compensation, escalation | Yes |
| FLOW-OPS-013 | Administrative/support | PRC-001/003–006, ADM-005–007/010 | OPS-025–029 | Scheduled/Active version | Gap/conflict/rejection/dependency failure | Fix draft, preview, approval, keep prior active, supersede | Yes |
| FLOW-OPS-014 | Administrative/support | GBL-004, ADM-008 | OPS-030/031 | Saved/deactivated/restored or read-only understood | Duplicate/in-use/delete blocked, sync failure, conflict | Edit, deactivate, restore, retry sync, go to owner | Yes |
| FLOW-OPS-015 | Administrative/support | ADM-009, IAM-003/005 | OPS-032 | Invite/access change/suspension with work owned | Last admin/self-escalation/approval/delivery failure | Correct, approve, reassign, resend/revoke | Yes |
| FLOW-OPS-016 | Administrative/support | ADM-011/012, INT-002 | OPS-033/034 | Published localized version | Missing variable/translation, stale source, review/test failure | Edit, preview, reject-to-draft, fallback exception, retry provider | Yes |
| FLOW-OPS-017 | Administrative/support | RPT-001–006 | OPS-035/036 | Viewed/exported/scheduled | Empty/partial/stale, ambiguity, job/delivery/permission failure | Refine, fix source, retry/regenerate, pause schedule | Yes |
| FLOW-OPS-018 | Exception/recovery | INT-001–005, PAY-004/009 | OPS-003/039 | Reconciled/compensated | Still unknown, no safe retry, provider/manual failure | Assign/escalate, provider follow-up, customer verified notice | Yes |
| FLOW-OPS-019 | Administrative/support | RNT-016, PAY-007/008 | OPS-010/012 | Charge resolved or property returned/closed | Unmatched/duplicate/disputed/provider failure | Investigate/link, reconcile, reverse/uphold, claimant verify | Yes |

## 19. UI Element Behavior Index

Every range below is defined by the exact table in its screen or shared-component section. The range is an index, not a substitute for those contracts.

### 19.1 Shared and reusable element ranges

| Element range | Owner | Purpose |
| --- | --- | --- |
| EL-SH-001–010 | Global shell/shared actions | Language, user menu, help, back, retry, dismiss, refresh, activity, document, support |
| EL-COMP-002-01–02 | COMP-SH-002 | Apply/cancel language |
| EL-COMP-003-01 | COMP-SH-003 | Explain status |
| EL-COMP-005-01 | COMP-SH-005 | Focus first form error |
| EL-COMP-006-01–03 | COMP-SH-006 | Dynamic combobox input/clear/retry |
| EL-COMP-007-01–05 | COMP-SH-007 | Trip location/date/time controls |
| EL-COMP-008-01–03 | COMP-SH-008 | Price/deposit/policy details |
| EL-COMP-009-01–03 | COMP-SH-009 | Entity search/remove/open |
| EL-COMP-010-01–05 | COMP-SH-010 | Search/filter/sort/clear/save view |
| EL-COMP-011-01–03 | COMP-SH-011 | Row/selection/actions |
| EL-COMP-012-01 | COMP-SH-012 | Safe step navigation |
| EL-COMP-013-01–02 | COMP-SH-013 | Confirm/cancel consequence dialog |
| EL-COMP-014-01–03 | COMP-SH-014 | Keep editing/discard/save |
| EL-COMP-015-01–02 | COMP-SH-015 | Timeline filter/event detail |
| EL-COMP-016-01–03 | COMP-SH-016 | Choose/remove/retry evidence |
| EL-COMP-017-01–04 | COMP-SH-017 | Job view/cancel/download/retry |
| EL-COMP-018-01–04 | COMP-SH-018 | Request/detail/provide/cancel/contact dependency |
| EL-COMP-019-01–03 | COMP-SH-019 | Request/view/cancel approval |
| EL-CUS-C01-01 | COMP-CUS-001 | Search cars |
| EL-CUS-C02-01–03 | COMP-CUS-002 | Offer details/choose/price |
| EL-CUS-C04-01–02 | COMP-CUS-004 | Driver explanation/save-for-future |
| EL-CUS-C05-01–02 | COMP-CUS-005 | Product choice/details |
| EL-CUS-C06-01–03 | COMP-CUS-006 | Payment method/provider/change |
| EL-CUS-C07-01–03 | COMP-CUS-007 | Summary expand/document/activity |
| EL-OPS-C01-01–03 | COMP-OPS-001 | Scope/global search/inbox |
| EL-OPS-C02-01–04 | COMP-OPS-002 | Workspace back/status/actions/activity |
| EL-OPS-C03-01–05 | COMP-OPS-003 | Queue open/assign/owner/snooze/escalate |
| EL-OPS-C04-01–02 | COMP-OPS-004 | Checklist open/resolve |
| EL-OPS-C05-01–04 | COMP-OPS-005 | Approve/reject/change/close |
| EL-OPS-C06-01–04 | COMP-OPS-006 | Save/preview/publish/pause version |
| EL-OPS-C07-01–06 | COMP-OPS-007 | Report definition/run/export/schedule |

### 19.2 Customer screen element ranges

| Screen | Element range | Main task |
| --- | --- | --- |
| SCREEN-CUS-001 | EL-CUS-001-01–04 | Search/current rental/guest lookup |
| SCREEN-CUS-002 | EL-CUS-002-01–06 | Results/filter/sort/choose/alternatives |
| SCREEN-CUS-003 | EL-CUS-003-01–05 | Offer detail and choose |
| SCREEN-CUS-004 | EL-CUS-004-01–06 | Renter/drivers and eligibility |
| SCREEN-CUS-005 | EL-CUS-005-01–05 | Extras/protection |
| SCREEN-CUS-006 | EL-CUS-006-01–06 | Review/payment/confirmation |
| SCREEN-CUS-007 | EL-CUS-007-01–05 | Booking result and next actions |
| SCREEN-CUS-008 | EL-CUS-008-01–06 | Sign in/provider/recovery/register |
| SCREEN-CUS-009 | EL-CUS-009-01–06 | Register and verify |
| SCREEN-CUS-010 | EL-CUS-010-01–05 | Recovery |
| SCREEN-CUS-011 | EL-CUS-011-01–04 | Account overview navigation |
| SCREEN-CUS-012 | EL-CUS-012-01–05 | Profile/preferences |
| SCREEN-CUS-013 | EL-CUS-013-01–05 | Drivers/documents |
| SCREEN-CUS-014 | EL-CUS-014-01–04 | Reservation list |
| SCREEN-CUS-015 | EL-CUS-015-01–06 | Reservation actions |
| SCREEN-CUS-016 | EL-CUS-016-01–05 | Modification proposal/commit |
| SCREEN-CUS-017 | EL-CUS-017-01–04 | Cancellation/refund review |
| SCREEN-CUS-018 | EL-CUS-018-01–05 | Guest verification |
| SCREEN-CUS-019 | EL-CUS-019-01–04 | Payments/refunds/dispute route |
| SCREEN-CUS-020 | EL-CUS-020-01–05 | Active rental actions |
| SCREEN-CUS-021 | EL-CUS-021-01–04 | Extension |
| SCREEN-CUS-022 | EL-CUS-022-01–06 | Roadside/incident |
| SCREEN-CUS-023 | EL-CUS-023-01–05 | Return/after-hours |
| SCREEN-CUS-024 | EL-CUS-024-01–05 | Data requests/closure |

### 19.3 Operations screen element ranges

| Screens | Element range | Main task |
| --- | --- | --- |
| SCREEN-OPS-001–006 | EL-OPS-001-01–04; 002-01–04; 003-01–04; 004-01–05; 005-01–06; 006-01–06 | Access, dashboard, queues, search, reservation, assisted booking |
| SCREEN-OPS-007–012 | EL-OPS-007-01–05; 008-01–06; 009-01–05; 010-01–06; 011-01–06; 012-01–06 | Readiness, pickup, active rental, return, cases |
| SCREEN-OPS-013–020 | EL-OPS-013-01–05; 014-01–06; 015-01–05; 016-01–04; 017-01–06; 018-01–06; 019-01–05; 020-01–06 | Fleet, categories, transfers, maintenance, inspections, blocks, bulk jobs |
| SCREEN-OPS-021–024 | EL-OPS-021-01–04; 022-01–06; 023-01–06; 024-01–05 | Customers, payments, reconciliation |
| SCREEN-OPS-025–031 | EL-OPS-025-01–05; 026-01–05; 027-01–05; 028-01–05; 029-01–05; 030-01–04; 031-01–06 | Commercial/location/policy/reference configuration |
| SCREEN-OPS-032–039 | EL-OPS-032-01–06; 033-01–06; 034-01–05; 035-01–04; 036-01–05; 037-01–05; 038-01–05; 039-01–06 | Access, messages, translations, reports, audit, integrations |

No listed control is decorative. Static images, headings, dividers, status icons, and explanatory text are not assigned element IDs because they have no interaction. Any implementation that makes them interactive must add a contract and traceability before acceptance.

## 20. Lookup Governance Matrix

All sources below are retrieved dynamically. “Stored reference catalogue” means authoritative system/business rows managed through SCREEN-OPS-030/031; it never means a UI-bundled array. Entity-owned data is selected from its owning area and is not duplicated in Lookups.

| LOOKUP/Source ID | Used By | Classification | Source of Truth | Scope | Editable Attributes | Management/View Screen | Localization | Historical-Value Rule |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SRC-LOCATION | Trip, assignment, transfer, reports | Entity-owned | Location records | Global/market | Full governed entity fields | OPS-028; catalogue link | Name/address/instructions/hours | Archived location snapshot resolves on history |
| SRC-ONEWAY-ROUTE | Trip/quote/location policy | Entity-owned/constrained | Location route records | Market/location pair | Availability, conditions, effective period | OPS-028 | Labels/instructions/fees through owning content | Prior route/policy version retained |
| SRC-VEHICLE-UNIT | Assignment, rental, fleet, maintenance | Entity-owned | Vehicle records | Organization/location | Governed vehicle fields/status through lifecycle | OPS-013/014 | Make/model display; codes isolated | Retired unit remains on rental history |
| SRC-VEHICLE-CATEGORY | Catalogue, rates, booking, assignment | Entity-owned/constrained | Category records | Market/location | Content/specs/applicability/order/status | OPS-015 | Required public labels/descriptions | Accepted category snapshot retained |
| LOOKUP-VEHICLE-MAKE-MODEL | Vehicle editor/catalogue | Constrained lookup or entity data | Fleet catalogue | Market/global | Approved makes/models/year relations | OPS-015 or OPS-031 by operating model | Display names as needed | Old unit value remains readable |
| LOOKUP-VEHICLE-FEATURE | Catalogue/filter/unit | Configurable constrained lookup | Stored reference catalogue | Market/global | Label, icon reference, order, applicability, active | OPS-031 / OPS-015 usage | Labels/descriptions | Inactive hidden for new, shown on history |
| LOOKUP-VEHICLE-STATE | Fleet/availability | System-fixed invariant | System-managed reference rows | Global | Labels only through translation; transitions locked | OPS-031 read-only | Localized label/explanation | Stable code retained forever |
| LOOKUP-RESERVATION-STATE | Customer/staff reservation status | System-fixed invariant | System-managed rows | Global | Labels/explanations only | OPS-031 read-only | Customer/staff localized labels | Stable code/event history retained |
| LOOKUP-RENTAL-STATE | Active rental/return | System-fixed invariant | System-managed rows | Global | Labels/explanations only | OPS-031 read-only | Localized | Stable code retained |
| LOOKUP-PAYMENT-STATE | Payment/reconciliation | System-fixed/external mapping | System rows mapped to provider | Global/provider | Mapping constrained; labels translated | OPS-031 read-only/constrained; OPS-039 | Customer-safe/staff labels | Original provider/internal status history retained |
| LOOKUP-REFUND-STATE | Refund tracking | System-fixed invariant | System-managed rows | Global | Labels only | OPS-031 read-only | Localized | Stable code retained |
| LOOKUP-INCIDENT-STATE | Case workflows | System-fixed invariant | System-managed rows | Global | Labels only; transitions locked | OPS-031 read-only | Localized customer/staff variants | Stable events retained |
| LOOKUP-MAINTENANCE-STATE | Maintenance board | System-fixed invariant | System-managed rows | Global | Labels only; transitions locked | OPS-031 read-only | Localized | Stable events retained |
| LOOKUP-INSPECTION-STATE | Inspection workflow | System-fixed invariant | System-managed rows | Global | Labels only; transitions locked | OPS-031 read-only | Localized | Submitted/superseded history retained |
| SRC-RATE-PLAN | Quote/pricing | Entity-owned business configuration | Versioned rate plans | Market/location/category | Conditions, currency, amounts, period, status | OPS-025 | Public plan/line labels where shown | Confirmed quote keeps version/snapshot |
| LOOKUP-CHARGE-TYPE | Fees/taxes/deposits/adjustments | Constrained lookup | Stored reference catalogue | Market/jurisdiction | Safe labels/order/applicability; calculation family locked | OPS-026/031 | Customer line labels/explanations | Transaction line snapshot retained |
| LOOKUP-DISCOUNT-TYPE | Promotion/rate configuration | Constrained lookup | Stored reference catalogue | Market | Labels, allowed applicability/combinability subset | OPS-026/031 | Labels/messages | Historical discount code/type retained |
| SRC-PROMOTION | Booking/quote | Entity-owned business configuration | Promotion records | Market/location/channel | Code, eligibility, limits, dates, combinability/status | OPS-026 | Customer messages | Applied promotion snapshot retained |
| LOOKUP-PAYMENT-METHOD | Checkout/pickup/payment | Externally managed/constrained | Provider capabilities plus business enablement | Market/currency/channel | Enable safe subset, labels/order; capabilities locked | OPS-031/039; OPS-026 policy link | Customer method names/help | Original method summary retained |
| LOOKUP-COUNTRY | Addresses/licences/policies | Externally managed/system standard | Governing standards dataset | Global; supported subset | Business enablement; codes locked | OPS-031 | Localized country names | Standard code retained |
| LOOKUP-CURRENCY | Quotes/reports | Externally managed/system standard | Governing standards dataset | Market | Supported subset/display; code/minor unit locked | OPS-031/025 | Localized name/symbol formatting | Transaction currency immutable |
| LOOKUP-TIME-ZONE | Locations/reports/schedules | Externally managed/system standard | Governing time-zone dataset | Global | Location assignment; identifiers/rules locked | OPS-028/031 | Localized display | Stored identifier and event offset preserved |
| LOOKUP-LICENCE-TYPE | Driver/eligibility | Constrained/external | Market policy/reference rows | Market/jurisdiction | Enable subset, label, requirements; standard code constrained | OPS-029/031 | Label/help | Booking/agreement snapshot retained |
| SRC-LANGUAGE-LOCALE | All surfaces | Constrained business configuration plus standards | Language/locale records | Global/market/user | Enable/default/fallback/order; locale rules locked | OPS-034/031 | Self-referential/native labels | Transaction language/version retained |
| LOOKUP-EXTRA-TYPE | Checkout/fulfilment/return | Configurable business lookup/product | Extra product records/reference type | Market/location | Content, price link, stock, order, applicability, status | OPS-027/031 | Labels/descriptions/terms | Booked product snapshot retained |
| LOOKUP-PROTECTION-PRODUCT | Checkout/agreement/incident | Constrained business product | Versioned protection records | Market/location/category/driver | Content/availability/price; legal/integration codes locked | OPS-027/031 | Summary/exclusions/terms | Accepted terms/version retained |
| LOOKUP-CANCEL-REASON | Customer/staff cancellation | Configurable business lookup | Stored reference catalogue | Global/market/channel | Code, labels, order, required note, active | OPS-031 | Required | Inactive reason remains on event |
| LOOKUP-NOSHOW-REASON | No-show correction/operations | Configurable constrained lookup | Stored reference catalogue | Market/location | Code, labels, evidence rule, active | OPS-031 | Staff label; customer-safe category | Historical event label/code retained |
| LOOKUP-OVERRIDE-REASON | Pricing/eligibility/allocation override | Configurable constrained lookup | Stored reference catalogue | Rule family/scope | Label, evidence/approval requirements, active | OPS-031/029 | Staff localization | Inactive remains on audit |
| LOOKUP-REFUND-REASON | Refund | Configurable constrained lookup | Stored reference catalogue | Market/finance policy | Label, evidence/approval, active | OPS-031/023 | Customer-safe label as permitted | Transaction/audit retains reason |
| LOOKUP-ADJUSTMENT-REASON | Return/post-rental charges/credits | Configurable constrained lookup | Stored reference catalogue | Market/charge type | Label, basis/evidence/tax rules, active | OPS-031/026 | Customer statement label required | Line-item snapshot retained |
| LOOKUP-TRANSFER-REASON | Fleet transfer | Configurable business lookup | Stored reference catalogue | Organization/location | Label, priority/evidence, active | OPS-031/016 | Staff localization | Transfer event retains value |
| LOOKUP-BLOCK-REASON | Availability block | Configurable constrained lookup | Stored reference catalogue | Organization/location | Label, severity, work requirement, active | OPS-031/019 | Staff localization | Block history retains value |
| LOOKUP-CASE-REASON | Service/customer/data cases | Configurable constrained lookup | Stored reference catalogue | Case family | Label, routing, priority, evidence, active | OPS-031/012/022 | Customer-safe label as applicable | Case history retains value |
| LOOKUP-INCIDENT-TYPE | Incident report/triage | Configurable constrained lookup | Safety-owned reference rows | Market | Label, questions, routing, vehicle-block behavior; high-risk locked | OPS-031/012 | Customer/staff versions | Report retains type/version |
| LOOKUP-DAMAGE-FINDING | Inspection/damage | Configurable constrained lookup | Fleet-owned reference rows | Vehicle/category/market | Label, severity, evidence/review requirements, active | OPS-031/018 | Staff/customer-safe labels | Finding retains value/version |
| LOOKUP-CLEANING-MAINT-TYPE | Fleet work | Configurable constrained lookup | Fleet reference rows | Organization/location/category | Label, trigger, blocking/severity/default duration, active | OPS-031/017 | Staff localization | Work history retains type |
| LOOKUP-DOCUMENT-TYPE | Driver/vehicle compliance | Configurable constrained lookup | Policy/fleet reference rows | Market/person/vehicle | Label, applicability, expiry/blocking/evidence rules, active | OPS-031/014/029 | Customer/staff labels/help | Submitted document retains type/version |
| SRC-INSPECTION-CHECKLIST | Pickup/return/maintenance | Constrained versioned configuration | Fleet checklist versions | Market/category/inspection type | Items, order, required/NA/evidence, applicability, status | OPS-018 with OPS-031 catalogue entry | Labels/help | Completed inspection retains checklist version |
| LOOKUP-READINESS-OUTCOME | Inspection/fleet status | System-fixed/constrained | System-managed rows | Global | Labels; transition effect locked | OPS-031 read-only | Localized | Stable code retained |
| SRC-STAFF | Assignment/ownership/approval | Entity-owned | Staff accounts | Organization/location | Managed via staff lifecycle, not lookup | OPS-032 | Display name | Deactivated staff remains actor/owner history |
| SRC-ROLE | Staff access | Entity-owned constrained | Role records | Organization/scope | Name/description and allowed protected action set | OPS-032 | Staff labels/descriptions | Prior access events retain role/version |
| LOOKUP-PERMISSION-ACTION | Role composition | System-fixed invariant | System-managed rows | Global | Labels/group only; security meaning locked | OPS-032/031 read-only | Localized admin text | Stable action code retained |
| LOOKUP-NOTIFICATION-EVENT | Template rules | System-fixed invariant | System-managed rows | Global | Enable/channel rules constrained; event code locked | OPS-033/031 | Event labels | Sent message retains event/template |
| LOOKUP-DELIVERY-STATE | Message status | System-fixed/external mapping | System rows/provider mapping | Provider/global | Mapping constrained; labels only | OPS-033/039/031 | Customer-safe/staff labels | Delivery event history retained |
| SRC-REPORT-DEFINITION | Reports | Constrained entity/configuration | Versioned report definitions | Role/business | Safe dimensions/defaults/definition version | OPS-035/036 | Titles/descriptions/metric help | Export stores definition/filter version |
| LOOKUP-REPORT-DIMENSION | Report builder | Constrained/system-managed | Report metadata rows | Report/permission | Labels/order/availability; semantic meaning locked | OPS-036/031 | Localized labels/definitions | Saved view resolves original dimension/version |
| SRC-CUSTOMER | Booking/support/customer picker | Entity-owned | Customer records | Organization/privacy scope | Managed via verified customer workflow | OPS-021/022 | Names/addresses as entered | Merged/closed identity mapping preserved |
| SRC-VENDOR-PROVIDER | Maintenance/roadside/integrations | Entity-owned/external | Vendor/integration records | Organization/market | Contact/routing/enabled state by owning area | OPS-017/039 | Display content as needed | Prior work/event provider retained |

### 20.1 Lookup audit result

- Every selectable source in the design is represented above or is an entity selector pointing to its owning screen.
- Every source defines loading, empty, no-results, unavailable, permission, stale, inactive-history, and retry behavior through Section 15.1.
- Safely configurable data is editable by authorized users; lifecycle/security/standard/integration invariants remain stored and visible read-only or constrained with a reason.
- No production option source is designed as static UI data.
