# Car Rental System — Functional Requirements

## 1. Document Information

| Field | Value |
| --- | --- |
| Document | Functional Requirements |
| Project | Car Rental System |
| Version | 1.0 |
| Status | Draft baseline for independent scoring |
| Baseline date | 2026-09-06 |
| Source brief | 00-input/project-brief-v1.0.md |
| Scope | Customer web, customer mobile, and operations/admin dashboard |

### 1.1 Interpretation rules

- “Must” identifies required behavior.
- Exact fees, time limits, eligibility thresholds, deposit amounts, grace periods, supported countries, currencies, languages, and approval thresholds are configurable business decisions unless a governing rule fixes them.
- “Vehicle category” means a bookable class of comparable vehicles. “Vehicle unit” means a specific physical car.
- The business may enable category booking, exact-vehicle booking, or both by market. The selected model must be disclosed before confirmation.
- “Real-time availability” means availability calculated from the latest accepted reservations, active rentals, temporary checkout holds, fleet status, maintenance, location, and turnaround rules at the moment the system checks.
- This document describes business-visible behavior. Technology and infrastructure choices remain constraints for the later SRS.

## 2. Purpose and Scope

The system allows customers to discover, price, reserve, pay for, collect, use, modify, and return rental vehicles through web and mobile experiences. It allows authorized staff to operate locations, manage the fleet, customers, pricing, reservations, rentals, payments, reference data, notifications, and reports through one dashboard.

The initial release must deliver the complete core rental lifecycle, not only an online booking form. Optional external services such as mapping, email, SMS, and identity checks are enabled only where the business configures them. Corporate accounts, loyalty programs, chauffeur services, peer-to-peer vehicle ownership, auctions, and long-term leasing are outside this baseline unless later accepted.

### 2.1 Functional goals

1. Show customers only offers that can be fulfilled under current business rules.
2. Provide a clear total price and material rental conditions before commitment.
3. Prevent conflicting allocation of the same constrained inventory.
4. Preserve continuity between customer self-service and staff operations.
5. Give every exceptional path an owner, final state, and recovery action.
6. Keep business choices dynamic, localized, permission-controlled, and auditable.

## 3. System Overview

### 3.1 Operating model

The system supports one or more rental locations. A customer searches by pickup and return location, date, and time. The system returns eligible vehicle categories or exact vehicles according to the configured booking model. A quote includes base rental price, taxes, mandatory charges, selected extras, protection products, discounts, deposits or holds, and any one-way charge. The customer supplies renter and driver information, accepts disclosed terms, completes the required payment step, and receives a unique reservation only after the booking is durably confirmed.

Before pickup, staff may review readiness and assign a vehicle unit. At pickup, staff verify eligibility and documents, confirm charges, record the vehicle's condition, mileage, and fuel or battery level, obtain required acknowledgements, and open the rental. During the rental, authorized people can handle extensions, incidents, roadside help, replacements, and overdue cases. At return, staff record the returned condition and usage, settle adjustments, provide a final statement, and release or adjust any security hold according to policy.

### 3.2 System boundaries

Included business functions are customer discovery and self-service, account access, pricing and availability, booking, payment, pickup, rental servicing, return and closeout, fleet and location management, customer and staff administration, notifications, reporting, audit history, reference data, and external-service coordination.

Technical framework selection, database engine selection, hosting topology, deployment automation, source-code organization, and protocol design are not functional requirements. Their input constraints are preserved in Section 13 for the SRS.

## 4. Applications / Surfaces

| Surface ID | Application / surface | Primary actors | Purpose |
| --- | --- | --- | --- |
| APP-CWEB | Customer Web | Visitor, customer, renter | Discover, reserve, pay, and self-manage from a browser. |
| APP-CMOB | Customer Mobile | Visitor, customer, renter | Provide equivalent core customer journeys optimized for mobile use. |
| APP-OPS | Operations and Admin Dashboard | Rental agent, fleet staff, finance staff, manager, administrator, support, auditor | Operate locations, fleet, customers, bookings, rentals, payments, configuration, and reporting. |

Authentication, payments, notifications, reporting, and integrations are functional areas spanning these surfaces; they are not separate user-facing applications.

## 5. Actors and Roles

| Actor ID | Actor | Responsibilities and boundaries |
| --- | --- | --- |
| ACT-VISITOR | Visitor | Browse, search, quote, start checkout, register, sign in, and recover a guest reservation when permitted. |
| ACT-CUSTOMER | Customer | Maintain an account, create and manage eligible reservations, payments, drivers, documents, and communication preferences. |
| ACT-RENTER | Primary renter / driver | Accept rental obligations and pass configured eligibility and pickup checks. May be the account owner or an identified driver. |
| ACT-ADDL | Additional driver | Provide required identity and eligibility information; cannot manage the reservation unless separately authorized. |
| ACT-AGENT | Rental agent | Create and manage reservations, verify pickup eligibility, assign and hand over vehicles, accept returns, and record exceptions within granted authority. |
| ACT-FLEET | Fleet staff | Maintain vehicle records, location movements, readiness, inspections, maintenance, damage, cleaning, and availability blocks. |
| ACT-FIN | Finance staff | Review payments, adjustments, refunds, deposits, disputes, reconciliation, and financial reports within granted authority. |
| ACT-MANAGER | Location or business manager | Configure permitted policies and pricing, approve controlled exceptions, oversee operations, and access scoped reports. |
| ACT-ADMIN | System administrator | Manage staff access, roles, global configuration, integrations, languages, and system-managed catalogues without silently altering historical transactions. |
| ACT-SUPPORT | Customer support staff | Locate customers and reservations, assist with permitted changes, record communication, and escalate restricted actions. |
| ACT-AUDITOR | Auditor | Read authorized records, histories, and reports without changing operational data. |
| EXT-PAY | Payment provider | Authorize, capture, settle, refund, and report payment outcomes. |
| EXT-MSG | Email/SMS/push provider | Deliver customer and staff messages and return delivery results. |
| EXT-MAP | Mapping/location provider | Validate or enrich addresses, directions, or distance data when enabled. |
| EXT-ID | Identity/eligibility provider | Return verification outcomes when enabled; staff remain responsible for governed manual decisions. |

Permissions must be scoped by role, action, location, and data sensitivity where relevant. A role name alone must not imply unrestricted access.

## 6. Functional Area Catalogue

| Area code | Functional area | Main surfaces |
| --- | --- | --- |
| GBL | Global behavior and governance | All |
| IAM | Registration, access, profile, privacy | APP-CWEB, APP-CMOB, APP-OPS |
| CAT | Locations, catalogue, search, availability | APP-CWEB, APP-CMOB, APP-OPS |
| PRC | Pricing, offers, extras, protection | All |
| BKG | Checkout and reservation creation | All |
| PAY | Payments, deposits, refunds, disputes | All |
| RSV | Reservation self-service and lifecycle | All |
| RNT | Pickup, active rental, return, closeout | APP-CWEB, APP-CMOB, APP-OPS |
| FLT | Fleet, maintenance, inspections | APP-OPS |
| ADM | Customers, staff, locations, configuration | APP-OPS |
| RPT | Dashboards, reports, exports | APP-OPS |
| INT | Connected services and recovery | All |

## 7. Global Functional Behavior

### FR-GBL-001 — Consistent cross-surface records

- Applications/surfaces: All
- Actors: All authorized actors
- Purpose and trigger: Keep one authoritative state whenever a reservation, rental, vehicle, customer, price, or payment is viewed or changed.
- Preconditions: The actor has access to the record.
- Functional behavior and rules: Every accepted action must update the shared record and make its new status visible to other affected surfaces. Cached or stale views must be marked and refreshed before a consequential action. Customer and staff terminology must map to the same underlying lifecycle states.
- Outcomes and recovery: Success shows the accepted state and next action. A conflicting or stale update is rejected without losing the newer change; the actor receives the current state and can review and retry.
- Permissions/effects: Only permitted actors may change data; connected surfaces receive the outcome.
- Acceptance evidence: A staff cancellation becomes visible in customer web and mobile, and a stale customer modification cannot silently overwrite it.
- Related: FR-GBL-005, FR-GBL-006, FR-RSV-002, FR-RSV-003

### FR-GBL-002 — Multilingual experience and preferences

- Applications/surfaces: All
- Actors: Visitor, customer, staff, administrator
- Purpose and trigger: Let each person use an available language and preserve the choice.
- Functional behavior and rules: Authorized administrators configure launch languages and a default language. Visitors may select a language; signed-in preferences follow the account and device-specific behavior may be retained where appropriate. Navigation, controls, validation, statuses, lookup labels, messages, templates, receipts, agreements, and system-generated documents must use approved translations. Missing translations use the configured fallback and are identifiable to administrators, while stable internal codes never change with labels.
- Outcomes and recovery: Language changes preserve the current task and entered data. Unsupported or incomplete language content falls back without exposing raw keys.
- Acceptance evidence: A user changes language during checkout, stays on the same step, and sees localized labels, errors, quote formats, and later notifications.
- Related: FR-GBL-003, FR-ADM-012, FR-INT-002

### FR-GBL-003 — Locale, time zone, currency, and text direction

- Applications/surfaces: All
- Actors: All
- Functional behavior and rules: Display dates, times, time zones, numbers, currency, names, addresses, and plural forms using the active locale. Pickup and return times must always identify the rental location's time zone when ambiguity is possible. Unicode input, search, and display must be preserved. Right-to-left layouts and mixed-direction values such as booking references, vehicle plates, and phone numbers must remain readable.
- Outcomes and recovery: Invalid locale-specific input receives an example in the selected language without discarding other valid values.
- Acceptance evidence: The same reservation is unambiguous when viewed in different locales and across a daylight-saving change.
- Related: FR-GBL-002, FR-CAT-004, FR-PRC-007

### FR-GBL-004 — Dynamic reference and lookup data

- Applications/surfaces: All
- Actors: Administrator, manager, authorized staff
- Functional behavior and rules: Every business/domain option list must come from its authoritative stored catalogue or owning entity. Each catalogue is classified as configurable business lookup, constrained lookup, system-fixed invariant, externally managed reference, or entity-owned data. Authorized users can view the full catalogue in Reference Data or its owning area. Safe lookups may be added, translated, ordered, activated, and deactivated. Values that control lifecycle, security, standards, or integrations remain visible but read-only or constrained with the reason shown.
- Outcomes and recovery: Deactivation prevents new selection but preserves historical labels and stable codes. Rename affects future display without rewriting transaction meaning. A value in use cannot be destructively deleted.
- Acceptance evidence: A manager deactivates an optional equipment type; it disappears from new quotes but remains intelligible on old rentals.
- Related: FR-ADM-010, FR-ADM-011, FR-GBL-008

### FR-GBL-005 — Visible status, history, and next action

- Applications/surfaces: All
- Actors: All authorized actors
- Functional behavior and rules: Every reservation, payment, rental, vehicle, maintenance job, incident, and refund must display a clear current status, relevant timestamps, responsible party where needed, and permitted next actions. Customer views show customer-appropriate history; staff views show operational history according to permission.
- Outcomes and recovery: Terminal states have no misleading action. Pending or failed states explain whether the user should wait, retry, supply information, contact support, or take no action.
- Acceptance evidence: A failed refund shows failure, unchanged financial balance, owner, and retry/escalation action rather than appearing completed.
- Related: FR-GBL-008, lifecycle models in Section 11

### FR-GBL-006 — Duplicate, repeated, and conflicting actions

- Applications/surfaces: All
- Actors: All
- Functional behavior and rules: Repeated taps, browser refreshes, provider retries, and delayed responses must not create duplicate bookings, captures, refunds, or assignments. Before accepting a consequential action, the system rechecks permissions, current state, availability, and applicable price. Mutually conflicting actions are serialized or one is rejected with the accepted result shown.
- Outcomes and recovery: The actor receives the already-created result or a clear conflict response and safe next action.
- Acceptance evidence: Repeated confirmation produces one reservation and one intended payment outcome.
- Related: FR-BKG-007, FR-PAY-004, FR-INT-004

### FR-GBL-007 — Accessible task completion

- Applications/surfaces: All
- Actors: All
- Functional behavior and rules: Core actions must be operable without relying only on color, hover, fine pointer control, sound, or a single device orientation. Focus, labels, error association, reading order, zoom, text scaling, and status announcements must support assisted use. Time-limited tasks must disclose expiry and provide an extension or restart route where business rules allow.
- Outcomes and recovery: Accessibility preferences do not remove information or block the shortest valid flow.
- Acceptance evidence: Search, booking, payment, cancellation, pickup, and return tasks can be completed with keyboard and screen-reader-oriented interaction patterns.
- Related: all customer and staff workflows

### FR-GBL-008 — Audit history and reason capture

- Applications/surfaces: APP-OPS; customer-visible subset on APP-CWEB and APP-CMOB
- Actors: Staff, manager, administrator, auditor
- Functional behavior and rules: Record who or what performed consequential changes, when, from which surface or connected service, the prior and resulting state, and a required reason for configured sensitive actions. Audit records are append-only to ordinary users. Sensitive values are masked according to permission.
- Outcomes and recovery: Failed attempts that affect risk or operations are distinguishable from accepted changes. Authorized reviewers can filter and export audit evidence.
- Acceptance evidence: Manual price overrides, eligibility overrides, refunds, vehicle blocks, customer restrictions, and role changes are attributable and explainable.
- Related: FR-ADM-009, FR-PAY-009, FR-RPT-006

## 8. Functional Requirements by Area

### 8.1 Registration, access, profile, and privacy

### FR-IAM-001 — Customer registration

- Applications/surfaces: APP-CWEB, APP-CMOB
- Actors: Visitor
- Trigger and preconditions: A visitor chooses to create an account; required contact details are not already tied to an incompatible account.
- Functional behavior and rules: Collect the minimum configured identity, contact, credentials, language, and consent information. Explain mandatory and optional fields. Validate without clearing valid entries. Detect an existing account and route to sign-in or recovery rather than creating a duplicate. Registration during checkout must return the customer to the same booking step.
- Outcomes, exceptions, and recovery: Create a pending or active account according to verification policy. Provider or delivery failure leaves the account recoverable and offers resend or support. Abandonment creates no confirmed booking.
- Permissions/effects: The customer controls their account; staff cannot learn the password.
- Acceptance evidence: A new user can register from checkout and continue with the quote and entered trip details intact.
- Related: FR-IAM-002, FR-IAM-003, FR-BKG-001

### FR-IAM-002 — Contact verification

- Applications/surfaces: APP-CWEB, APP-CMOB, APP-OPS
- Actors: Customer, support staff
- Functional behavior and rules: Verify configured email or phone channels using expiring, single-purpose challenges. Resend is rate-controlled and invalidates older challenges when appropriate. Changing a verified contact requires renewed verification and appropriate re-authentication. Staff may view status and initiate a new challenge but cannot mark a contact verified without a permitted, audited manual procedure.
- Outcomes and recovery: Valid confirmation updates verification status. Expired, incorrect, already-used, or delivery-failed challenges show a safe retry or channel-change route.
- Acceptance evidence: An expired code cannot verify an account, and a new code completes verification without duplicate accounts.
- Related: FR-IAM-001, FR-IAM-005, FR-INT-002

### FR-IAM-003 — Sign in, session, and sign out

- Applications/surfaces: All
- Actors: Customer, staff
- Functional behavior and rules: Authenticate approved credentials or configured external sign-in methods, then expose only authorized actions. Disclose account suspension, required verification, or temporary lock without exposing sensitive security detail. Users can sign out of the current session and, where configured, other sessions. Sensitive staff actions may require renewed verification.
- Outcomes and recovery: Success returns the person to the intended permitted task. Failure does not reveal whether unrelated personal data exists and offers recovery after permitted attempts.
- Acceptance evidence: A customer following a reservation link signs in and returns to that reservation; a staff member cannot access a location outside their scope.
- Related: FR-IAM-004, FR-IAM-005, FR-ADM-009

### FR-IAM-004 — Account recovery and credential change

- Applications/surfaces: APP-CWEB, APP-CMOB, APP-OPS
- Actors: Customer, staff, support staff
- Functional behavior and rules: Allow a person to start account recovery through verified channels. Recovery challenges expire, are single-use, and do not disclose unnecessary account information. After success, invalidate sessions according to policy and notify the account holder. A signed-in person can change credentials after re-verification. Support can initiate but cannot see or choose a customer's secret.
- Outcomes and recovery: Delivery failure offers resend, alternate verified channel, or support. Suspicious or exhausted attempts enter a controlled review or wait state.
- Acceptance evidence: A used recovery link cannot be reused, and successful recovery produces a security notification.
- Related: FR-IAM-002, FR-IAM-003, FR-INT-002

### FR-IAM-005 — Configured external sign-in

- Applications/surfaces: APP-CWEB, APP-CMOB, APP-OPS where enabled
- Actors: Customer, staff, external identity provider
- Functional behavior and rules: Offer only approved sign-in providers. Link an external identity to an existing account only after verified ownership; never create parallel accounts silently. Provider cancellation or failure returns the user safely to the sign-in choice. Removing the last usable sign-in method requires adding another first.
- Outcomes and recovery: Success continues the original task. Conflicting identities require explicit resolution or support.
- Acceptance evidence: An external sign-in matching an existing verified email does not silently merge accounts without confirmation.
- Related: FR-IAM-001, FR-IAM-003, FR-INT-005

### FR-IAM-006 — Customer profile and preferences

- Applications/surfaces: APP-CWEB, APP-CMOB, APP-OPS
- Actors: Customer, authorized support staff
- Functional behavior and rules: View and update permitted name, contact, address, language, time-zone, communication preferences, and saved renter details. Identify which changes require verification. Changes must not rewrite the identity or contact details captured on finalized historical agreements; later transactions use current approved data.
- Outcomes and recovery: Invalid changes are rejected field-by-field. Conflicting concurrent changes show the retained value. Customers may revert optional preferences.
- Acceptance evidence: Updating a phone number requires configured verification and leaves prior rental documents unchanged.
- Related: FR-IAM-002, FR-IAM-007, FR-GBL-002

### FR-IAM-007 — Driver and eligibility information

- Applications/surfaces: APP-CWEB, APP-CMOB, APP-OPS
- Actors: Customer, primary renter, additional driver, rental agent
- Functional behavior and rules: Capture the identity, birth date or age evidence, licence details, issuing country, expiry, contact details, and other jurisdiction-specific qualifications required for each driver. Clearly separate primary renter, payer, and additional driver roles. Saved details may prefill a new booking but must be reconfirmed and revalidated for the rental dates. Sensitive documents have visible review and expiry status.
- Outcomes and recovery: Missing, expired, inconsistent, or ineligible data blocks only the affected commitment and explains the permitted correction, alternative vehicle category, manual review, or cancellation path.
- Acceptance evidence: A licence expiring before the planned return cannot pass eligibility without an approved resolution.
- Related: FR-BKG-002, FR-BKG-003, FR-RNT-003

### FR-IAM-008 — Account data access, correction, and closure

- Applications/surfaces: APP-CWEB, APP-CMOB, APP-OPS
- Actors: Customer, support staff, administrator
- Functional behavior and rules: Let customers request access to, correction of, or closure of their account data according to applicable policy. Before closure, disclose active reservations, rentals, unpaid balances, disputes, retention obligations, and effects. Closure disables future sign-in and marketing while preserving records that must be retained. Reopening, when allowed, requires verified ownership and does not recreate deleted optional preferences automatically.
- Outcomes and recovery: Requests show received, in review, completed, rejected-with-reason, or cancelled status. Identity uncertainty routes to verification rather than disclosure.
- Acceptance evidence: An account with an active rental cannot be silently erased; the customer sees the blocker and next step.
- Related: FR-ADM-001, FR-GBL-008, FR-RNT-005

### 8.2 Catalogue, search, locations, and availability

### FR-CAT-001 — Browse the vehicle catalogue

- Applications/surfaces: APP-CWEB, APP-CMOB
- Actors: Visitor, customer
- Trigger and preconditions: The actor opens discovery with or without trip criteria.
- Functional behavior and rules: Present active bookable vehicle categories or exact vehicles using approved localized names, representative imagery, capacity, transmission, energy type, key features, and location applicability. Clearly label representative models when a category rather than an exact unit is being reserved. Do not show retired or staff-only inventory as bookable.
- Outcomes and recovery: Empty catalogues show how to set or broaden a valid trip search, contact support, or change location.
- Acceptance evidence: Category results never imply a guaranteed make/model unless exact-vehicle booking applies.
- Related: FR-CAT-002, FR-CAT-003, FR-FLT-002

### FR-CAT-002 — Search, filter, and sort offers

- Applications/surfaces: APP-CWEB, APP-CMOB
- Actors: Visitor, customer
- Functional behavior and rules: Search by pickup/return location, dates, and times; then filter using dynamically available attributes such as category, passenger capacity, luggage, transmission, energy type, accessibility-related equipment, price range, and included features where relevant. Sort by clearly named criteria. Only applicable filter values appear, selected filters remain visible, and results update without losing trip context.
- Alternate and failure behavior: Invalid date order, closed locations, unsupported routes, and unavailable filters receive corrective guidance. Clearing filters restores the unfiltered eligible result set.
- Acceptance evidence: Filter counts and results remain consistent, and unavailable values are not presented as selectable options.
- Related: FR-CAT-004, FR-CAT-005, FR-GBL-004

### FR-CAT-003 — View vehicle or category details

- Applications/surfaces: APP-CWEB, APP-CMOB, APP-OPS
- Actors: Visitor, customer, staff
- Functional behavior and rules: Show description, images, capacity, luggage guidance, transmission, doors, energy type, included mileage if applicable, location restrictions, major eligibility conditions, features, included services, and material exclusions. Show price only for a complete trip context and distinguish estimated “from” prices from bookable totals. Staff can see relevant operational attributes according to permission.
- Outcomes and recovery: Missing media or translation uses an approved fallback without hiding material conditions. A stale or withdrawn offer cannot proceed without a refreshed alternative.
- Acceptance evidence: The details view preserves trip criteria and returns the user to the same results state.
- Related: FR-PRC-002, FR-BKG-002, FR-FLT-002

### FR-CAT-004 — Rental locations and operating hours

- Applications/surfaces: All
- Actors: Visitor, customer, staff, manager
- Functional behavior and rules: Show active locations, localized address, contact options, time zone, regular and exceptional hours, pickup/return instructions, after-hours capability, supported vehicle categories, payment/eligibility differences, and route restrictions. Managers maintain permitted location content and closures. Location selection must distinguish similarly named places and disclose whether one-way return is allowed.
- Outcomes and recovery: Closed or unavailable times offer the nearest valid times or locations without changing criteria silently.
- Acceptance evidence: A holiday closure immediately prevents new incompatible pickups while preserving existing reservations for staff handling.
- Related: FR-ADM-007, FR-CAT-005, FR-RNT-014

### FR-CAT-005 — Calculate real-time availability

- Applications/surfaces: All
- Actors: Visitor, customer, staff
- Trigger and preconditions: A complete location/date/time search or a proposed reservation change.
- Functional behavior and rules: Calculate availability from configured booking mode, active units or category capacity, location, temporary holds, confirmed reservations, active and overdue rentals, approved extensions, planned movements, maintenance, damage/cleaning blocks, operating hours, and turnaround buffers. Recheck before quote commitment, payment, modification, extension, assignment, and manual override.
- Alternate and failure behavior: If certainty is temporarily unavailable, do not claim confirmation; mark the offer unavailable-to-confirm or pending and give retry/support options. Staff override requires permission, reason, and impact disclosure.
- Acceptance evidence: A vehicle blocked for maintenance cannot be sold, and two simultaneous customers cannot both receive the same constrained capacity.
- Related: FR-CAT-006, FR-BKG-004, FR-FLT-007

### FR-CAT-006 — Temporary checkout inventory hold

- Applications/surfaces: APP-CWEB, APP-CMOB, APP-OPS
- Actors: Visitor, customer, rental agent
- Functional behavior and rules: When policy requires, hold the selected capacity for a configured, visibly disclosed period during checkout. A hold is not a reservation. It expires after inactivity, explicit abandonment, failed terminal checkout, or successful conversion. Extension is permitted only under configured rules and current availability.
- Outcomes and recovery: Expiry releases inventory and preserves non-sensitive entered data where appropriate so the user can recheck options. Duplicate tabs cannot extend capacity indefinitely.
- Acceptance evidence: An expired hold cannot be converted without fresh availability and price validation.
- Related: FR-BKG-004, FR-BKG-006, FR-GBL-006

### FR-CAT-007 — No-result and alternative offers

- Applications/surfaces: APP-CWEB, APP-CMOB, APP-OPS
- Actors: Visitor, customer, rental agent
- Functional behavior and rules: When no exact match exists, explain the limiting criteria and offer only valid alternatives such as nearby times, nearby locations, one-way-compatible routes, comparable categories, or a wait/contact route if supported. Each alternative shows how price, vehicle, distance, hours, or conditions differ. The system never changes dates, location, category, or total silently.
- Outcomes and recovery: Selecting an alternative creates a new explicit search context; dismissing it preserves the original search.
- Acceptance evidence: A customer can tell exactly which criterion changed before choosing an alternative.
- Related: FR-CAT-002, FR-CAT-005, FR-PRC-002

### 8.3 Pricing, offers, extras, and protection

### FR-PRC-001 — Configure rate plans and price rules

- Applications/surfaces: APP-OPS
- Actors: Manager, administrator
- Functional behavior and rules: Authorized users manage rate plans by applicable location, category or unit, rental period, dates/seasons, booking channel, customer segment if used, included distance, and other approved conditions. Rules have effective dates, priority/conflict handling, currency, status, and preview. Past transaction prices remain immutable. Overlapping or incomplete rules are blocked or explicitly resolved before activation.
- Outcomes and recovery: Draft, scheduled, active, paused, expired, and archived states are visible. Rollback creates a new effective version rather than rewriting history.
- Acceptance evidence: A future seasonal rate can be previewed and activated without changing existing confirmed bookings.
- Related: FR-PRC-002, FR-ADM-005, FR-GBL-008

### FR-PRC-002 — Produce an itemized quote

- Applications/surfaces: All
- Actors: Visitor, customer, rental agent
- Trigger and preconditions: Complete trip criteria and an available offer.
- Functional behavior and rules: Calculate and display base rental amount, rental duration basis, included and excess distance terms, taxes, mandatory fees, location or one-way charges, selected extras, protection products, discounts, amount due now, amount due later, refundable or releasable security amount, and estimated total in the transaction currency. Disclose assumptions and material exclusions. Give the quote an expiry or revalidation condition.
- Outcomes and recovery: If a price cannot be confirmed, show no false total; retain the trip and offer a retry or staff route. Expired quotes are recalculated and differences require acknowledgement.
- Acceptance evidence: The sum of visible line items equals the displayed total and matches the confirmed reservation snapshot.
- Related: FR-PRC-003, FR-PRC-007, FR-BKG-006

### FR-PRC-003 — Taxes, mandatory fees, deposits, and policy charges

- Applications/surfaces: All
- Actors: Customer, staff, manager
- Functional behavior and rules: Apply only currently valid charges for the rental's jurisdiction, location, dates, vehicle, renter eligibility, and selected services. Distinguish payable charges from refundable deposits or payment holds. Each charge has a stable code, localized label, applicability, calculation basis, effective period, and permitted override rule. Manual override requires authority and reason.
- Outcomes and recovery: If required charge configuration is missing or contradictory, confirmation is blocked and routed to an owner rather than guessing.
- Acceptance evidence: Deactivated fees cannot enter new quotes but remain identified on historical statements.
- Related: FR-PRC-001, FR-PAY-003, FR-ADM-010

### FR-PRC-004 — Discounts and promotion codes

- Applications/surfaces: All
- Actors: Visitor, customer, rental agent, manager
- Functional behavior and rules: Validate a promotion against dates, location, category, channel, customer eligibility, usage limits, minimum conditions, combinability, and status. Show the accepted discount and changed total before confirmation. Do not reveal private eligibility rules. Managers can create, pause, schedule, and review promotions within permission.
- Outcomes and recovery: Invalid, expired, exhausted, or inapplicable codes explain the safe reason category and allow correction/removal. Cancellation or modification applies the disclosed refund and repricing rules.
- Acceptance evidence: Repeated submission cannot exceed a promotion's permitted use and removing a code restores the correct total.
- Related: FR-PRC-002, FR-RSV-002, FR-ADM-005

### FR-PRC-005 — Optional equipment and services

- Applications/surfaces: All
- Actors: Customer, rental agent, manager, fleet staff
- Functional behavior and rules: Offer only extras available for the selected location, dates, category, stock, and eligibility. Show price, unit, quantity limits, key conditions, and whether confirmation is immediate or requested. Reserve constrained extra stock with the booking and release it on cancellation or expiry. Staff record issue and return condition where relevant.
- Outcomes and recovery: If an extra becomes unavailable, notify the owner, remove no item silently, and offer replacement, booking continuation without it, or cancellation under policy.
- Acceptance evidence: The same child seat or navigation unit cannot be promised beyond configured stock.
- Related: FR-BKG-006, FR-RNT-004, FR-ADM-006

### FR-PRC-006 — Protection products and coverage choices

- Applications/surfaces: All
- Actors: Customer, renter, rental agent, manager
- Functional behavior and rules: Present only protection products permitted for the location, vehicle, driver, and rental. Explain price, coverage summary, exclusions, responsibility or excess, included versus optional status, and required acknowledgement in plain language. Capture accept/decline decisions separately for each applicable product and preserve the terms version used. Staff cannot preselect optional products deceptively.
- Outcomes and recovery: Ineligible or unavailable products are removed with an explanation before commitment; prior total is recalculated and acknowledged.
- Acceptance evidence: The final agreement and price match the customer's recorded choices and applicable version.
- Related: FR-BKG-005, FR-RNT-009, FR-ADM-006

### FR-PRC-007 — Currency and rounding

- Applications/surfaces: All
- Actors: Customer, staff, finance staff
- Functional behavior and rules: Show the transaction currency before commitment and use consistent rounding for line items, taxes, totals, refunds, and adjustments. If display conversion is offered, label it as informational, identify the payable currency, and disclose that final conversion may be controlled by the payer's provider. Confirmed transaction amounts remain tied to their original currency.
- Outcomes and recovery: Unsupported currency combinations block payment and offer supported alternatives without changing the trip.
- Acceptance evidence: Quote, payment, receipt, refund, and finance record reconcile in the transaction currency.
- Related: FR-GBL-003, FR-PAY-001, FR-PAY-009

### 8.4 Checkout and reservation creation

### FR-BKG-001 — Start and resume checkout

- Applications/surfaces: APP-CWEB, APP-CMOB, APP-OPS
- Actors: Visitor, customer, rental agent
- Trigger and preconditions: The actor selects an available offer.
- Functional behavior and rules: Start checkout with the trip, offer, quote version, and selected language intact. Present the shortest valid sequence for renter details, eligibility, extras, price review, payment, and confirmation. The customer may sign in, register, or use configured guest checkout without losing progress. Saved progress may be resumed only while availability, policy, and price remain valid.
- Outcomes, exceptions, and recovery: Abandonment releases temporary inventory and does not create a confirmed reservation or capture unintended payment. Resume revalidates all consequential data and highlights changes.
- Acceptance evidence: Returning from sign-in or a recoverable payment challenge preserves entered details and current valid selections.
- Related: FR-IAM-001, FR-CAT-006, FR-BKG-004

### FR-BKG-002 — Pre-booking eligibility assessment

- Applications/surfaces: All
- Actors: Customer, renter, additional driver, rental agent
- Functional behavior and rules: Evaluate configured minimum/maximum age rules, licence type, issuing country, licence validity through return, required driving history where lawful, payment/renter relationship, geographic restrictions, category restrictions, and any permitted customer restrictions. Clearly distinguish preliminary online eligibility from final pickup verification. Do not request irrelevant evidence.
- Outcomes and recovery: Eligible proceeds; needs-review identifies the missing owner and next step; ineligible explains the applicable rule category and offers valid categories, dates, drivers, or support where available. A manager override is possible only for explicitly overridable rules and is audited.
- Acceptance evidence: The system cannot confirm a category that the declared primary driver is not allowed to rent.
- Related: FR-IAM-007, FR-RNT-003, FR-ADM-002

### FR-BKG-003 — Renter, payer, and additional-driver details

- Applications/surfaces: All
- Actors: Customer, renter, additional driver, rental agent
- Functional behavior and rules: Identify the reservation owner, primary renter, payer, and every additional driver without assuming they are the same. Collect only required details and consents, show who must appear at pickup, and apply per-driver eligibility and charges. If an additional driver must complete information separately, issue a secure request and show its status without exposing the owner's unrelated data.
- Outcomes and recovery: Removing a driver releases related optional charges but cannot leave the reservation without an eligible primary renter. Unfinished additional-driver information is visibly pending and governed by pickup policy.
- Acceptance evidence: Staff can distinguish a payer from an authorized driver and cannot hand over to an undeclared, ineligible person.
- Related: FR-IAM-007, FR-PRC-003, FR-RNT-003

### FR-BKG-004 — Reserve inventory during commitment

- Applications/surfaces: All
- Actors: Customer, rental agent
- Functional behavior and rules: Revalidate availability immediately before the payment or final commitment step. Convert a valid temporary hold into reserved capacity only as part of successful confirmation. For category bookings, reserve category capacity and assign a unit later; for exact-unit bookings, reserve the specified unit. The system must prevent capacity from falling below the configured safe level.
- Outcomes and recovery: Lost availability stops commitment, releases invalid holds, and offers transparent alternatives or retry. Staff override identifies displaced risk and requires authority and reason.
- Acceptance evidence: A payment success arriving after capacity loss cannot create an unfulfillable confirmed reservation; it enters controlled resolution and payment recovery.
- Related: FR-CAT-005, FR-CAT-006, FR-PAY-002

### FR-BKG-005 — Terms, disclosures, and consent

- Applications/surfaces: APP-CWEB, APP-CMOB, APP-OPS
- Actors: Customer, renter, rental agent
- Functional behavior and rules: Before confirmation, display the final trip, booking model, price, payment schedule, deposit/hold, cancellation and no-show rules, eligibility conditions, pickup documents, mileage, fuel/charge, geographic use, extras, protection choices, privacy notices, and material terms. Capture explicit acceptance of required terms and separate optional marketing consent. Preserve language, version, timestamp, and actor.
- Outcomes and recovery: Changed terms or price require refreshed review; declined required terms stop booking without trapping the user. Staff-assisted acceptance identifies whether the customer accepted directly or the staff recorded permitted offline evidence.
- Acceptance evidence: A confirmed reservation can reproduce the exact terms and choices accepted.
- Related: FR-PRC-002, FR-PRC-006, FR-BKG-006

### FR-BKG-006 — Confirm a reservation atomically

- Applications/surfaces: All
- Actors: Customer, rental agent, payment provider
- Preconditions: Eligibility is sufficient, terms accepted, price and availability valid, and required payment outcome obtained.
- Functional behavior and rules: Create one reservation reference, immutable booking snapshot, initial status, payment linkage, inventory commitment, policy versions, and customer/staff history as a single business outcome. Do not present confirmation until all required parts succeed. The confirmation identifies what is confirmed, what remains pending, pickup requirements, change/cancel route, and support route.
- Failure and recovery: If one part fails, do not leave a hidden confirmed booking. Reverse or release provisional inventory/payment as appropriate, show the resulting state, and place unresolved compensation in an owned operations queue.
- Acceptance evidence: A provider success combined with reservation-write failure results in a visible recovery case and no unexplained charge.
- Related: FR-BKG-004, FR-PAY-002, FR-INT-004

### FR-BKG-007 — Prevent duplicate reservations

- Applications/surfaces: All
- Actors: Customer, rental agent
- Functional behavior and rules: Detect repeated confirmation attempts and likely duplicate reservations using the same checkout intent, customer/driver, trip, and provider result. Return the existing reservation for exact repeats. For plausible but non-identical duplicates, warn and require an explicit permitted decision rather than silently blocking legitimate multiple rentals.
- Outcomes and recovery: Duplicate prevention never creates a second charge. An authorized staff resolution is recorded.
- Acceptance evidence: Double-clicking confirm or retrying after a timeout results in one booking reference and one intended payment.
- Related: FR-GBL-006, FR-PAY-004, FR-BKG-008

### FR-BKG-008 — Confirmation and booking communications

- Applications/surfaces: All
- Actors: Customer, rental agent, message provider
- Functional behavior and rules: Immediately show the confirmed reservation in the initiating surface and send enabled localized communications containing the reference, trip, vehicle/category promise, price summary, payment state, pickup requirements, policy links or attachments, and self-service route. Mask sensitive data. Communication delivery is separate from booking success.
- Outcomes and recovery: Delivery failure keeps the reservation confirmed, shows the message status to staff and customer where helpful, and permits safe resend or channel correction without duplicating the booking.
- Acceptance evidence: A failed email does not cancel a valid reservation, and a resend uses the same reference and current status.
- Related: FR-INT-002, FR-RSV-001, FR-GBL-005

### FR-BKG-009 — Guest reservation access and account linking

- Applications/surfaces: APP-CWEB, APP-CMOB, APP-OPS
- Actors: Guest customer, support staff
- Functional behavior and rules: When guest booking is enabled, provide secure access using the reservation reference plus configured identity verification. Expose only that guest's permitted reservation actions. Offer account creation or linking after verified ownership; linking must not merge unrelated customer records or expose other reservations.
- Outcomes and recovery: Failed verification reveals no reservation details and offers limited retry/support. An expired access session requires verification again.
- Acceptance evidence: Knowing a reservation reference alone is insufficient to view or change it.
- Related: FR-IAM-001, FR-IAM-002, FR-RSV-001

### FR-BKG-010 — Staff-assisted reservation creation

- Applications/surfaces: APP-OPS
- Actors: Rental agent, support staff, customer
- Functional behavior and rules: Authorized staff can search availability, quote, record renter/driver data, apply only permitted rates and overrides, capture the customer's terms acceptance, take or record permitted payment, and create a reservation on behalf of the customer. The record identifies channel and acting staff. Staff must not bypass non-overridable eligibility, payment, or availability rules.
- Outcomes and recovery: Incomplete assisted bookings remain draft or pending with owner and expiry; cancellation releases holds. The customer receives confirmation through an available channel.
- Acceptance evidence: A support agent can complete a phone booking while every override, consent, and payment outcome remains attributable.
- Related: FR-BKG-002, FR-BKG-005, FR-ADM-004

### 8.5 Payments, deposits, refunds, and disputes

### FR-PAY-001 — Present eligible payment methods

- Applications/surfaces: All
- Actors: Customer, rental agent, finance staff
- Functional behavior and rules: Show only payment methods allowed for the transaction currency, country/location, channel, renter/payer relationship, amount, deposit requirement, and configured risk rules. Explain when payment is due, whether a method supports a security hold, and whether the named payer must be present. Never expose stored full payment credentials to staff.
- Outcomes and recovery: If no method qualifies, explain the relevant condition and permitted alternatives without confirming the reservation.
- Acceptance evidence: A method that cannot support a required deposit is not represented as valid for pickup.
- Related: FR-PRC-007, FR-PAY-003, FR-BKG-003

### FR-PAY-002 — Collect the booking payment

- Applications/surfaces: All
- Actors: Customer, rental agent, payment provider
- Preconditions: Valid quote, availability, booking details, and accepted terms.
- Functional behavior and rules: Request the configured amount through the selected provider and represent pending, customer-action-required, authorized, captured, failed, cancelled, and unknown outcomes accurately. Confirm a reservation only when its configured payment condition is met. Payment references are linked to one booking intent.
- Outcomes and recovery: Failure or cancellation preserves the checkout when safe and permits retry or method change. An unknown timeout is reconciled before another charge attempt. Customer abandonment releases inventory under hold policy.
- Acceptance evidence: A provider timeout cannot produce both a hidden successful charge and a new duplicate charge.
- Related: FR-BKG-004, FR-BKG-006, FR-INT-001

### FR-PAY-003 — Security authorization or deposit

- Applications/surfaces: All
- Actors: Customer, renter, rental agent, finance staff, payment provider
- Functional behavior and rules: Calculate and disclose the required security amount separately from rental charges. At the configured lifecycle point, authorize a hold or collect a deposit using an eligible method. Record amount, currency, provider status, expiry where applicable, and linkage to the rental. Changes to vehicle, duration, protection, or risk re-evaluate the requirement before acceptance.
- Outcomes and recovery: Insufficient or unsupported authorization blocks handover or routes to a permitted alternative. At closeout, release, capture, apply, or refund only the justified amount and show any remaining balance.
- Acceptance evidence: A released hold is not reported as a refund, and additional charges are itemized before any permitted use of the security amount.
- Related: FR-PRC-003, FR-RNT-003, FR-RNT-015

### FR-PAY-004 — Payment failure, unknown state, and safe retry

- Applications/surfaces: All
- Actors: Customer, staff, payment provider
- Functional behavior and rules: Classify declined, customer-cancelled, authentication-required, expired, provider-unavailable, invalid-method, and unknown outcomes. Show customer-safe guidance while retaining staff-visible operational detail. Before retrying an unknown result, check the provider and internal record. Limit unsafe repeats and allow a different method where permitted.
- Outcomes and recovery: Terminal failure leaves no false confirmation. Unknown or inconsistent outcomes enter a reconciliation queue with owner, age, and safe next action.
- Acceptance evidence: Retrying after a lost response does not create an unlinked second capture.
- Related: FR-GBL-006, FR-PAY-009, FR-INT-004

### FR-PAY-005 — Payment receipt and ledger view

- Applications/surfaces: All
- Actors: Customer, rental agent, finance staff
- Functional behavior and rules: For each authorized, captured, refunded, reversed, disputed, or failed transaction, show a localized receipt or status record containing reference, date/time, amount, currency, purpose, booking/rental link, method summary, and resulting balance. Customers see only their own permitted records; staff views follow scope and masking rules.
- Outcomes and recovery: Receipt delivery failure does not alter payment. Regeneration uses authoritative transaction data and is marked as a copy where appropriate.
- Acceptance evidence: The sum and status of booking payments, return adjustments, and refunds explain the current reservation balance.
- Related: FR-PAY-007, FR-PAY-009, FR-RNT-015

### FR-PAY-006 — Cancellation refund

- Applications/surfaces: All
- Actors: Customer, rental agent, finance staff, payment provider
- Preconditions: A cancellation or reduction is accepted and the policy produces a refundable amount.
- Functional behavior and rules: Calculate the refundable amount from the preserved booking terms, consumed services, cancellation timing, and authorized overrides. Show the customer the breakdown before final cancellation when possible. Submit one refund against the eligible original payment and track pending, succeeded, failed, cancelled, or manual-review states.
- Outcomes and recovery: Refund failure does not reactivate the reservation; it creates an owned finance task and informs the customer of the pending resolution. A duplicate request returns the existing refund.
- Acceptance evidence: The cancelled booking, refund, retained fee if any, and remaining balance reconcile.
- Related: FR-RSV-003, FR-PAY-008, FR-GBL-006

### FR-PAY-007 — Rental adjustments and additional charges

- Applications/surfaces: APP-OPS; customer view on APP-CWEB and APP-CMOB
- Actors: Rental agent, finance staff, customer
- Functional behavior and rules: Record justified additions or credits for approved extensions, excess distance, fuel/charging difference, one-way change, late return, extra services, damage, cleaning, tolls, fines, or other configured items. Each adjustment requires evidence category, calculation basis, tax treatment, actor, and approval where needed. Notify the customer and expose dispute/contact options according to policy.
- Outcomes and recovery: Unsupported, duplicate, or over-limit charges are blocked or require approval. Reversal creates a linked counter-transaction; it does not erase history.
- Acceptance evidence: Every post-booking balance change is itemized and attributable.
- Related: FR-RNT-013, FR-RNT-015, FR-PAY-008

### FR-PAY-008 — Refund, reversal, and dispute management

- Applications/surfaces: APP-OPS; customer status where appropriate
- Actors: Finance staff, manager, customer, payment provider
- Functional behavior and rules: Authorized staff can review eligible amounts, issue full or partial refunds, reverse erroneous adjustments where possible, record external disputes, attach permitted evidence, and track deadlines and outcomes. The system prevents refunding more than the net captured eligible amount without an explicit supported exception.
- Outcomes and recovery: Provider rejection or inconsistent state enters review. Won, lost, withdrawn, refunded, and needs-evidence outcomes update the financial balance and audit history.
- Acceptance evidence: Two staff members cannot independently refund the same remaining amount.
- Related: FR-PAY-006, FR-PAY-009, FR-GBL-008

### FR-PAY-009 — Payment reconciliation

- Applications/surfaces: APP-OPS
- Actors: Finance staff, manager
- Functional behavior and rules: Compare reservations and rentals with provider transactions, deposits, captures, refunds, reversals, disputes, and settlements. Identify missing links, amount/currency mismatches, duplicates, stuck pending items, and provider-only or system-only transactions. Each exception has severity, owner, age, notes, and resolution status.
- Outcomes and recovery: Resolution may link, correct through a permitted transaction, mark explained, or escalate; it never deletes evidence. Closed exceptions retain the decision and actor.
- Acceptance evidence: Finance can account for every provider transaction or place it in an owned unresolved queue.
- Related: FR-PAY-004, FR-PAY-005, FR-RPT-004

### 8.6 Reservation self-service and lifecycle

### FR-RSV-001 — View reservations

- Applications/surfaces: APP-CWEB, APP-CMOB, APP-OPS
- Actors: Customer, rental agent, support staff
- Functional behavior and rules: Show upcoming, active-linked, completed, cancelled, expired, and no-show reservations according to access. Detail includes reference, status, trip, vehicle/category promise, drivers, extras, price, payment/refund state, pickup instructions, policy summary, history, and currently permitted actions. Sensitive data is masked.
- Outcomes and recovery: A missing or inaccessible reservation reveals no unrelated data and provides verified lookup or support routes.
- Acceptance evidence: Staff and customer see consistent status while each sees only role-appropriate detail.
- Related: FR-BKG-008, FR-RSV-007, FR-RNT-005

### FR-RSV-002 — Modify a reservation

- Applications/surfaces: All
- Actors: Customer, rental agent, support staff
- Preconditions: Reservation status and policy permit the requested change.
- Functional behavior and rules: Allow configured changes to dates/times, locations, category, driver, extras, contact data, and other permitted fields. Recheck eligibility, availability, policies, and full pricing. Show old versus new values, price difference, amount due/refundable, and changed terms before confirmation. Commit the inventory release and new allocation as one controlled outcome.
- Outcomes and recovery: If the new option fails, the original reservation remains unchanged. Provider or notification failure does not leave ambiguous inventory. Restricted changes route to staff.
- Acceptance evidence: A failed date change cannot lose the customer's original vehicle capacity.
- Related: FR-CAT-005, FR-PRC-002, FR-PAY-007

### FR-RSV-003 — Cancel a reservation

- Applications/surfaces: All
- Actors: Customer, rental agent, support staff
- Functional behavior and rules: Show cancellation eligibility, effective policy, retained charge, expected refund, released extras, and consequences before confirmation. Require a reason only where configured and never use it to block a permitted cancellation. On acceptance, set the terminal status, release inventory/extras, stop inappropriate reminders, initiate any refund, and send confirmation.
- Outcomes and recovery: Repeated cancellation returns the existing outcome. If refund or message processing fails, cancellation remains effective and follow-up is owned. After rental opening, use early-return/termination rules rather than reservation cancellation.
- Acceptance evidence: Cancelled capacity becomes available only after the cancellation commit and cannot still be picked up accidentally.
- Related: FR-PAY-006, FR-CAT-005, FR-INT-002

### FR-RSV-004 — Late pickup and no-show handling

- Applications/surfaces: All
- Actors: Customer, rental agent, manager
- Functional behavior and rules: Apply configured grace, contact attempts, guarantee conditions, and no-show policy in the rental location's time zone. Customers can report a delay or request a permitted pickup-time change. Staff see at-risk reservations and may extend the hold only with authority and availability. Marking no-show releases inventory and triggers disclosed financial treatment and notification.
- Outcomes and recovery: A customer arriving after release cannot be handed an unavailable unit; staff may quote a new valid alternative. Incorrect no-show marking can be reversed only through an audited correction that preserves financial history.
- Acceptance evidence: No-show status has a timestamp, actor/rule, inventory effect, payment effect, and next action.
- Related: FR-RSV-003, FR-RNT-001, FR-PRC-003

### FR-RSV-005 — Pending and expiring reservations

- Applications/surfaces: All
- Actors: Customer, rental agent, support staff
- Functional behavior and rules: Reservations awaiting payment, verification, approval, driver data, or another prerequisite must show the missing item, owner, deadline if applicable, inventory effect, and permitted actions. Expiry rules are configurable and produce a final state, inventory release, payment handling, and communication.
- Outcomes and recovery: Completed requirements move the reservation forward only after revalidation. Expired reservations are not silently revived; the user creates or accepts a new quote.
- Acceptance evidence: No pending reservation can hold inventory indefinitely without a visible rule and owner.
- Related: FR-BKG-010, FR-CAT-006, FR-PAY-004

### FR-RSV-006 — Authorized manual override

- Applications/surfaces: APP-OPS
- Actors: Manager, specifically authorized staff
- Functional behavior and rules: Allow overrides only for rules explicitly marked overridable, such as limited price, fee, time, or allocation exceptions. Before confirmation show impact on price, inventory, customer promise, and downstream work. Require reason and, above configured boundaries, separate approval. Non-overridable legal, safety, security, or provider constraints cannot be bypassed.
- Outcomes and recovery: Rejected approval leaves the prior state. Revocation creates a new audited action and any customer/payment effects are resolved explicitly.
- Acceptance evidence: Every override reports rule, old/new result, actor, approver where needed, and reason.
- Related: FR-GBL-008, FR-ADM-009, FR-PRC-003

### FR-RSV-007 — Reservation lifecycle history

- Applications/surfaces: All
- Actors: Customer, staff, auditor
- Functional behavior and rules: Maintain chronological events for creation, pending prerequisites, confirmation, modifications, assignment, pickup readiness, cancellation, no-show, rental opening, and completion linkage. Customer history uses clear business language; authorized staff history includes source, reasons, and before/after values.
- Outcomes and recovery: Corrections append a compensating event rather than rewriting past events. Exports respect masking and scope.
- Acceptance evidence: An investigator can reconstruct how the current reservation state was reached.
- Related: FR-GBL-005, FR-GBL-008, FR-RNT-005

### 8.7 Pickup, active rental, return, and closeout

### FR-RNT-001 — Pickup readiness and operations queue

- Applications/surfaces: APP-OPS; customer status on APP-CWEB and APP-CMOB
- Actors: Rental agent, fleet staff, customer
- Functional behavior and rules: Create a location-scoped readiness queue for upcoming pickups, highlighting vehicle assignment, cleaning/maintenance readiness, document or payment prerequisites, extras, customer arrival notes, and risk of delay. Owners can resolve tasks and record blockers. Customers receive only confirmed, useful readiness instructions and must not be told a vehicle is ready when blocking work remains.
- Outcomes and recovery: Unready bookings route to substitution, delayed pickup, customer contact, or escalation with owner and deadline.
- Acceptance evidence: Every pickup due soon has a visible readiness state and unresolved blocker owner.
- Related: FR-RSV-004, FR-RNT-002, FR-FLT-006

### FR-RNT-002 — Assign or substitute a vehicle unit

- Applications/surfaces: APP-OPS
- Actors: Rental agent, fleet staff, manager
- Preconditions: A reservation requires a unit and the candidate is eligible, available, at the correct location, and ready.
- Functional behavior and rules: Assign a specific unit to category capacity before or at pickup according to policy. Prevent overlapping assignments. If the reserved category cannot be supplied, offer an eligible substitute and show any customer, price, feature, protection, and operational impact. Upgrades, downgrades, and manual exceptions require the configured approval and customer acknowledgement when the promise changes.
- Outcomes and recovery: Reassignment releases the old unit only as the new assignment succeeds. No acceptable unit creates an owned service-recovery case with alternatives, refund/cancellation route, and communication.
- Acceptance evidence: One unit cannot be simultaneously assigned to overlapping open rentals.
- Related: FR-CAT-005, FR-FLT-003, FR-RNT-003

### FR-RNT-003 — Pickup identity, document, eligibility, and payment verification

- Applications/surfaces: APP-OPS; status/instructions on customer surfaces
- Actors: Renter, additional driver, rental agent, payment provider
- Functional behavior and rules: At pickup, verify the present renter, each required driver, original or accepted documents, licence validity, booking eligibility, accepted payment method, payer rules, security authorization/deposit, and any location-specific prerequisites. Record verified, failed, waived where legally permitted, or needs-review outcomes without storing unnecessary sensitive copies.
- Outcomes and recovery: Failure blocks handover and offers correction, eligible driver/category substitution, additional evidence, manager review, reschedule, or cancellation under the disclosed policy. An override is limited to configured non-safety rules.
- Acceptance evidence: Vehicle handover cannot complete while a non-waivable eligibility check is failed or missing.
- Related: FR-BKG-002, FR-IAM-007, FR-PAY-003

### FR-RNT-004 — Vehicle handover and rental agreement

- Applications/surfaces: APP-OPS; agreement/summary on customer surfaces
- Actors: Renter, rental agent, fleet staff
- Preconditions: Eligible renter, assigned ready vehicle, and required payment outcome.
- Functional behavior and rules: Record actual pickup date/time/location, unit, odometer, fuel or battery level, existing condition evidence, issued keys/equipment, extras, authorized drivers, selected protection, geographic/use restrictions, return instructions, emergency contact route, and final opening charges. Present the rental agreement in the renter's chosen supported language and capture required acknowledgement/signature.
- Outcomes and recovery: Disputed starting condition is corrected or escalated before handover. Aborted handover leaves the reservation/rental, inventory, and payment in explicit reconciled states.
- Acceptance evidence: Opening a rental produces a retrievable agreement and changes the vehicle to on-rent only once.
- Related: FR-RNT-002, FR-RNT-005, FR-FLT-006

### FR-RNT-005 — View and service an active rental

- Applications/surfaces: All
- Actors: Customer, renter, rental agent, support staff
- Functional behavior and rules: Show active rental reference, assigned vehicle, authorized drivers, planned return, current known balance, included usage terms, protection summary, support contacts, and available actions such as extension request, issue report, incident report, or return instructions. Distinguish an active rental from its original reservation and retain links between them.
- Outcomes and recovery: Actions unavailable because of status, policy, or connectivity explain why and provide the next valid route. Sensitive operational notes remain staff-only.
- Acceptance evidence: A customer can identify the active agreement and correct emergency/support path without relying on the old booking status.
- Related: FR-RNT-006, FR-RNT-008, FR-RNT-009

### FR-RNT-006 — Request and approve an extension

- Applications/surfaces: All
- Actors: Customer, rental agent, manager
- Functional behavior and rules: Accept a proposed new return date/time/location; re-evaluate future availability, downstream reservations, maintenance, rate, taxes/fees, eligibility, payment/deposit, and location hours. Show the price difference and changed terms. Customer self-service confirms only when all required checks pass; otherwise create a staff-owned request. Approved extensions update the agreement, expected return, availability, payment, and notifications together.
- Outcomes and recovery: Rejection leaves the current return obligation unchanged and explains alternatives. Payment or update failure cannot present approval; an unknown partial result enters reconciliation.
- Acceptance evidence: An extension that would conflict with the next reservation is rejected or resolved through an explicit reallocation workflow.
- Related: FR-CAT-005, FR-PAY-007, FR-FLT-005

### FR-RNT-007 — Early, late, and overdue return management

- Applications/surfaces: All
- Actors: Customer, rental agent, manager
- Functional behavior and rules: Customers can review return instructions and report a planned early or late return. The system calculates disclosed price effects under the active agreement and offers extension where eligible. Staff queues identify rentals approaching due, within configured grace, late, or overdue, with contact history and escalation owner. Overdue status affects availability and prevents conflicting assignment.
- Outcomes and recovery: Early return does not promise a refund unless policy allows it. Unapproved late return creates configured charges and escalation without silently extending the agreement.
- Acceptance evidence: Overdue status updates fleet availability and downstream conflict alerts immediately.
- Related: FR-RNT-006, FR-RNT-011, FR-PAY-007

### FR-RNT-008 — Breakdown and roadside assistance

- Applications/surfaces: All
- Actors: Customer, renter, support staff, fleet staff, external assistance provider if configured
- Functional behavior and rules: Provide a clear support route and capture safe location/contact details, vehicle, issue category, drivability status, and assistance need. Give a case reference, status, responsible party, and next instructions. Route urgent cases according to configured safety procedures without requiring the customer to diagnose the vehicle. Link costs and responsibility only after review under the agreement.
- Outcomes and recovery: Provider failure or loss of connectivity offers alternate contact and keeps the case visible. Resolution may be advice, dispatch, tow, repair, replacement, or rental termination.
- Acceptance evidence: Every reported breakdown has an owner, current status, customer communication, and final resolution.
- Related: FR-RNT-010, FR-FLT-005, FR-INT-005

### FR-RNT-009 — Accident, damage, theft, or other incident report

- Applications/surfaces: All
- Actors: Renter, rental agent, fleet staff, manager
- Functional behavior and rules: Let the renter or staff report an incident with time, place, people/authority references where appropriate, description, vehicle condition, and permitted evidence. Show immediate safety and contact instructions defined by the business. Preserve the report, assign severity/status/owner, mark vehicle availability appropriately, and link applicable protection and agreement terms without making an automatic liability conclusion.
- Outcomes and recovery: Incomplete reports remain pending with a follow-up route. Duplicate reports can be linked. Resolution may include vehicle continuation, replacement, recovery, maintenance/damage case, charge review, insurer handling, or closure.
- Acceptance evidence: Reporting an incident can immediately block an unsafe vehicle and notify responsible operations staff.
- Related: FR-PRC-006, FR-RNT-010, FR-FLT-006

### FR-RNT-010 — Replacement vehicle

- Applications/surfaces: APP-OPS; customer acknowledgement on customer surfaces where enabled
- Actors: Rental agent, fleet staff, manager, customer
- Functional behavior and rules: When a unit cannot continue, search eligible replacements using location, category promise, driver eligibility, availability, remaining dates, features, extras, and protection. Record old-unit return/recovery condition, new-unit handover condition, effective time, price treatment, agreement amendment, and customer acknowledgement. Inventory status changes must be coordinated.
- Outcomes and recovery: No replacement creates an owned service-recovery path such as alternate location, transport support where offered, early termination, or refund review. A failed transfer leaves neither unit ambiguously on rent.
- Acceptance evidence: Rental history clearly shows which unit was in use during each period.
- Related: FR-RNT-002, FR-RNT-008, FR-FLT-003

### FR-RNT-011 — Receive a vehicle return

- Applications/surfaces: APP-OPS; customer status on customer surfaces
- Actors: Renter, rental agent, fleet staff
- Functional behavior and rules: Record actual return time and location, receiving actor or after-hours method, odometer, fuel or battery level, keys/equipment, cleanliness, visible condition, and customer-reported issues. Compare against opening and subsequent condition evidence. Mark the rental returned-pending-inspection or an equivalent controlled state; do not make the unit bookable until readiness rules pass.
- Outcomes and recovery: Missing keys/equipment, location mismatch, disputed readings, or apparent new damage creates explicit tasks and potential adjustments, not silent closure.
- Acceptance evidence: Return ends active possession status but does not prematurely declare the unit available.
- Related: FR-RNT-012, FR-RNT-014, FR-FLT-006

### FR-RNT-012 — Return inspection and damage assessment

- Applications/surfaces: APP-OPS
- Actors: Fleet staff, rental agent, manager
- Functional behavior and rules: Perform or record the required inspection, compare with check-out condition, classify new findings using controlled categories, attach time-stamped evidence, estimate or record review status, and separate normal wear from charge-review candidates under policy. A second review or approval is required for configured severity or value thresholds.
- Outcomes and recovery: Uncertain or disputed findings remain under review with the vehicle's safe availability status explicit. Corrections preserve original evidence and reason.
- Acceptance evidence: A damage charge cannot be finalized without a linked inspection finding and permitted evidence/approval.
- Related: FR-RNT-009, FR-RNT-013, FR-FLT-006

### FR-RNT-013 — Calculate final adjustments

- Applications/surfaces: APP-OPS; customer statement on customer surfaces
- Actors: Rental agent, finance staff, customer
- Functional behavior and rules: Compare actual rental facts with the agreement and calculate additional time, excess distance, fuel/charge, location change, extras, damage, cleaning, missing items, tolls/fines, credits, taxes, and approved waivers. Show evidence and calculation basis. Separate immediately known items from later-posted items and disclose the later-charge policy.
- Outcomes and recovery: A disputed item can be placed under review without hiding undisputed balance. Duplicate or unsupported adjustments are blocked. Changes after customer review create an updated statement and notification.
- Acceptance evidence: Each final amount traces to an agreement term, actual recorded fact, or approved credit.
- Related: FR-PAY-007, FR-RNT-012, FR-RNT-015

### FR-RNT-014 — After-hours return

- Applications/surfaces: All
- Actors: Customer, renter, rental agent, fleet staff
- Functional behavior and rules: Where a location permits after-hours return, show exact drop-off, key/equipment, parking, evidence, time responsibility, and support instructions before return. Record customer check-in if offered, but state when possession/risk and inspection completion are recognized under policy. The next operating queue must surface every unattended return.
- Outcomes and recovery: Invalid location, inaccessible drop point, missing key confirmation, or reported issue gives an alternate contact route. The rental remains in the correct pending state until staff completes reception and inspection.
- Acceptance evidence: An after-hours return cannot disappear between customer acknowledgement and staff inspection.
- Related: FR-CAT-004, FR-RNT-011, FR-INT-002

### FR-RNT-015 — Close the rental and settle the account

- Applications/surfaces: All
- Actors: Rental agent, finance staff, customer, payment provider
- Preconditions: Return recorded and all immediately required reviews completed or explicitly deferred.
- Functional behavior and rules: Produce a final or interim statement, apply permitted captures/credits, update the security hold/deposit, record remaining balance, close operational tasks, update vehicle status, and send a localized statement. Later-posted charges remain linked to the closed rental and follow notice/dispute rules. Closed rental facts cannot be silently edited.
- Outcomes and recovery: Payment or release failure leaves the rental financially pending with owner and customer-visible status, without incorrectly keeping the vehicle on rent. A correction uses adjustments and revised statement.
- Acceptance evidence: Operational closure, vehicle availability, payment balance, deposit outcome, and customer document are mutually consistent.
- Related: FR-PAY-003, FR-PAY-005, FR-FLT-003

### FR-RNT-016 — Post-rental tolls, fines, claims, and lost property

- Applications/surfaces: APP-OPS; customer communication on customer surfaces
- Actors: Finance staff, support staff, fleet staff, customer
- Functional behavior and rules: Record later-received tolls, fines, damage claims, or found-property cases against the correct unit and rental period. Validate time and vehicle linkage, apply only disclosed administration/charge rules, preserve evidence, notify the customer, and provide payment or dispute/contact options. Lost property is tracked without exposing one customer's information to another.
- Outcomes and recovery: Unmatched items enter an investigation queue. Disputed or reversed items retain full history. Found property has storage, claimant-verification, return, disposal/expiry, and closure states according to configured policy.
- Acceptance evidence: A later charge cannot be assigned merely by current vehicle holder; it must match the responsible rental interval.
- Related: FR-PAY-007, FR-PAY-008, FR-GBL-008

### 8.8 Fleet, maintenance, inspections, and availability controls

### FR-FLT-001 — Manage vehicle units

- Applications/surfaces: APP-OPS
- Actors: Fleet staff, manager, administrator
- Functional behavior and rules: Create and maintain a unique unit record with fleet identifier, registration/plate, vehicle identification reference, make/model/year, category, location, ownership/lease status if used, energy type, odometer, operational status, key attributes, documents, and permitted notes. Prevent duplicate identifiers. Deletion is allowed only for unused erroneous drafts; operational units are retired or archived.
- Outcomes and recovery: Invalid category/location changes are blocked while assignments or rentals conflict. Corrections preserve audit history.
- Acceptance evidence: Every assigned rental unit is uniquely identifiable and historically traceable.
- Related: FR-FLT-002, FR-FLT-003, FR-GBL-008

### FR-FLT-002 — Manage bookable categories and catalogue content

- Applications/surfaces: APP-OPS; consumed by customer surfaces
- Actors: Manager, fleet staff, content administrator
- Functional behavior and rules: Manage stable category codes, localized names/descriptions, representative models, capacity, luggage guidance, transmission, doors, energy type, features, images, eligibility restrictions, display order, and active locations. A unit belongs to one valid operational category at a time. Public content changes are previewable by language.
- Outcomes and recovery: A category with future reservations cannot be destructively removed; it may be deactivated for new sales while remaining visible historically.
- Acceptance evidence: Customer catalogue labels and staff allocation rules reference the same category code.
- Related: FR-CAT-001, FR-CAT-003, FR-ADM-012

### FR-FLT-003 — Vehicle lifecycle and availability status

- Applications/surfaces: APP-OPS
- Actors: Rental agent, fleet staff, manager
- Functional behavior and rules: Use controlled states for draft, available, held/assigned, pickup-ready, on-rent, returned-pending-inspection, cleaning, maintenance, damage-review, transfer, unavailable, retired, and other approved states. Permit only valid transitions with required actor, reason, and linked work. A display label may be translated but the internal state remains stable.
- Outcomes and recovery: Illegal or conflicting transition is rejected with current state and corrective action. Emergency unavailability immediately affects sales and assignments.
- Acceptance evidence: A unit cannot be both available and on-rent or in maintenance.
- Related: FR-CAT-005, FR-RNT-004, state model in Section 11

### FR-FLT-004 — Vehicle location and transfer

- Applications/surfaces: APP-OPS
- Actors: Fleet staff, manager
- Functional behavior and rules: Record current, planned, and destination location; transfer dates; responsible person; status; odometer/fuel or charge where relevant; and impact on reservations. A planned transfer contributes to future availability only when feasible. Departure and arrival confirmations update custody and exceptions.
- Outcomes and recovery: Delay or cancellation recalculates affected availability and creates reassignment/contact tasks. A unit cannot be accepted at two locations simultaneously.
- Acceptance evidence: Future one-way demand and planned transfers do not overpromise the same unit.
- Related: FR-CAT-005, FR-RNT-002, FR-ADM-007

### FR-FLT-005 — Preventive and corrective maintenance

- Applications/surfaces: APP-OPS
- Actors: Fleet staff, manager
- Functional behavior and rules: Schedule maintenance by date, odometer, time, alert, or reported issue; assign owner/vendor where used; record work type, priority, expected duration, cost, documents, and completion evidence. Due or unsafe maintenance blocks availability according to policy. Completing work requires readiness decision and updated odometer/date triggers.
- Outcomes and recovery: Overdue work appears in escalation queues. Rescheduling shows reservation impact. Reopened work returns the unit to the appropriate unavailable state.
- Acceptance evidence: A unit with a safety-critical open task cannot be assigned through a manual availability change.
- Related: FR-RNT-008, FR-FLT-003, FR-FLT-007

### FR-FLT-006 — Inspection, damage, cleaning, and readiness history

- Applications/surfaces: APP-OPS
- Actors: Fleet staff, rental agent, manager
- Functional behavior and rules: Record inspection type, checklist, condition findings, photos/documents, odometer, fuel/charge, cleanliness, missing items, reviewer, timestamp, and readiness outcome at configured lifecycle points. Link findings across pre-rental, return, incident, maintenance, and repair records. Checklists and reason options come from controlled reference data.
- Outcomes and recovery: Incomplete or failed inspection blocks readiness and creates owned work. A corrected inspection preserves the earlier record.
- Acceptance evidence: Staff can compare the unit's condition immediately before and after a rental.
- Related: FR-RNT-004, FR-RNT-012, FR-GBL-004

### FR-FLT-007 — Manual availability block and release

- Applications/surfaces: APP-OPS
- Actors: Fleet staff, manager
- Functional behavior and rules: Authorized staff can block a category quantity or unit for a date/time range and reason such as maintenance, damage, internal use, regulatory restriction, transfer, or operational buffer. Before saving, show affected holds, reservations, assignments, and offers. Release or shorten a block re-evaluates availability but does not automatically confirm waiting demand unless that workflow is configured.
- Outcomes and recovery: A conflicting block requires resolution or authorized override with owned customer-impact tasks. Expired blocks close visibly.
- Acceptance evidence: Blocking an assigned unit immediately produces a reassignment alert rather than silently breaking the booking.
- Related: FR-CAT-005, FR-RNT-002, FR-GBL-008

### FR-FLT-008 — Fleet import, bulk update, and export

- Applications/surfaces: APP-OPS
- Actors: Fleet staff, administrator
- Functional behavior and rules: Authorized users may import or bulk-change supported fleet fields using a preview that validates identifiers, references, formats, duplicates, permissions, and active operational conflicts. Each row reports accepted, rejected, or unchanged result. High-risk fields require narrower permissions or individual workflow. Export respects location and data scope.
- Outcomes and recovery: Partial imports do not hide failures; retry can target failed rows without duplicating accepted units. Bulk rollback is performed through auditable corrective actions where supported.
- Acceptance evidence: An invalid category in one row does not corrupt or ambiguously skip the rest of the file.
- Related: FR-FLT-001, FR-GBL-008, FR-ADM-009

### FR-FLT-009 — Vehicle document and expiry tracking

- Applications/surfaces: APP-OPS
- Actors: Fleet staff, manager
- Functional behavior and rules: Track configured documents and obligations such as registration, inspection, insurance evidence, permits, and lease documents with effective/expiry dates, status, attachments, reminders, and applicability by location or vehicle. Expired critical items block availability according to policy.
- Outcomes and recovery: Missing or expiring items appear in queues and reports with owner. Renewals create a new period while retaining prior evidence.
- Acceptance evidence: An expired mandatory document cannot be hidden by changing the vehicle status to available.
- Related: FR-FLT-003, FR-FLT-005, FR-INT-002

### 8.9 Customers, staff, locations, and business configuration

### FR-ADM-001 — Search and manage customer records

- Applications/surfaces: APP-OPS
- Actors: Rental agent, support staff, manager, administrator
- Functional behavior and rules: Search using permitted identifiers and view a consolidated customer record containing verified contact details, preferences, drivers, reservations, rentals, balances, service cases, consent state, and relevant restrictions. Authorized corrections preserve transactional snapshots and audit history. Potential duplicates are reviewed before merge; merging requires verified identity and a reversible mapping record.
- Outcomes and recovery: No match supports creation only after duplicate checks. Ambiguous matches require refinement; sensitive detail remains masked until a record is deliberately opened by an authorized actor.
- Acceptance evidence: Staff can assist the correct customer without exposing a list of unrelated personal data.
- Related: FR-IAM-006, FR-IAM-008, FR-ADM-002

### FR-ADM-002 — Customer eligibility restriction and review

- Applications/surfaces: APP-OPS
- Actors: Manager, specifically authorized staff
- Functional behavior and rules: Record permitted restriction or review flags with category, scope, effective/expiry dates, evidence reference, reason, approver, customer-notification treatment, and review path. Restrictions may influence booking or pickup only as configured and lawful. Free-text notes alone cannot silently create a system-enforced denial.
- Outcomes and recovery: Expired restrictions stop applying but remain historical. Correction, appeal/review, and removal are audited. Customer-facing explanations disclose the appropriate rule category without exposing internal risk detail.
- Acceptance evidence: A restriction affects only its defined person, scope, and period and cannot be created by unauthorized support staff.
- Related: FR-BKG-002, FR-RNT-003, FR-GBL-008

### FR-ADM-003 — Unified reservation and rental search

- Applications/surfaces: APP-OPS
- Actors: Rental agent, support staff, manager, finance staff
- Functional behavior and rules: Search and filter reservations and rentals by reference, customer, driver, location, dates, vehicle/category, status, payment state, channel, and assigned staff where permitted. Results distinguish reservation from active rental and surface urgent blockers. Saved views may be private or role-shared according to permission.
- Outcomes and recovery: Large or partial result sets show active filters and export status. No result offers corrected search or verified guest lookup rather than revealing restricted data.
- Acceptance evidence: Staff can find an overdue rental from its plate or reservation reference and reach the permitted next action.
- Related: FR-RSV-001, FR-RNT-005, FR-ADM-004

### FR-ADM-004 — Operations queues and case ownership

- Applications/surfaces: APP-OPS
- Actors: Rental agent, fleet staff, finance staff, support staff, manager
- Functional behavior and rules: Provide role/location-scoped queues for upcoming pickup, unready vehicle, pending eligibility, failed/unknown payment, refund failure, extension request, overdue rental, incident, return inspection, reconciliation, expiring document, and integration failure. Each item shows priority, due/age, owner, dependencies, customer impact, status, and next valid actions.
- Outcomes and recovery: Assignment, escalation, snooze where permitted, resolution, reopening, and transfer preserve history. An item cannot be closed while a required downstream outcome remains unexplained.
- Acceptance evidence: Every partial or failed cross-system action created by this document appears in an owned queue until resolved.
- Related: FR-INT-004, FR-RNT-001, FR-PAY-009

### FR-ADM-005 — Pricing and promotion administration

- Applications/surfaces: APP-OPS
- Actors: Manager, administrator
- Functional behavior and rules: Provide one governed area for rate plans, seasons, discounts, promotions, taxes, fees, deposits, included usage, late/no-show/cancellation rules, one-way pricing, and override boundaries. Configuration supports draft, effective dates, preview scenarios, approval where required, and conflict detection. Authorized users can see which offers and reservations used a version.
- Outcomes and recovery: Invalid or incomplete configuration cannot become active. Pausing future use does not alter confirmed transaction snapshots.
- Acceptance evidence: A manager can preview a sample quote before publishing a new rate version.
- Related: FR-PRC-001, FR-PRC-003, FR-PRC-004

### FR-ADM-006 — Extras and protection administration

- Applications/surfaces: APP-OPS
- Actors: Manager, fleet staff, administrator
- Functional behavior and rules: Manage localized extras and protection products, applicability, pricing, stock behavior, quantity limits, included/excluded categories and locations, effective dates, terms versions, fulfilment steps, and active state. System-fixed legal/protection codes remain constrained where integrations or reporting depend on them. Historical selections retain the accepted label, price, and terms.
- Outcomes and recovery: Deactivation prevents new selection and identifies future affected reservations for resolution when fulfilment is no longer possible.
- Acceptance evidence: Public choices, fleet preparation, agreement content, and final charges use the same configured product version.
- Related: FR-PRC-005, FR-PRC-006, FR-GBL-004

### FR-ADM-007 — Location and operating-policy administration

- Applications/surfaces: APP-OPS
- Actors: Manager, administrator
- Functional behavior and rules: Manage locations, localized public content, addresses, coordinates where used, contact channels, time zone, operating and holiday hours, pickup/return instructions, after-hours capability, supported categories/services, one-way routes, payment methods, and location-specific policies within global boundaries. Changes show future reservation impact.
- Outcomes and recovery: Closure or material instruction change creates an impact list and owned communication/reaccommodation tasks. A location with history is archived, not erased.
- Acceptance evidence: New searches obey changed hours while existing customers receive appropriate updated instructions.
- Related: FR-CAT-004, FR-FLT-004, FR-INT-002

### FR-ADM-008 — Reference-data catalogue

- Applications/surfaces: APP-OPS
- Actors: Administrator, manager, authorized data steward
- Functional behavior and rules: List every business option set with stable type/code, classification, owner, consumer surfaces, editable fields, translations, order, status, usage count, effective dates if needed, and reason for read-only constraints. Configurable examples include cancellation reasons, incident categories, inspection finding types, equipment types, service-case reasons, and document types. System-fixed examples include protected lifecycle states, permission actions, payment outcome families, and externally mandated codes.
- Outcomes and recovery: Rename, deactivation, merge where supported, and replacement preserve historical meaning. Destructive deletion is blocked when used. Import changes are previewed.
- Acceptance evidence: No business dropdown is maintained as an invisible surface-specific list disconnected from the catalogue or entity owner.
- Related: FR-GBL-004, FR-ADM-012, FR-GBL-008

### FR-ADM-009 — Staff accounts, roles, permissions, and scope

- Applications/surfaces: APP-OPS
- Actors: Administrator, manager within delegated scope
- Functional behavior and rules: Invite, activate, suspend, and deactivate staff; assign one or more roles and location/business scopes; and manage explicit action permissions for viewing, creating, changing, approving, refunding, overriding, exporting, and administering sensitive data. Prevent self-escalation and preserve at least one authorized administrator. High-risk role changes require renewed verification and configured approval.
- Outcomes and recovery: Suspension ends future access without reassigning historical actions. Removing a role identifies owned open work for reassignment. Failed invitation can be resent without duplicate accounts.
- Acceptance evidence: A location agent cannot view another location or issue an unrestricted refund unless explicitly granted.
- Related: FR-IAM-003, FR-GBL-008, FR-ADM-004

### FR-ADM-010 — Business rules and policy configuration

- Applications/surfaces: APP-OPS
- Actors: Manager, administrator
- Functional behavior and rules: Configure organization-specific eligibility thresholds, hold duration, buffers, grace periods, cancellation/no-show treatment, deposit logic, extension rules, mileage, fuel/charge, after-hours, document, approval, and notification policies by permitted scope. Every policy has owner, effective period, version, precedence, default/fallback behavior, and impact preview. Fixed legal or safety constraints are visible but not freely editable.
- Outcomes and recovery: Overlap, gaps, or invalid precedence block activation. Emergency pause is explicit and audited. Past agreements retain their accepted policy version.
- Acceptance evidence: Staff can explain which policy version produced a decision for a given reservation.
- Related: FR-PRC-003, FR-RSV-006, FR-GBL-004

### FR-ADM-011 — Notification templates and event rules

- Applications/surfaces: APP-OPS
- Actors: Administrator, manager, authorized content editor
- Functional behavior and rules: Manage localized templates, enabled channels, trigger event, audience, timing, retry/escalation behavior, sender identity, required legal content, and variables. Preview with safe sample values and validate all supported languages before activation. Transactional messages cannot be disabled if doing so would leave a required flow without notice.
- Outcomes and recovery: Invalid variables or missing required translations block publishing. Version changes apply prospectively and remain traceable for sent messages.
- Acceptance evidence: A cancellation message uses the correct language, booking values, refund status, and current approved template.
- Related: FR-GBL-002, FR-INT-002, FR-ADM-012

### FR-ADM-012 — Translation catalogue and localized content

- Applications/surfaces: APP-OPS
- Actors: Administrator, translator/content editor
- Functional behavior and rules: View completeness and publish status by language for interface content, lookup labels, categories, extras, protection summaries, location content, policies, templates, receipts, and generated documents. Editors can draft, review, approve, publish, and retire translations according to role. The system highlights missing, outdated, and fallback content.
- Outcomes and recovery: Publishing cannot break stable internal codes. A rejected translation returns to draft with reviewer note. Fallback use is reportable.
- Acceptance evidence: Administrators can identify every customer-visible fallback before launching a language.
- Related: FR-GBL-002, FR-FLT-002, FR-ADM-011

### 8.10 Dashboards, reports, and exports

### FR-RPT-001 — Operational dashboard

- Applications/surfaces: APP-OPS
- Actors: Rental agent, fleet staff, finance staff, manager
- Functional behavior and rules: Show role- and location-appropriate summaries for today's pickups/returns, unready units, active/overdue rentals, available fleet, payment/refund exceptions, incidents, maintenance due, and open service cases. Every metric states its period, scope, freshness, and definition and links to the filtered underlying records.
- Outcomes and recovery: Unavailable or stale data is labeled; it is not rendered as zero. Users can refresh and retain scope.
- Acceptance evidence: The count of overdue rentals drills into the same records used to calculate it.
- Related: FR-ADM-004, FR-RPT-006, FR-GBL-005

### FR-RPT-002 — Revenue report

- Applications/surfaces: APP-OPS
- Actors: Finance staff, manager, auditor
- Functional behavior and rules: Report captured rental revenue, discounts, taxes, fees, extras, adjustments, refunds, disputes, and net amounts by permitted date basis, location, category, channel, and currency. Define whether dates refer to booking, pickup, return, capture, or settlement and prevent meaningless cross-currency totals without an approved conversion basis.
- Outcomes and recovery: Late adjustments update the appropriate report period and retain prior export traceability. Missing provider data is flagged.
- Acceptance evidence: Report totals reconcile to payment records for the same scope and definition.
- Related: FR-PAY-009, FR-RPT-004, FR-PRC-007

### FR-RPT-003 — Fleet utilization report

- Applications/surfaces: APP-OPS
- Actors: Fleet staff, manager, auditor
- Functional behavior and rules: Report available, reserved, on-rent, maintenance, damage, cleaning, transfer, and other time by unit/category/location using a documented denominator and time zone. Allow comparison across periods and drill-down to contributing intervals. Distinguish utilization from booking demand and from physical availability.
- Outcomes and recovery: Missing or overlapping state intervals are flagged as data-quality exceptions, not silently normalized.
- Acceptance evidence: A unit blocked for maintenance is not counted as rentable available time.
- Related: FR-FLT-003, FR-FLT-005, FR-RPT-006

### FR-RPT-004 — Booking and payment performance reports

- Applications/surfaces: APP-OPS
- Actors: Manager, finance staff
- Functional behavior and rules: Report bookings, conversion where measurable, modifications, cancellations, no-shows, extensions, rental completions, payment success/failure, refunds, and reconciliation exceptions by permitted dimensions. Metric definitions, filters, exclusions, and freshness are visible.
- Outcomes and recovery: A report with incomplete events shows the gap and affected period. Users may save common filter sets.
- Acceptance evidence: Cancellation rate numerator and denominator are explicitly defined and drillable.
- Related: FR-RSV-007, FR-PAY-009, FR-RPT-001

### FR-RPT-005 — Report export and scheduled delivery

- Applications/surfaces: APP-OPS
- Actors: Authorized staff, manager, auditor
- Functional behavior and rules: Export permitted filtered report data in supported formats and optionally schedule recurring delivery to verified authorized recipients. Show scope, time zone, currency, generated time, filters, and definitions. Large exports run as tracked jobs. Sensitive fields follow role and masking rules; scheduled delivery stops when recipient authorization is removed.
- Outcomes and recovery: Failed generation or delivery is visible with retry and owner. Expired download access requires regeneration. Cancelling a schedule stops future runs without deleting history.
- Acceptance evidence: An export contains the same scoped records as its on-screen report and cannot bypass row-level access.
- Related: FR-ADM-009, FR-RPT-006, FR-INT-002

### FR-RPT-006 — Data quality and audit reporting

- Applications/surfaces: APP-OPS
- Actors: Administrator, manager, auditor
- Functional behavior and rules: Report duplicates, missing required links, invalid lifecycle combinations, stale pending items, unmatched provider transactions, missing translations, overlapping policy/rate periods, incomplete inspections, and audit-sensitive actions. Each finding has severity, source, owner, status, first/last seen, and resolution evidence.
- Outcomes and recovery: Marking false positive or resolved requires reason and does not suppress new materially different occurrences.
- Acceptance evidence: Operational contradictions discovered by the system cannot disappear without an accountable resolution.
- Related: FR-GBL-008, FR-PAY-009, FR-ADM-012

### 8.11 Connected services and failure recovery

### FR-INT-001 — Payment-provider coordination

- Applications/surfaces: All
- Actors: Payment provider, customer, finance staff
- Functional behavior and rules: Send only the intended transaction amount/currency/purpose and associate returned provider references with the correct booking, rental, or refund. Accept delayed and repeated status updates safely, verify their authenticity, and apply only valid state transitions. Provider dashboard and system records are reconcilable.
- Outcomes and recovery: Unavailable, delayed, contradictory, or unmatched events enter the payment exception queue. Customer-facing states avoid claiming success before verified outcome.
- Acceptance evidence: A repeated provider event cannot duplicate a capture or refund.
- Related: FR-PAY-002, FR-PAY-004, FR-PAY-009

### FR-INT-002 — Email, SMS, and push coordination

- Applications/surfaces: All
- Actors: Message provider, customer, staff
- Functional behavior and rules: Send approved localized transactional messages for configured booking, payment, pickup, change, cancellation, return, incident, refund, and account events. Select only verified/permitted destinations, respect channel preference where optional, and record queued, sent, delivered where available, failed, suppressed, and retried states. Required messages may use an alternate permitted channel.
- Outcomes and recovery: Delivery failure never changes the underlying business action. Safe resend avoids duplicate confusing messages and uses current status where appropriate.
- Acceptance evidence: Staff can distinguish “booking failed” from “booking confirmed but message failed.”
- Related: FR-BKG-008, FR-ADM-011, FR-GBL-002

### FR-INT-003 — Mapping and location assistance

- Applications/surfaces: All where enabled
- Actors: Visitor, customer, staff, mapping provider
- Functional behavior and rules: Support address validation, location suggestions, directions, map display, or distance-based assistance only for configured uses. Clearly identify the selected rental location rather than treating a suggested address as confirmed. Staff can correct location data through the owning area. Routing or distance failure must not corrupt reservation facts.
- Outcomes and recovery: Provider failure falls back to stored addresses, written instructions, or manual entry where permitted. Ambiguous addresses require selection.
- Acceptance evidence: A map outage does not prevent a customer from viewing confirmed pickup instructions.
- Related: FR-CAT-004, FR-ADM-007, FR-GBL-003

### FR-INT-004 — Cross-system failure and compensation queue

- Applications/surfaces: APP-OPS with status on affected customer surfaces
- Actors: Staff, manager, connected services
- Functional behavior and rules: Detect partially completed multi-party actions such as paid-but-unconfirmed booking, confirmed-but-unallocated inventory, cancelled-but-unrefunded reservation, returned-but-financially-pending rental, or sent action with unknown provider result. Create one case with linked records, current facts, customer impact, owner, deadline, safe automated/manual actions, and retry history.
- Outcomes and recovery: Resolution completes, compensates, or explicitly escalates every side; it never marks success by hiding an inconsistency. Customer communication states only verified facts.
- Acceptance evidence: Every failure between systems ends in a consistent state or a visible owned case.
- Related: FR-BKG-006, FR-PAY-004, FR-ADM-004

### FR-INT-005 — External identity, assistance, and future integrations

- Applications/surfaces: All where configured
- Actors: External provider, administrator, authorized staff, customer
- Functional behavior and rules: For optional identity, roadside, or other future providers, define the purpose, consent, data shared, trigger, possible outcomes, expiry, manual fallback, and owning role before activation. External results inform but do not bypass non-delegable staff/legal responsibility. Administrators can pause an integration and see impacted flows.
- Outcomes and recovery: Timeout, cancellation, unavailable service, conflicting result, or later correction produces a clear pending/manual-review/fallback path. Repeated callbacks are safe.
- Acceptance evidence: Disabling an optional provider exposes a defined manual route rather than creating a dead end.
- Related: FR-IAM-005, FR-RNT-008, FR-ADM-004

## 9. Cross-Application Workflows

### FLOW-001 — Discover and confirm a rental

| Flow element | Required behavior |
| --- | --- |
| Entry | Visitor or customer supplies pickup/return location, dates, and times on web or mobile. |
| Action | System validates location hours, searches real-time availability, shows eligible offers, details, extras, terms, and an itemized quote. The user identifies renter/drivers, passes preliminary eligibility, accepts terms, and supplies payment. |
| Decisions | Availability still valid? Quote still valid? Driver eligible? Required payment outcome reached? Terms accepted? |
| Success | One confirmed reservation, inventory commitment, payment linkage, booking snapshot, visible confirmation, and delivery attempts. |
| Alternate | User registers/signs in, uses guest access if enabled, chooses a transparent alternative, changes payment method, or removes an unavailable extra. |
| Failure/recovery | Release temporary capacity; preserve safe checkout context; reconcile unknown provider outcome; create owned case for partial success. |
| Final state | Confirmed, pending-known-prerequisite, expired/abandoned, or failed-with-no-reservation. |
| Next actions | View, modify, cancel, complete pending item, prepare for pickup, retry from a refreshed quote, or contact support. |

Related requirements: FR-CAT-002–007, FR-PRC-002–007, FR-BKG-001–010, FR-PAY-001–004.

### FLOW-002 — Modify a reservation

| Flow element | Required behavior |
| --- | --- |
| Entry | Verified customer or authorized staff opens an eligible reservation. |
| Action | Choose changes; recheck availability, eligibility, price, payment, and terms; compare old and new; confirm. |
| Decisions | Change permitted? New capacity available? Price accepted? Additional payment/refund resolved to the required level? |
| Success | Original allocation is replaced safely, reservation snapshot/version advances, balance updates, and messages are sent. |
| Alternate | Keep original, choose another valid option, or route restricted change to staff. |
| Failure/recovery | Original reservation remains intact; partial provider actions enter reconciliation. |
| Final state | Confirmed-modified, unchanged, pending-resolution, or cancelled only through FLOW-003. |
| Next actions | View new details, modify again if allowed, cancel, or prepare for pickup. |

Related requirements: FR-RSV-002, FR-CAT-005, FR-PRC-002, FR-PAY-007, FR-INT-004.

### FLOW-003 — Cancel and refund a reservation

| Flow element | Required behavior |
| --- | --- |
| Entry | Verified customer or authorized staff selects cancel before rental opening. |
| Action | System calculates policy result, shows retained/refundable amounts, obtains confirmation, cancels, releases inventory/extras, initiates refund, and sends notice. |
| Decisions | Cancellation permitted? Fee/refund due? Approval required for exception? |
| Success | Reservation terminally cancelled; inventory released; financial outcome linked and visible. |
| Alternate | User keeps booking, modifies it, or requests staff review. |
| Failure/recovery | Refund/message failure does not undo cancellation; owned follow-up remains visible. |
| Final state | Cancelled with no refund, refund pending, partially refunded, refunded, or finance-review. |
| Next actions | Track refund, retrieve cancellation evidence, contact support, or make a new booking. |

Related requirements: FR-RSV-003, FR-PAY-006, FR-INT-002, FR-INT-004.

### FLOW-004 — Prepare and open the rental

| Flow element | Required behavior |
| --- | --- |
| Entry | Confirmed reservation approaches pickup at the responsible location. |
| Action | Staff resolve readiness, assign unit, verify renter/drivers/documents/payment/deposit, inspect starting condition, issue extras, present agreement, and capture acknowledgement. |
| Decisions | Unit ready? Acceptable substitute? Eligibility verified? Payment/deposit valid? Customer accepts changed promise if any? |
| Success | Rental opens once; assigned unit becomes on-rent; customer receives agreement and support/return instructions. |
| Alternate | Correct information, change eligible driver/category, substitute unit, reschedule, or obtain allowed approval. |
| Failure/recovery | No handover; reconcile reservation, inventory, and payment; apply disclosed cancellation/no-show/service-recovery path. |
| Final state | Active rental, pickup delayed/pending, no-show, cancelled, or service-recovery case. |
| Next actions | View active rental, request extension, report issue/incident, or follow return instructions. |

Related requirements: FR-RNT-001–005, FR-PAY-003, FR-FLT-006.

### FLOW-005 — Extend an active rental

| Flow element | Required behavior |
| --- | --- |
| Entry | Customer or staff proposes a later return or different permitted return location. |
| Action | Recalculate downstream availability, maintenance, price, deposit, eligibility, and terms; obtain approval/payment and customer confirmation. |
| Decisions | Capacity and maintenance permit? Price/payment accepted? Location permits route? Manual review needed? |
| Success | Agreement amendment, due time, fleet plan, payment, and notifications update consistently. |
| Alternate | Shorter extension, different return location/time, replacement arrangement, or original return obligation. |
| Failure/recovery | No false approval; original agreement remains; partial financial action enters reconciliation. |
| Final state | Active-extended, active-unchanged, or extension-request-pending. |
| Next actions | Continue rental under displayed due time or contact staff. |

Related requirements: FR-RNT-006, FR-CAT-005, FR-PAY-007, FR-INT-004.

### FLOW-006 — Incident, roadside help, and replacement

| Flow element | Required behavior |
| --- | --- |
| Entry | Customer or staff reports breakdown, accident, damage, theft, or another supported incident. |
| Action | Capture safe essential facts; create case; provide configured immediate instructions; assess drivability; dispatch or escalate; block unit if needed; determine continuation, recovery, repair, or replacement. |
| Decisions | Immediate safety escalation? Vehicle usable? Provider available? Replacement eligible and available? Further evidence/review required? |
| Success | Case has owner and resolution; fleet, rental, replacement, customer communication, and charge review are linked. |
| Alternate | Advice only, tow/repair, replacement from another location, or early termination/service recovery. |
| Failure/recovery | Use alternate contact/manual coordination; retain case and verified facts; never leave customer with an unowned provider failure. |
| Final state | Resolved-continued, resolved-replaced, resolved-terminated, or under-review. |
| Next actions | Continue, collect replacement, return vehicle, supply evidence, review adjustment, or dispute/contact support. |

Related requirements: FR-RNT-008–010, FR-FLT-003, FR-INT-005.

### FLOW-007 — Return and close the rental

| Flow element | Required behavior |
| --- | --- |
| Entry | Customer arrives at return point or follows approved after-hours process. |
| Action | Record actual return facts, receive custody, inspect, compare condition, calculate adjustments, settle payment/deposit, update vehicle readiness, and issue statement. |
| Decisions | After-hours? New finding? Review/approval needed? Additional payment/refund due? Unit ready, cleaning, maintenance, or damage-blocked? |
| Success | Possession ends, rental operationally and financially closes or has a clearly owned financial review, vehicle enters correct next state, customer gets statement. |
| Alternate | Disputed item under review, later-charge disclosure, early-return treatment, or replacement/incident linkage. |
| Failure/recovery | Payment/release failure does not keep vehicle falsely on rent; return/inspection uncertainty stays visible. |
| Final state | Completed, returned-financially-pending, damage/claim-review, or after-hours-pending-inspection. |
| Next actions | View statement, track refund/hold, respond to review, dispute a charge, or make another booking. |

Related requirements: FR-RNT-011–016, FR-PAY-003, FR-PAY-007–009.

### FLOW-008 — Fleet status change affects customer promises

| Flow element | Required behavior |
| --- | --- |
| Entry | Unit is blocked, damaged, overdue, transferred late, or made unavailable after being planned/assigned. |
| Action | Recalculate availability; identify affected holds/reservations/rentals; create reassignment and customer-contact tasks; find alternatives. |
| Decisions | Same-category replacement? Upgrade/downgrade? Other location/time? Customer consent or manager approval required? |
| Success | Every affected promise has valid replacement/allocation or accepted service recovery; catalogue and operations agree. |
| Failure/recovery | Do not hide overbooking; escalate with owner and customer-impact deadline. |
| Final state | Reassigned, customer-change-pending, cancelled/refunded, or unresolved-escalated. |
| Next actions | Confirm alternative, approve exception, contact customer, or complete refund. |

Related requirements: FR-FLT-003–007, FR-RNT-002, FR-ADM-004.

### FLOW-009 — Business configuration becomes customer behavior

| Flow element | Required behavior |
| --- | --- |
| Entry | Authorized user drafts a lookup, rate, fee, policy, location, product, translation, or template change. |
| Action | Validate scope/effective dates, preview outcomes and affected records, obtain approval when required, and activate a version. |
| Decisions | Complete and conflict-free? Editable or protected invariant? Existing reservations affected? Required translations present? |
| Success | New eligible actions use the active version; old transactions retain their accepted snapshot; all surfaces use the same stored source. |
| Failure/recovery | Block activation and show exact corrections; pause or supersede prospectively rather than rewriting history. |
| Final state | Draft, pending approval, scheduled, active, paused, expired, or archived. |
| Next actions | Edit, submit, approve, preview, pause, supersede, or inspect usage. |

Related requirements: FR-GBL-002–004, FR-ADM-005–012.

### FLOW-010 — Connected-service partial failure

| Flow element | Required behavior |
| --- | --- |
| Entry | Payment, message, map, identity, or assistance provider times out, repeats, contradicts, or partially succeeds. |
| Action | Preserve verified local facts, check returned provider state, prevent duplicate side effects, create exception case, and expose safe user status. |
| Decisions | Outcome known? Safe automatic retry? Compensation required? Manual/provider escalation required? Customer notice needed? |
| Success | All involved records reach a consistent result and the case closes with evidence. |
| Alternate | Manual fallback or business compensation with permission and reason. |
| Failure/recovery | Case remains owned, aged, and escalated; no false success or silent abandonment. |
| Final state | Reconciled-success, reconciled-failure/compensated, or unresolved-escalated. |
| Next actions | Retry, link, refund/reverse, complete manually, contact customer/provider, or escalate. |

Related requirements: FR-GBL-006, FR-PAY-004, FR-INT-001–005.

## 10. Business Rules

| Rule ID | Rule |
| --- | --- |
| BR-001 | The customer must always be told whether the reservation promises a category or a specific vehicle unit. |
| BR-002 | Exact fees, eligibility thresholds, hold durations, buffers, grace periods, and approval limits are configured by authorized users and versioned by effective period. |
| BR-003 | A confirmed reservation requires a valid price, sufficient availability, sufficient eligibility state, accepted terms, and the configured payment outcome. |
| BR-004 | A temporary checkout hold is not a reservation and must expire or convert under an explicit rule. |
| BR-005 | Availability must include confirmed demand, active/overdue rentals, temporary holds, maintenance, damage, cleaning, transfers, closures, and turnaround requirements. |
| BR-006 | A consequential action must revalidate current state; a stale page cannot authorize an invalid change. |
| BR-007 | The system must not create duplicate bookings, captures, refunds, assignments, or provider effects from repeated requests. |
| BR-008 | Modification must show and obtain acceptance for material differences before replacing the original promise. |
| BR-009 | A failed modification leaves the original confirmed reservation intact unless an explicit cancellation separately succeeds. |
| BR-010 | Cancellation after rental opening is not allowed; active-rental early-return or termination rules apply. |
| BR-011 | Cancellation remains effective even if its refund or message later fails; those failures become owned follow-up items. |
| BR-012 | A renter, payer, account owner, and additional driver are distinct roles even when one person fills several roles. |
| BR-013 | Preliminary online eligibility never replaces required pickup verification. |
| BR-014 | Legal, safety, security, and provider invariants cannot be bypassed by ordinary manual override. |
| BR-015 | A vehicle may have only one current custody/location state and no overlapping active rental assignments. |
| BR-016 | A returned vehicle is not available until configured inspection, cleaning, maintenance, and readiness gates pass. |
| BR-017 | Starting and returned condition, odometer, and fuel/battery facts must be recorded at the configured lifecycle points. |
| BR-018 | Additional charges and credits require a visible basis and linked agreement, event, evidence, or approved reason. |
| BR-019 | Transaction history is corrected through linked adjustments or reversals, not destructive rewriting. |
| BR-020 | Security authorization/hold is distinguished from captured payment and from a later refund. |
| BR-021 | Provider “unknown” is not treated as failure until safely checked, and is not retried in a way that can duplicate payment. |
| BR-022 | Communication delivery outcome never changes the underlying reservation, rental, or payment outcome. |
| BR-023 | Historical transactions retain the accepted price, policy, terms, product, lookup meaning, and language/version evidence. |
| BR-024 | Deactivated reference values cannot be selected for new records but remain readable on history. |
| BR-025 | Customer data access follows identity verification, purpose, role, location scope, and sensitivity. |
| BR-026 | Every partial workflow, exception, and pending state has a responsible owner, age/deadline where relevant, and next action. |
| BR-027 | Reports must disclose definition, time basis, time zone, scope, currency basis, filters, exclusions, and freshness. |
| BR-028 | The launch language list, default language, supported currencies, markets, locations, and legal policies are confirmed configuration decisions, not assumed in this baseline. |
| BR-029 | One-way rentals, after-hours returns, guest booking, exact-vehicle booking, saved payment options, external identity checks, and scheduled report delivery are enabled only where configured. |
| BR-030 | Customer-facing alternatives must disclose every changed trip, vehicle, price, distance, condition, or time value before selection. |

### 10.1 Reference and lookup ownership catalogue

| Catalogue / option set | Classification | Owner and edit behavior | Historical behavior |
| --- | --- | --- | --- |
| Rental locations and return routes | Entity-owned data | Location administration; managers edit permitted content/routes | Archived locations and prior route labels remain on transactions |
| Vehicle categories, makes/models, features | Entity-owned/constrained | Fleet/catalogue owners; codes and structural fields constrained when used | Prior category/model snapshot retained |
| Vehicle lifecycle states | System-fixed invariant | Read-only catalogue; labels translated, transitions protected | Stable code and historical label retained |
| Reservation, rental, payment, refund, incident, maintenance statuses | System-fixed invariant | Read-only catalogue; labels translated | Stable codes preserved |
| Rate plans, seasons, taxes, fees, deposits, discount/promotion types | Configurable or constrained business data | Pricing managers with effective dates and approval | Accepted financial snapshot never recomputed silently |
| Eligibility, cancellation, no-show, grace, hold, buffer, mileage, fuel/charge, after-hours, and extension policies | Configurable/constrained business data | Policy managers; non-overridable rules read-only | Agreement/booking keeps policy version |
| Payment methods and provider outcome mapping | Externally managed/constrained | Provider capability synchronized; business can enable safe subset | Original method summary/outcome retained |
| Countries, currencies, time zones, address subdivisions, licence types | Externally managed/system-fixed | Updated from governing authority; business enables supported subset | Stable standards code retained |
| Languages and locale formats | Constrained business data | Administrators enable supported languages; locale rules system-managed | Transaction language/version retained |
| Category, location, extra, protection, policy, message, document translations | Configurable business content | Authorized translators/editors; workflow controlled | Accepted/rendered version retained where material |
| Optional equipment/service types | Configurable business data | Product/fleet owners manage applicability, stock, order, translations | Deactivation preserves prior selection |
| Protection products and coverage codes | Constrained business data | Product/legal owner; descriptions/availability versioned, integration codes protected | Accepted terms/version retained |
| Cancellation, no-show, override, refund, adjustment, transfer, block, and service-case reasons | Configurable business lookup | Authorized data steward edits safe values/order/translations | Old reason remains readable; deactivated unavailable for new action |
| Incident, breakdown, damage, wear, cleaning, maintenance, inspection, and document types | Configurable/constrained lookup | Fleet/safety owner; unsafe structural changes constrained | Prior findings retain code/label |
| Inspection checklists and readiness outcomes | Constrained business configuration | Fleet owner versions checklist and applicability | Completed inspection retains version |
| Staff roles, permissions, approval actions | System-fixed permission actions plus configurable roles | Administrator composes roles from protected actions | Past actions keep actor/scope evidence |
| Notification events and delivery statuses | System-fixed invariant | Read-only event/status codes; templates/channels configurable | Sent event and template version retained |
| Report definitions and dimensions | Constrained | Report owner may configure views; core metric definitions versioned | Export records definition/version |
| Vehicles, customers, staff, reservations, rentals, payments, vendors/providers | Entity-owned data | Managed in owning areas, never duplicated as lookup arrays | Lifecycle/archive rules apply |

## 11. Lifecycle / State Models

### 11.1 Reservation lifecycle

| State | Meaning | Allowed next states / actions |
| --- | --- | --- |
| Draft checkout | Details entered; no reservation promise | Pending prerequisite, confirmed, abandoned/expired |
| Pending prerequisite | Known payment, verification, approval, or driver item remains | Confirmed, cancelled, expired, failed-resolution |
| Confirmed | Capacity and required commitment accepted | Modified-confirmed, pickup-ready, cancelled, no-show |
| Modified-confirmed | Confirmed with a newer accepted snapshot | Modified-confirmed, pickup-ready, cancelled, no-show |
| Pickup-ready | Operational prerequisites marked ready | Rental-opened, delayed/pending, cancelled, no-show |
| Rental-opened | Converted into an active rental | No reservation change/cancel; follow rental lifecycle |
| Cancelled | Terminal booking cancellation | Refund/finance follow-up may continue; new booking only |
| No-show | Terminal non-pickup under policy | Audited correction or new booking; finance follow-up |
| Expired/abandoned | Temporary hold/pending opportunity ended | New search/quote only |

Invalid examples: cancelled to confirmed without a new booking; rental-opened to modified reservation; expired hold directly to confirmed without revalidation.

### 11.2 Rental lifecycle

| State | Meaning | Allowed next states / actions |
| --- | --- | --- |
| Opening-pending | Pickup checks/handover in progress | Active, aborted/reservation resolution |
| Active | Vehicle handed over under current agreement | Active-extended, incident-review, replacement-in-progress, overdue, return-started |
| Active-extended | Active with amended due details | Further permitted extension, incident, overdue, return-started |
| Incident-review | Incident may affect continued use | Active, replacement-in-progress, return-started, terminated-review |
| Replacement-in-progress | Old/new unit transfer controlled | Active with replacement, terminated-review |
| Overdue | Return obligation passed without approved extension | Active-extended if approved, return-started, escalation |
| Return-started | Custody return recorded or being recorded | Returned-pending-inspection |
| Returned-pending-inspection | Possession ended; operational review incomplete | Financial-review, completed |
| Financial-review | Adjustments/payment/deposit unresolved | Completed, dispute follow-up |
| Completed | Operational rental closed | Later linked adjustment/dispute only; no factual rewrite |
| Terminated-review | Early termination/service recovery unresolved | Returned-pending-inspection, financial-review, completed |

### 11.3 Vehicle lifecycle

| State | Meaning | Allowed next states / actions |
| --- | --- | --- |
| Draft | Unit not operational | Available, unavailable, archived-error |
| Available | Eligible for sale/assignment | Held/assigned, transfer, cleaning, maintenance, damage-review, unavailable, retired |
| Held/assigned | Reserved for operational demand | Pickup-ready, available, unavailable/reassignment |
| Pickup-ready | Checked and prepared | On-rent, held/assigned, unavailable |
| On-rent | In customer custody | Returned-pending-inspection, incident/damage-review, replacement transfer |
| Returned-pending-inspection | Custody returned; readiness unknown | Cleaning, maintenance, damage-review, available |
| Cleaning | Cleaning work open | Available, maintenance, damage-review, unavailable |
| Maintenance | Maintenance work open | Available after readiness, unavailable, retired |
| Damage-review | Finding/repair decision open | Maintenance/repair, available, unavailable, retired |
| Transfer | Location movement in progress | Available, unavailable, maintenance/damage-review |
| Unavailable | Administrative/operational block | Available after valid release, maintenance, transfer, retired |
| Retired | No new operational use | Archived history only |

### 11.4 Payment and refund lifecycle

| Object | States and permitted direction |
| --- | --- |
| Payment | Created → action-required/processing → authorized → captured/partially captured; or failed/cancelled/expired. Unknown remains unresolved until checked. Captured amounts may lead to partial/full refund or dispute; history is not overwritten. |
| Security hold | Required → pending → authorized → adjusted/partially captured/released/expired/failed. Release is not a refund. |
| Refund | Requested → processing → succeeded/failed/cancelled/manual-review. Failed may retry safely; succeeded cannot succeed again for the same remaining amount. |
| Reconciliation case | Open → assigned/investigating → resolved-linked/resolved-compensated/resolved-explained, or escalated; reopening appends history. |

### 11.5 Maintenance, inspection, and incident lifecycle

| Object | States and permitted direction |
| --- | --- |
| Maintenance work | Draft → scheduled → in-progress → completed/closed; or cancelled. Failed completion/reopened returns to in-progress with history. |
| Inspection | Due → in-progress → passed/failed/needs-review. Failed or review produces linked work; correction creates a superseding result. |
| Incident | Reported → triaged → active-response/investigation → resolved-continued/resolved-replaced/resolved-terminated/closed. Reopening preserves prior closure. |
| Service case | Open → assigned → waiting-customer/waiting-provider/in-progress → resolved → closed; can reopen with reason. |

## 12. Functional Coverage Index

| Area | Requirement IDs | Count | Main coverage |
| --- | --- | ---: | --- |
| Global behavior | FR-GBL-001–008 | 8 | Cross-surface consistency, localization, lookup data, status, concurrency, accessibility, audit |
| Identity/profile | FR-IAM-001–008 | 8 | Registration, verification, access, recovery, external sign-in, profile, drivers, privacy |
| Catalogue/availability | FR-CAT-001–007 | 7 | Browse, search/filter, details, locations, availability, holds, alternatives |
| Pricing/offers | FR-PRC-001–007 | 7 | Rates, quote, fees/deposits, promotions, extras, protection, currency |
| Booking | FR-BKG-001–010 | 10 | Checkout, eligibility, roles, inventory, terms, confirmation, duplicate prevention, communications, guests, staff-assisted |
| Payments | FR-PAY-001–009 | 9 | Methods, collection, security, failure, receipts, refunds, adjustments, disputes, reconciliation |
| Reservation lifecycle | FR-RSV-001–007 | 7 | View, modify, cancel, no-show, pending/expiry, overrides, history |
| Rental lifecycle | FR-RNT-001–016 | 16 | Readiness, assignment, pickup, handover, active rental, extension, incident, replacement, return, closeout |
| Fleet | FR-FLT-001–009 | 9 | Units, categories, states, transfers, maintenance, inspection, blocks, bulk, documents |
| Administration | FR-ADM-001–012 | 12 | Customers, restrictions, operations, commercial/location/reference configuration, staff, localization |
| Reporting | FR-RPT-001–006 | 6 | Operations, revenue, utilization, booking/payment, exports, data quality |
| Integrations | FR-INT-001–005 | 5 | Payment, communications, mapping, compensation, optional providers |
| Total | All above | 104 | Complete declared functional baseline |

### 12.1 Cross-cutting edge-case coverage

| Edge category | Covered by |
| --- | --- |
| Empty/no results | FR-CAT-001, FR-CAT-007, FR-ADM-003 |
| Duplicate records/actions | FR-IAM-001, FR-BKG-007, FR-PAY-004, FR-ADM-001, FR-FLT-008 |
| Invalid/missing/expired input | FR-IAM-002, FR-IAM-007, FR-BKG-002, FR-RNT-003, FR-FLT-009 |
| Stale data/concurrent changes | FR-GBL-001, FR-GBL-006, FR-CAT-005, FR-RSV-002 |
| Unavailable resource/capacity | FR-CAT-005–007, FR-PRC-005, FR-RNT-002, FR-FLT-007 |
| Repeated/partial external actions | FR-GBL-006, FR-PAY-004, FR-INT-001, FR-INT-004 |
| Permission failure/override | FR-RSV-006, FR-ADM-009, FR-GBL-008 |
| User abandonment/expiry | FR-BKG-001, FR-CAT-006, FR-RSV-005 |
| Cancellation/reversal/refund | FR-RSV-003, FR-PAY-006–008, BR-019 |
| Cross-surface acknowledgement | FR-GBL-001, FR-BKG-008, FR-INT-002, FLOW-001–010 |
| Localization/RTL/Unicode | FR-GBL-002–003, FR-ADM-012 |
| Lookup rename/deactivation/history | FR-GBL-004, FR-ADM-008, Section 10.1 |
| Offline/provider failure | FR-PAY-004, FR-RNT-008, FR-INT-001–005 |
| Safety/operational block | FR-RNT-003, FR-FLT-003, FR-FLT-005–007 |

## 13. Input Traceability Matrix

### 13.1 Supplied functional capabilities

| Input ID | Supplied capability | Covered by |
| --- | --- | --- |
| IN-F-01 | Browse available cars with search and filters | FR-CAT-001–002, FR-CAT-005, FR-CAT-007 |
| IN-F-02 | View car details, pricing, and real-time availability | FR-CAT-003, FR-CAT-005, FR-PRC-002–003, FR-PRC-007 |
| IN-F-03 | Make bookings/reservations | FR-BKG-001–010, FLOW-001 |
| IN-F-04 | View, modify, and cancel reservations | FR-RSV-001–003, FR-PAY-006–007, FLOW-002–003 |
| IN-F-05 | Complete integrated payments | FR-PAY-001–009, FR-INT-001 |
| IN-F-06 | Registration, login, and profile management | FR-IAM-001–008 |
| IN-F-07 | Customer web and mobile support | APP-CWEB, APP-CMOB, FR-GBL-001–007 |
| IN-F-08 | Manage vehicle inventory, including add/update/delete/pricing | FR-FLT-001–009, FR-PRC-001, FR-ADM-005–006; operational history uses retire/archive rather than destructive deletion |
| IN-F-09 | Manage customer accounts and data | FR-ADM-001–002, FR-IAM-006–008 |
| IN-F-10 | View and manage all bookings | FR-ADM-003–004, FR-BKG-010, FR-RSV-001–007 |
| IN-F-11 | Process and track payments | FR-PAY-001–009, FR-RPT-002, FR-RPT-004 |
| IN-F-12 | Revenue, utilization, and booking reports | FR-RPT-001–006 |
| IN-F-13 | Shared services for frontend and mobile consumption | Functionalized as cross-surface record/action consistency in FR-GBL-001 and the same business capabilities on APP-CWEB/APP-CMOB; REST protocol is carried to the SRS |
| IN-F-14 | Third-party payment, mapping, email/SMS, and other integrations | FR-INT-001–005 |
| IN-F-15 | Secure authentication | FR-IAM-002–005, FR-ADM-009; JWT/OAuth mechanism is carried to the SRS |
| IN-F-16 | Authoritative database design and management | Functionalized as authoritative persistent records, history, and lifecycle behavior in FR-GBL-001, FR-GBL-005–006, FR-GBL-008; engine/schema choice is carried to the SRS |
| IN-F-17 | AWS deployment and hosting | Non-functional/technical constraint carried unchanged to the SRS; it does not create a user-visible functional requirement |

### 13.2 Supplied non-functional constraints

| Input ID | Supplied constraint | Functional relevance in this baseline | Later treatment |
| --- | --- | --- | --- |
| IN-NF-01 | Scalable backend/database architecture | No architecture specified here | Define measurable capacity/scaling targets in SRS |
| IN-NF-02 | Responsive and performant web/mobile | Core tasks exist on both customer surfaces; accessibility in FR-GBL-007 | Define device, responsiveness, and performance measures in design plan/SRS |
| IN-NF-03 | Clean, maintainable, modular code | None; outside functional scope | Define quality/architecture constraints in SRS/implementation |
| IN-NF-04 | Testing, debugging, optimization | Acceptance evidence exists for every FR | Define test levels, coverage, defect, observability, and performance criteria in SRS/implementation |
| IN-NF-05 | Secure user/payment data | Least access, masking, verification, audit, privacy, and provider boundaries in FR-IAM-002–008, FR-PAY-001–009, FR-ADM-009 | Define security/privacy controls and compliance evidence in SRS |
| IN-NF-06 | Reliable uptime/cloud deployment | Failure/recovery behavior in FR-INT-001–005 | Define availability, recovery, continuity, and AWS deployment targets in SRS |
| IN-NF-07 | Extend existing codebases | Functional boundaries and stable IDs support traceability | Assess repository constraints in SRS/implementation |

### 13.3 Supplied technology constraints

| Input ID | Constraint | Traceability disposition |
| --- | --- | --- |
| IN-T-01 | React.js, Next.js, TypeScript frontend | Preserve for SRS and implementation; no functional behavior added here |
| IN-T-02 | React Native mobile | Preserve for SRS and implementation; APP-CMOB defines its functional scope |
| IN-T-03 | Node.js with Express.js or NestJS | Preserve as an unresolved selection for SRS; do not choose here |
| IN-T-04 | PostgreSQL, MySQL, or MongoDB | Preserve as an unresolved selection for SRS; do not choose here |
| IN-T-05 | AWS EC2, S3, RDS, and related services | Preserve for SRS/deployment planning; exact service mix remains to be justified |
| IN-T-06 | JWT or OAuth authentication | Preserve as an unresolved mechanism; functional outcomes are FR-IAM-001–005 and FR-ADM-009 |
| IN-T-07 | Stripe or similar payments | Preserve as provider choice; business outcomes are FR-PAY-001–009 and FR-INT-001 |
| IN-T-08 | RESTful and third-party interfaces | Preserve for SRS; business interaction outcomes are FR-GBL-001 and FR-INT-001–005 |

### 13.4 Supplied MVP deliverables

| Input ID | Deliverable | Covered by |
| --- | --- | --- |
| IN-D-01 | Listings, search, filters, availability, pricing | FR-CAT-001–007, FR-PRC-001–007 |
| IN-D-02 | Booking and payment workflows | FR-BKG-001–010, FR-PAY-001–009, FR-RSV-001–007, FLOW-001–003 |
| IN-D-03 | Authentication and profile | FR-IAM-001–008 |
| IN-D-04 | Basic admin management | FR-FLT-001–009, FR-ADM-001–012, FR-RPT-001–006 |
| IN-D-05 | Deployed and running on AWS | Preserved as SRS/implementation/deployment constraint; acceptance measures must be defined there |

## 14. Confirmed Configuration Decisions Still Required

These are not functional gaps; the requirements define how the system handles them once the business selects values. They must be confirmed before the affected behavior is approved for release:

1. Launch countries/markets, rental locations, legal entities, and governing rental policies.
2. Launch languages, default/fallback language, RTL languages, currencies, and location time zones.
3. Category booking, exact-vehicle booking, or mixed model by market.
4. Guest booking and guest self-service policy.
5. Eligibility rules, accepted documents, payment/renter relationship, and manual-review boundaries.
6. Rate, tax, fee, deposit, cancellation, no-show, late return, extension, mileage, fuel/charging, and one-way policies.
7. Supported extras, protection products, stock rules, and terms owners.
8. Pickup/return, inspection, after-hours, incident, roadside, replacement, and lost-property procedures.
9. Payment provider, methods, pay-now/pay-later behavior, authorization/capture point, refund authority, and reconciliation ownership.
10. Email, SMS, push, map, identity, and roadside providers to enable at launch.
11. Staff roles, location scopes, approval limits, escalation owners, and audit retention policy.
12. Reporting definitions, scheduled-delivery policy, privacy obligations, and record-retention requirements.

Until confirmed, the system must treat these values as controlled configuration, use no invented operational number, and block release of any flow whose mandatory policy remains undefined.
