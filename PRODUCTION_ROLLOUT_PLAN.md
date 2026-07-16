# Customer QR Ordering and Production Hardening — Production Rollout Plan

## 1. Purpose and authority

This document is a verified release-readiness plan for Customer QR Ordering, the completed Work Package 1–3 changes merged into `main`, and the unmerged Work Package 4 candidate on Draft PR #8. It does not approve or perform a Production change.

Every approval in this plan is independent. Approval of an earlier PR, isolated UAT, or this document does not approve Authentication, Firestore, data/configuration, Hosting, smoke testing, or Production rollout.

## 2. Current release baseline

- Repository: `josurapatt/Greek-Yogert`
- Branch: `main`
- WP4 base on `main`: `b6e5c79c828fc699c5a5df62b1908b3c6a973c9d`
- Customer QR squash merge: `4bd879e7d0f5e5aff85ad675103d74700780e347`
- PR #4: Merged and closed
- Final Manual UAT: Passed
- Excel validation: Passed
- Known UAT defects: None
- Latest isolated UAT workflow: `29182431027`, successful
- Production project: `greek-yogert`
- Isolated UAT project: `greek-yogert-customer-uat-2026`
- Latest observed Production deployment remains the pre-Customer-QR Hosting deployment for SHA `4d5b6547cc02b83be821c90d2cfb473bc65b2a12`
- Production rollout: Not approved or performed
- Production Hardening Work Package 1 integrated branch: `main`
- Hardening implementation commit: `953c6f3bac5bd4424d0728a495fad46b2aeb6b1b`
- Approved PR #5 head: `aa2bf6d45d494d08ec40fe7e1013ea09a8fca9fe`
- PR #5: Approved, squash-merged, and closed
- Work Package 1 squash-merge commit: `4145a554ff428311a3c7e37b7c069a614fb77b3f`
- Latest isolated hardening UAT workflow: `29189257511`, successful
- Targeted hardening Manual UAT: Passed with no observed bugs
- Production Hardening Work Package 2 squash-merge commit: `241b17637b1b7e34e97b05f9bfceebf3b061d6fe`
- PR #6: Approved, squash-merged, and closed
- Latest isolated WP2 UAT workflow: `29218624822`, successful
- WP2 Targeted Manual UAT: Passed with no observed bugs
- Work Package 3 retained branch: `feature/trusted-customer-boundary`
- Work Package 3 PR #7: Approved, squash-merged, and closed
- Work Package 3 implementation commit: `ff09e330f8215865362ec9f2e6e1552c24200435`
- Work Package 3 latest verified implementation head: `9dd0751a04eec128e0d04a84c4549664038e4120`
- Work Package 3 approved PR head: `765e015779c696e03dee9e62905b5645307530f6`
- Work Package 3 squash-merge commit: `851ae86137733498c4c4ef7b0fdc94a5e0255726`
- Latest corrected WP3 isolated-UAT workflow: `29299876536`, successful
- WP3 Human-UAT defect: real Customer granola labels diverged from trusted reconstruction; fixed through one shared canonical label builder and automated-revalidated
- WP3 final Human Manual UAT: Passed 5/5 through the actual browser UI with no observed defects
- WP3 implementation and validation: Complete
- WP3 governance: Complete after exact-head approval, squash merge, and post-merge status update
- Work Package 4 branch: `feature/anonymous-abuse-controls`
- Work Package 4 Draft PR: [#8 — Harden anonymous ordering abuse controls](https://github.com/josurapatt/Greek-Yogert/pull/8)
- Work Package 4 final Human-UAT implementation head: `78cfffe524025c4a32ff5dfabdbfdca1d1056e5d`
- Work Package 4 final isolated-UAT workflow: `29503666183`, successful
- Work Package 4 Projection V2 fingerprint: `wp4-5c4fce122e7d5d4f`
- Work Package 4 Human-UAT defects and root causes: silent limit controls, inherited grid collapse, cleared status pointer, cooldown-only duplicate guard, concurrent Anonymous-UID initialization, and unclear capable-account workflow; corrected and automated-revalidated
- Work Package 4 implementation and consolidated automated isolated-UAT rehearsal: Complete (213 application tests, 22 Rules tests, responsive Settings controls, processing-only Customer Requests, Products-only availability control, synchronized two-tab browser UAT, exact cleanup, enabled Human-UAT baseline)
- Work Package 4 final Human UAT: Passed all 10 functional items
- Work Package 4 Customer Requests search-icon Human recheck: Passed
- Work Package 4 known defects: None
- Work Package 4 approval and merge: Pending
- Production changes during Work Package 4: None

The repository, not the live Production data, was inspected for application behavior and rules. Deployed Production rules and Authentication provider state must be captured in the Firebase Console immediately before release; this task did not read Production users, orders, or business data.

## 3. Executive readiness decision

### Authentication decision

**Required.** Anonymous Authentication is mandatory for the current Customer QR owner-UID model. Without it, `signInAnonymously` cannot establish a customer UID and `/order` cannot read the public menu or submit an owned request.

### Overall decision

**Not ready for Production deployment. Work Package 4 implementation, automated isolated UAT, and final Human UAT are complete, but explicit squash-merge approval, merge, WP5, and every Production prerequisite and approval remain pending.**

`main` uses a neutral, fail-closed `VITE_CUSTOMER_QR_ENABLED` setting and a separate environment/display mode. The safeguarded Production workflow explicitly builds with Customer QR disabled, while the isolated UAT workflow explicitly enables it. No Customer QR hardening Work Package has been deployed to Production.

### Mandatory prerequisites before rollout approval

1. Obtain explicit WP4 approval and merge, then separately approve the exact Emulator-tested Production-candidate rules; do not deploy them to Production without separate approval.
2. Inventory every legitimate Production Staff Auth UID and obtain separate approval before provisioning authorization documents administratively.
3. Obtain separate approval to execute the reviewed one-time projection process from current private Production products/settings to public collections. Do not use the UAT seed action.
4. Use the implemented reject-mismatch trusted confirmation boundary; do not silently recalculate or substitute Customer selections.
5. Preserve the merged exact Production project guard and disabled Customer QR build until separate Hosting and activation approvals are granted.
6. Obtain every separate approval listed in section 11.

## 4. Production and UAT configuration comparison

| Area                    | Production now                                                  | Customer QR UAT                                          | Release implication                                                                             |
| ----------------------- | --------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Firebase project        | `greek-yogert`                                                  | `greek-yogert-customer-uat-2026`                         | Identity must be verified at every step.                                                        |
| Hosting workflow        | Manual `workflow_dispatch`; Hosting only                        | PR/manual workflow; Hosting plus UAT rules/indexes       | Production workflow must remain manual and Hosting-only.                                        |
| Customer feature flag   | Production workflow build sets `VITE_CUSTOMER_QR_ENABLED=false` | UAT workflow sets `VITE_CUSTOMER_QR_ENABLED=true`        | Neutral fail-closed flag is merged; Production activation remains unapproved.                   |
| Customer labels/actions | Production environment mode removes UAT labels/actions          | `ทดลอง`, `Demo/UAT`, and `Seed เมนู UAT` remain visible  | Environment/display separation is merged into `main`.                                           |
| Staff Auth provider     | Existing Email/Password behavior must remain                    | Email/Password plus explicit `users/{uid}` authorization | Provider stays enabled; every Staff UID needs an authorization document before rules change.    |
| Customer Auth provider  | Current live state must be verified; approval is absent         | Anonymous enabled                                        | Anonymous is required but must be enabled only after safe rules are live.                       |
| Firestore rules source  | `firestore.rules`                                               | `firestore.production.rules` candidate via UAT config    | UAT validates the reviewed canonical candidate; Production deployment remains separately gated. |
| Firestore indexes       | No WP4 index change; any future deployment remains unapproved   | Six WP4 candidate indexes deployed and rehearsed         | Production index review/deployment is a separate gate.                                          |
| Public menu             | Not used by current Production build                            | `publicMenu/{productId}`                                 | Must be projected from current Production products before Hosting exposure.                     |
| Public availability     | Not used by current Production build                            | `publicSettings/toppingAvailability`                     | Must be initialized from current private settings.                                              |
| Customer requests       | Not used by current Production build                            | `customerOrderRequests/{requestId}`                      | Rules, staff subscription, and monitoring must be ready first.                                  |

## 5. Production Authentication

### Required behavior

- Customer `/order` calls `signInAnonymously` and uses the Firebase Auth UID as `ownerUid`.
- Public menu/settings reads require either an Anonymous Customer session or an exact active Staff authorization; unauthorized Email/Password accounts are denied.
- Request create/get authorization depends on matching `request.auth.uid` to `ownerUid`.
- Customer status access depends on the same anonymous session persisting in the browser.
- Existing Staff login remains Email/Password.
- A non-anonymous account is Staff only when `users/{uid}` has `role: "staff"` and `active: true` under the hardened rules/client.

### Can Customer `/order` work without Anonymous Authentication?

No, not with the current architecture. Failure to enable the provider causes anonymous sign-in to fail, leaves no customer UID, prevents public reads and submission, and produces a broken customer experience. Avoiding Anonymous Authentication would require a different identity/request-ownership architecture.

### Risks

- Anonymous account and request spam; Firestore rules do not provide rate limiting.
- Increased Auth/Firestore usage and operational noise.
- Existing anonymous sessions may remain valid after the provider is disabled; provider rollback is not an immediate session revocation.
- Enabling Anonymous while current Production `signedIn()` rules remain live would grant anonymous users private Staff collection access. This is a **Critical** stop condition.
- Staff can be locked out if explicit authorization documents are incomplete before hardened rules/Hosting are activated.

### Recommendation

Enable Anonymous Authentication only after:

1. Production-specific rules are approved, tested, and deployed;
2. all legitimate Staff authorization documents are verified;
3. public configuration is ready;
4. Production-safe feature/environment changes are approved;
5. abuse/cost monitoring and the smoke-test window are staffed.

## 6. Production Firestore rules

### Why current Production rules are unsafe for Anonymous Auth

Current `firestore.rules` treats every authenticated account as Staff-like. If Anonymous Authentication were enabled, anonymous users could read or write `products`, `orders`, `counters`, and private `settings`, and could read/write their own `users/{uid}` document. Anonymous must never be enabled while these rules are deployed.

### Required collection behavior

| Collection                          | Anonymous customer                                                        | Authorized Staff                                                | Required enforcement                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `publicMenu/{productId}`            | Read only                                                                 | Read/write                                                      | No private channel/payment data in projection.                                                                      |
| `publicSettings/{document}`         | Read only                                                                 | Read/write                                                      | Only approved public availability data.                                                                             |
| `customerOrderRequests/{requestId}` | Create owned pending request; get own request only; no list/update/delete | Get/list/update; no delete                                      | Owner UID, allowed keys, initial status/channel, immutable customer snapshot, and staff-controlled fields enforced. |
| `products/{productId}`              | Denied                                                                    | Read/create/update                                              | Delete denied; retain Production validation where applicable.                                                       |
| `orders/{orderId}`                  | Denied                                                                    | Read/create/update                                              | Delete denied; retain `validOrder`, status, immutable ID/date/created-at, item, and total validation.               |
| `counters/{businessDate}`           | Denied                                                                    | Read/create/update                                              | Queue assignment remains Staff-only and transactional.                                                              |
| `settings/{document}`               | Denied                                                                    | Read/create/update                                              | Private configuration remains Staff-only.                                                                           |
| `users/{uid}`                       | Denied                                                                    | Own authorization document may be read by non-anonymous account | All client create/update/delete/list operations denied. Authorization documents are admin-managed.                  |

### Customer request field enforcement

At creation, customers must be unable to set queue, payment, confirmation, rejection, or staff status fields. The allowed initial keys are:

- `id`
- `ownerUid`
- `status`
- `channel`
- optional `customerName`
- optional `customerNote`
- `items`
- `subtotal`
- `total`
- `itemCount`
- `createdAt`
- `updatedAt`

Required invariants include:

- document ID equals request `id`;
- `ownerUid == request.auth.uid`;
- status is initial pending status;
- channel is Storefront;
- non-empty item list and positive item count;
- numeric, non-negative totals;
- customers cannot list requests;
- customers cannot update/delete snapshots;
- only explicit Staff can confirm/reject, create orders, or update counters.

### Promotion decision

**Do not deploy a ruleset merely because it passed UAT. Use the reviewed canonical Production-candidate rules at an exact approved SHA.**

The Production-candidate ruleset must:

1. add UAT-tested customer isolation and explicit Staff authorization;
2. retain current Production `validOrder` and update invariants;
3. strengthen customer request numeric/shape validation where Firestore Rules can enforce it;
4. document customer item/price snapshots as untrusted input;
5. require the Staff confirmation path to revalidate or reprice against current private products before creating the authoritative order, or obtain explicit risk acceptance for manual Staff review;
6. receive full Emulator coverage before approval.

The WP4 candidate rules deeply validate the bounded Customer envelope and normalized child shape. Trusted Staff confirmation independently hydrates and verifies current private product configuration and monetary values before an authoritative order is created. Customer snapshots remain untrusted input; Production deployment is still a separate approval gate.

## 7. Production Firestore indexes

### Verified state

- WP4 defines six candidate indexes for bounded pending/history/monitoring queries.
- The indexes were deployed and exercised only in `greek-yogert-customer-uat-2026`.
- Production indexes were not read, deployed, or changed during WP4.
- Staff views and operational indicators use bounded queries and pagination; WP4 does not claim guaranteed real-time alerting.

### Decision

Production index deployment is a separate approval gate. Before any Production action, review the exact WP4 index candidate, capture the current Production index state, and approve the specific deployment and rollback evidence. Do not infer Production approval from the successful isolated-UAT deployment.

## 8. Production data and configuration

### Minimum required configuration

1. `users/{staffUid}` for every legitimate Staff account:
   - `role: "staff"`
   - `active: true`
2. `publicMenu/{productId}` for every current active/inactive Production product, projected through the approved public projection.
3. `publicSettings/toppingAvailability` containing the approved availability map, including the global separated-packaging key when an explicit state is desired.
4. Private `products/{productId}` may optionally receive explicit `supportsSeparatedToppingPackaging`; a missing value safely defaults to supported.

### Staff authorization inventory and provisioning

`PRODUCTION_STAFF_AUTHORIZATION_INVENTORY.template.md` is the blank, non-sensitive
procedure for a future separately approved Production authorization action. It
requires independently verified Staff Firebase Auth UIDs, exact `role: "staff"`
and boolean `active: true`, a second review, and storage of completed inventory
outside Git. WP2 did not read Production identities or create any authorization
documents.

### Compatibility defaults

- Missing per-product separated-packaging support defaults to `true`.
- Missing global separated-packaging availability defaults to available.
- Legacy order/cart snapshots missing packaging default to included packaging with zero surcharge.
- Existing users, orders, history, reports, and queue data do not require migration.
- No destructive migration is required.

### WP4 availability-control consolidation

- Products is the only Staff UI for changing product, topping, granola, and separated-packaging availability. Settings has no availability toggle.
- `settings/toppingAvailability.availability` remains active canonical runtime data because the Products transaction, public Projection V2, Customer menu, and trusted confirmation share it. It is not a second hidden control or a compatibility override.
- Do not delete or migrate this map during WP4. Existing confirmed and historical order snapshots remain durable and are never repriced or reinterpreted from current availability.
- Customer QR operational controls are under Settings at `/settings#customer-ordering`; Customer Requests contains only bounded request-processing work.

### One-time projection requirement

Existing Production products require a one-time projection refresh before Customer Hosting is exposed. Staff writes performed before Customer QR enablement did not synchronize public collections because synchronization is currently feature-flagged.

The projection must use current Production private product/settings values, be reviewed before write, be idempotent, and write only:

- `publicMenu/*`
- `publicSettings/toppingAvailability`

### Work Package 3 trusted confirmation and projection design

- Staff confirmation re-reads every referenced private product and the private availability setting in its existing atomic transaction, reconstructs Storefront-only lines, and rejects any product, option, label, availability, packaging, quantity, subtotal, item-count, or total mismatch.
- Rejection leaves the Customer request pending and creates no order or queue allocation. Confirmed historical snapshots are not repriced.
- `PublicCustomerProduct` contains only Customer-required identity, display, active state, Storefront price, option/topping/granola configuration, approved Storefront surcharge fields, and separated-packaging support. Platform pricing, channel rules, Staff rules, authorization data, and internal metadata are excluded.
- The projection runner has deterministic fingerprints, dry-run diff output, explicit stale-ID handling, atomic writes limited to `publicMenu/*`, `publicSettings/toppingAvailability`, and `publicProjectionControl/current`, and refuses apply without an exact reviewed fingerprint and typed confirmation.
- The Production projection workflow is manual-only, source-SHA-bound, exact-project-guarded, and has not run.
- In isolated UAT only, the existing GitHub deployer received project-scoped `roles/datastore.user`. Dry-run, reviewed atomic apply, and idempotency verification passed at `wp3-7fc7b4c5be82c3da`; no Production IAM or data was accessed or changed.
- Customer submission and trusted confirmation now derive displayed option labels from the same canonical builder; the exact option-ID, ordering, duplicate, price, availability, packaging, and mismatch checks remain unchanged.
- Corrected browser UAT `29299876536` created a request through the real Customer UI, confirmed it exactly once through Staff, verified Customer status and duplicate blocking, preserved the forged-price no-write control, traversed Queue/History/Reports, validated Excel, and completed temporary-data cleanup.
- Final Human Manual UAT passed 5/5: Customer submission, missing-payment guidance, valid confirmation into Queue, forged/stale mismatch rejection without an Order or queue write, and Queue/History/Reports/Excel. No defects were observed.
- The user approved exact PR head `765e015779c696e03dee9e62905b5645307530f6`, and PR #7 was squash-merged into `main` as `851ae86137733498c4c4ef7b0fdc94a5e0255726`. This merge did not approve or perform any Production action.

### UAT seed decision

**Do not use `Seed เมนู UAT` in Production.** It creates missing public documents from hard-coded default products, not from current Production products, and can expose stale prices/options. The UAT-labelled action must not be visible in Production.

No Production users, orders, history, requests, reports, or authorization documents should be copied from UAT.

## 9. Hosting deployment scope

### Current workflow

- File: `.github/workflows/deploy-firebase.yml`
- Trigger: manual `workflow_dispatch` only
- Project: supplied by Production environment secrets; currently checks only that Firebase and Vite project IDs match
- Build: standard Production Vite build
- Deployment: `firebase deploy --only hosting`
- Firestore rules/indexes: not deployed
- Authentication/data: not modified

### Implemented workflow hardening on `main`

The hardening branch now:

1. hard-check `FIREBASE_PROJECT_ID == greek-yogert`;
2. explicitly sets the neutral Customer QR flag to `false` for the safe Production build;
3. sets Production environment/display mode so UAT/demo labels and seed controls are unavailable;
4. keep deployment scope Hosting-only;
5. retain concurrency protection and explicit Production environment usage.

### Deployment-order decision

Hosting must be last. A Customer-enabled Hosting build deployed before rules, Staff authorization, Anonymous Auth, and public projections are ready would expose a broken or unsafe `/order` experience.

The workflow safeguards are merged into `main`. Production deployment and Customer QR activation remain separately prohibited without their own approvals.

## 10. Responsibility matrix and release sequence

### Prerequisite engineering cycle — before rollout approval

| Owner                     | Action                                                                                                                                                                                                     | Expected result                                                          | Stop condition                                                                                   | Rollback                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Codex, with User approval | Production release isolation Work Package 1 completed: Customer QR enablement, Staff authorization enforcement, UAT/Production display/seed behavior, and exact workflow guards were separated and merged. | Production-safe disabled build configuration without UAT labels/actions. | Completed; preserve the safeguards through later Work Packages.                                  | Revert only through a separately reviewed change; do not deploy Production. |
| Codex, with User approval | Create Production-specific rules merge and expanded Emulator tests.                                                                                                                                        | Anonymous isolation plus preserved Production order validation.          | Any anonymous access to private data or Staff lockout path.                                      | Do not deploy; revise rules/tests.                                          |
| Codex/User                | Define reviewed current-product projection procedure and Staff confirmation repricing decision.                                                                                                            | Idempotent public configuration and trusted authoritative order totals.  | Procedure uses hard-coded defaults or trusts forged customer prices without explicit acceptance. | Do not execute or deploy Hosting.                                           |
| User                      | Repeat isolated UAT for prerequisite changes.                                                                                                                                                              | Production-mode build behavior validated without touching Production.    | Any regression or unresolved security test.                                                      | Reject release candidate.                                                   |

### Production rollout sequence

| Step                        | Owner                                                        | Action                                                                                                                                                                                                                                         | Expected result                                                                                       | Stop condition                                                                                                    | Rollback action                                                                                                                   |
| --------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1. Capture                  | User / Firebase Console                                      | Record project ID, Auth providers, deployed rules source/version, index listing, current Hosting release, Staff Auth UID inventory, private product IDs, and private availability config. Arrange approved backup/export where policy permits. | Time-stamped pre-release evidence and rollback artifacts.                                             | Project identity, rules source, Staff list, or backup is incomplete.                                              | No change has occurred; stop.                                                                                                     |
| 2. Identity                 | User + Codex                                                 | Verify Console, CLI, workflow secrets, service account, and web app all identify `greek-yogert`; confirm no UAT credential is in Production.                                                                                                   | One unambiguous Production identity.                                                                  | Any mismatch or inaccessible evidence.                                                                            | Stop; correct configuration in a separately approved task.                                                                        |
| 3. Auth decision            | User / Firebase Console                                      | Approve Email/Password unchanged and Anonymous enablement timing; accept/mitigate anonymous abuse risk. Do not enable yet.                                                                                                                     | Written Authentication approval.                                                                      | Approval absent or abuse controls unacceptable.                                                                   | Keep Anonymous disabled.                                                                                                          |
| 4. Staff authorization data | User / Firebase Console or approved admin tool               | Create/verify `users/{uid}` only for every legitimate Staff UID.                                                                                                                                                                               | All Staff accounts have exact role/active fields; no client write path.                               | Missing/unknown Staff UID or unexpected authorization document.                                                   | Correct only the specific authorization documents from captured inventory.                                                        |
| 5. Rules                    | Codex prepares; User approves; Firebase CLI/Console executes | Deploy only the approved Production-specific rules and run read/write probes with an authorized Staff account and a controlled non-Staff account.                                                                                              | Staff continues operating; private collections reject non-Staff/anonymous access.                     | Staff lockout, anonymous private access, rule mismatch, or test failure.                                          | Keep Anonymous disabled. Redeploy captured previous rules only if safe; never restore broad rules while anonymous sessions exist. |
| 6. Index decision           | User + Codex                                                 | Review the exact six-index WP4 candidate, capture current Production index state, and separately approve the required deployment.                                                                                                              | Approved index scope and completed build evidence.                                                    | Scope differs, an index fails, or current state is unknown.                                                       | Stop; retain healthy existing indexes and correct the candidate in isolation.                                                     |
| 7. Public configuration     | User approves; approved admin procedure executes             | Project current private products and availability into public collections; verify document counts/IDs and sampled values.                                                                                                                      | Public price/options differ, defaults appear unexpectedly, or write scope exceeds public collections. | Restore captured public config only; do not delete unrelated data.                                                |
| 8. Anonymous Auth           | User / Firebase Console                                      | Enable Anonymous provider after hardened rules and public configuration are verified.                                                                                                                                                          | Anonymous sign-in succeeds; private access remains denied.                                            | Private access succeeds, sign-in errors, unexpected provider change, or usage spike.                              | Disable new anonymous sign-ins; keep hardened rules. Existing sessions may remain valid.                                          |
| 9. Hosting                  | User triggers GitHub Actions after final approval            | Run hardened manual Production Hosting workflow for the approved SHA.                                                                                                                                                                          | Hosting deploy succeeds to `greek-yogert` only.                                                       | Wrong SHA/project, failed build/tests, missing flag, or unexpected non-Hosting resource.                          | Cancel before deploy if possible. Roll Hosting back to captured release if deployment completed.                                  |
| 10. Smoke test              | User approves; User/Codex execute controlled checklist       | Staff and Customer critical paths pass with labelled test records.                                                                                                                                                                             | Isolation failure, duplicate order, wrong queue/price, broken legacy flow, or material error rate.    | Stop traffic/QR distribution; roll back Hosting; disable new Anonymous sign-ins if needed; retain hardened rules. |
| 11. Monitor                 | User                                                         | Monitor Auth sign-ups, request volume, Firestore reads/writes/denials, Hosting errors, duplicate requests/orders, queue sequence, and Staff support for the agreed window.                                                                     | Stable agreed metrics and no critical incident.                                                       | Abuse, cost spike, data isolation concern, or operational regression.                                             | Invoke the component-specific rollback below; do not delete business records.                                                     |

## 11. Explicit approval gates

Each checked box records only the specific approval granted by the User; every unchecked gate remains pending:

- [ ] Production rollout plan approved
- [x] Prerequisite architecture/hardening implementation approved
- [ ] Production Anonymous Authentication approved
- [ ] Production Firestore rules approved
- [ ] Production index no-op or deployment approved
- [ ] Production Staff authorization document actions approved
- [ ] Production public data/configuration projection approved
- [ ] Production Hosting deployment approved
- [ ] Production smoke test and labelled test-record creation approved
- [ ] Production monitoring window and rollback authority approved

## 12. Production smoke-test checklist

### Test marker and data policy

Use one unique marker such as `PROD-SMOKE-YYYYMMDD-HHMM` in customer/staff names or notes. Record the anonymous UID, request ID, resulting order ID, queue number, and timestamps in the release log. Never use real customer personal data.

Smoke testing creates Production data and therefore needs separate approval. Do not delete request/order/counter records afterward. Prefer cancelling labelled test orders so they remain auditable and are excluded from completed-sales revenue. Queue counter increments are permanent and are not rolled back.

### Read-only checks first

- [ ] Production URL loads the approved Hosting release.
- [ ] Existing Staff Email/Password login succeeds.
- [ ] Staff home, `/order`, Queue, History, Reports, Products, Settings, and Customer Requests load.
- [ ] Settings shows one collapsed `การควบคุม Customer QR` section; the direct anchor expands it; Customer Requests has no duplicate ordering controls; Products is the sole availability-control location.
- [ ] Customer `/order` opens customer ordering, not Staff login.
- [ ] A new anonymous session is created and its UID is recorded.
- [ ] Public menu and public availability load with sampled values matching the approved projection.
- [ ] Anonymous client cannot read/list private products, orders, settings, users, counters, or other customers' requests.
- [ ] Packaging visibility reflects global and per-product precedence without changing Production configuration.

### One controlled Customer request

- [ ] Add two low-value lines with approved packaging/options; verify Storefront pricing and no customer packaging surcharge.
- [ ] Submit with the smoke marker; record request ID.
- [ ] Verify Staff receives exactly one pending request.
- [ ] Verify customer status is pending with no queue/payment before confirmation.
- [ ] Confirm using two approved Staff payment methods to exercise mixed payment.
- [ ] Verify exactly one queue number and one active order are created.
- [ ] Verify customer status links to the confirmed order/queue.
- [ ] Verify Queue and order details preserve packaging and line payments.
- [ ] Cancel the labelled order after verification; do not delete it.
- [ ] Verify it appears in History and does not inflate completed-sales revenue.
- [ ] Verify Reports handle the cancelled mixed-payment record without double counting.
- [ ] Export Excel and verify the labelled row, packaging, channel, payment, and totals.

### One controlled legacy Staff order

- [ ] Create a direct Staff order using an existing legacy-compatible product/channel flow with the smoke marker.
- [ ] Verify normal channel/payment rules and packaging surcharge behavior.
- [ ] Verify Queue then cancel the labelled order and confirm History/Reports/Excel behavior.
- [ ] Do not delete the order or reverse the queue counter.

### Cleanup

- Keep Firestore smoke records as labelled, cancelled audit evidence.
- Do not bulk-delete or edit Production history/reports.
- Deleting the specifically recorded anonymous Auth user is optional and requires separate approval; it does not remove Firestore records and is not a rollback.
- Restore configuration only if the smoke test explicitly changed an approved captured value. The default smoke plan does not toggle availability or edit products.

## 13. Rollback plan

| Component                         | Reversibility                   | Rollback procedure                                                                                                                                                     | Important limitation                                                                                     |
| --------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Hosting                           | Immediate/fast                  | Roll back to the captured Firebase Hosting release or redeploy the last approved Production SHA. Stop QR distribution.                                                 | Does not undo Auth accounts, requests, orders, counters, or config writes.                               |
| Firestore rules                   | Fast but sequencing-sensitive   | Deploy the captured safe rules version. Keep hardened anonymous isolation unless Anonymous is disabled and existing sessions are addressed.                            | Restoring current broad `signedIn()` rules while anonymous sessions exist is unsafe and prohibited.      |
| Firestore indexes                 | Slow/asynchronous               | Leave healthy indexes in place during rollback unless a separately approved deletion is necessary. Capture exact pre/post state and wait for builds before activation. | Build/deletion takes time; deletion can break bounded queries and is not immediate.                      |
| Anonymous Authentication          | Partially reversible            | Disable the provider to block new anonymous sign-ins and investigate/revoke specific sessions/users through approved admin procedures.                                 | Existing tokens/sessions may remain valid; disabling is not full revocation. Hardened rules must remain. |
| Public configuration documents    | Reversible with captured values | Restore exact captured public documents using an approved idempotent admin procedure.                                                                                  | Client caches/listeners converge asynchronously; already-created requests/orders are not reverted.       |
| Staff authorization documents     | Reversible per UID              | Restore exact captured `role`/`active` state for the affected UID only.                                                                                                | Incorrect rollback can lock out Staff or grant access; never allow client self-service writes.           |
| Customer requests/orders/counters | Not rollback data               | Preserve records. Mark only approved smoke orders cancelled through normal application behavior.                                                                       | Deletion is not an acceptable rollback; queue increments remain consumed.                                |

### Safe emergency order

1. Stop QR distribution/customer traffic where operationally possible.
2. Roll Hosting back to remove the Customer entry point.
3. Disable new Anonymous sign-ins if the incident involves abuse or identity.
4. Keep hardened rules in place.
5. Restore only captured public configuration if necessary.
6. Investigate labelled records and metrics; do not delete Production business data.

## 14. Risk register

| Risk                                            | Rating       | Evidence/impact                                                                                          | Required control                                                                                       |
| ----------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Anonymous enabled with current Production rules | **Critical** | Any anonymous account would satisfy broad `signedIn()` Staff rules.                                      | Hardened rules must precede Anonymous Auth.                                                            |
| Deployment ordering                             | **Critical** | Customer-enabled Hosting before rules/Auth/config exposes an unsafe or broken flow.                      | Enforce sequence; Hosting last.                                                                        |
| Customer data isolation                         | **Critical** | Owner/list mistakes expose requests or private collections.                                              | Production-specific rules plus Emulator and live denial probes.                                        |
| Staff authorization migration                   | **High**     | Missing docs lock out Staff; bad docs grant Staff access.                                                | Complete UID inventory and admin-only exact documents before rules/Hosting.                            |
| Untrusted customer price/item snapshots         | **High**     | Forged client payload could become an authoritative order when Staff confirms.                           | Reprice/revalidate at Staff confirmation or explicitly accept/manual-review risk.                      |
| Anonymous spam/usage                            | **High**     | Identity rotation can bypass per-owner indicators; WP4 has no trusted backend rate limiter.              | Bounded indicators, manual review, emergency intake control, and WP5/App Check decision before launch. |
| Public menu synchronization                     | **High**     | Missing projection falls back to hard-coded defaults; stale prices/options may be submitted.             | Current-product projection, value sampling, atomic ongoing sync.                                       |
| Rollback complexity                             | **High**     | Auth sessions and created Firestore records are not removed by Hosting rollback.                         | Component rollback order; keep hardened rules; retain audit records.                                   |
| Stale availability/configuration                | **Medium**   | Customers may hold prior cart state.                                                                     | Submission-time reread/validation, listener monitoring, clear error path.                              |
| Legacy compatibility                            | **Medium**   | Old product/order fields may be missing.                                                                 | Existing defaults plus smoke checks for legacy Staff flow and exports.                                 |
| Bounded-query capacity                          | **Medium**   | Dashboard indicators and exports are intentionally bounded and may summarize only the configured window. | Document limits, rehearse pagination, and use logs/manual review for wider investigations.             |
| Duplicate order creation                        | **Low**      | Staff transaction rereads pending status and prevents repeated confirmation.                             | Retain transaction and monitor duplicate IDs/links.                                                    |
| Queue assignment                                | **Low**      | Counter/order/request update is one transaction.                                                         | Verify one queue in smoke test; never let customers access counters.                                   |
| Index readiness                                 | **Medium**   | Six candidate indexes passed isolated UAT but are not approved or deployed in Production.                | Review exact definitions and Production state, then approve and verify builds separately.              |

## 15. Unresolved decisions

1. Approve the exact Production execution of the implemented trusted-confirmation and public-projection boundary; isolated UAT evidence does not approve Production.
2. After WP4 Human UAT and merge, approve the exact Production-candidate rules deployment and Emulator/live denial tests; the WP4 candidate is still unmerged and was not deployed to Production.
3. Identify and approve every Production Staff UID authorization document.
4. Approve the one-time current-product/public-availability projection mechanism and review its dry-run output.
5. Verify actual Production Authentication providers and approve Anonymous enablement.
6. Accept the residual anonymous identity-rotation and cost risk after WP4 bounded indicators/control rehearsal; decide the WP5/App Check or trusted-backend mitigation before Production activation.
7. Approve the hardened Production Hosting workflow and exact release SHA.
8. Approve creation and retention of labelled Production smoke-test records.
9. Define monitoring duration, thresholds, and who has rollback authority.

## 16. Go/no-go rule

Production rollout is **No-Go** until every mandatory prerequisite and approval gate is complete. If any identity, authorization, rules, projection, pricing-integrity, workflow, or rollback fact is unclear, stop before changing Production.
