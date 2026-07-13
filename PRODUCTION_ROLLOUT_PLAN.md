# Customer QR Ordering and Production Hardening — Production Rollout Plan

## 1. Purpose and authority

This document is a verified release-readiness plan for Customer QR Ordering and the completed Work Package 1 and Work Package 2 changes merged into `main`. It does not approve or perform a Production change.

Every approval in this plan is independent. Approval of PR #4, PR #5, UAT, or this document does not approve Authentication, Firestore, data/configuration, Hosting, smoke testing, or Production rollout.

## 2. Current release baseline

- Repository: `josurapatt/Greek-Yogert`
- Branch: `main`
- Verified planning baseline: `ddfdf533311e3e2a49645c45373e2e79a645d23e`
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
- Work Package 3 branch: `feature/trusted-customer-boundary`
- Work Package 3 Draft PR: #7
- Work Package 3 implementation commit: `ff09e330f8215865362ec9f2e6e1552c24200435`
- Work Package 3 latest verified implementation head: `9273113577530cfb9ce3e75c6cd50ad7b5049f60`

The repository, not the live Production data, was inspected for application behavior and rules. Deployed Production rules and Authentication provider state must be captured in the Firebase Console immediately before release; this task did not read Production users, orders, or business data.

## 3. Executive readiness decision

### Authentication decision

**Required.** Anonymous Authentication is mandatory for the current Customer QR owner-UID model. Without it, `signInAnonymously` cannot establish a customer UID and `/order` cannot read the public menu or submit an owned request.

### Overall decision

**Not ready for Production deployment. Work Package 3 is implemented on a Draft PR, projected and automated-validated only in isolated UAT, and still awaits reduced human Manual UAT and PR approval. Every Production prerequisite and approval remains pending.**

`main` now uses a neutral, fail-closed `VITE_CUSTOMER_QR_ENABLED` setting and a separate environment/display mode. The safeguarded Production workflow explicitly builds with Customer QR disabled, while the isolated UAT workflow explicitly enables it. No Work Package 1 change was deployed to Production.

### Mandatory prerequisites before rollout approval

1. Separately approve and deploy the merged Emulator-tested Production-candidate rules; do not deploy them to Production without separate approval.
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
| Firestore indexes       | Live CLI check: no indexes/overrides                            | Live CLI check: no indexes/overrides                     | No index deployment is currently required.                                                      |
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

The merged ruleset must:

1. add UAT-tested customer isolation and explicit Staff authorization;
2. retain current Production `validOrder` and update invariants;
3. strengthen customer request numeric/shape validation where Firestore Rules can enforce it;
4. document customer item/price snapshots as untrusted input;
5. require the Staff confirmation path to revalidate or reprice against current private products before creating the authoritative order, or obtain explicit risk acceptance for manual Staff review;
6. receive full Emulator coverage before approval.

The current UAT rules prevent customer snapshot mutation but do not deeply validate every cart item or prove that customer-submitted prices equal current private prices. This is a **High** financial-integrity risk for Production confirmation.

## 7. Production Firestore indexes

### Verified state

- Repository `firestore.indexes.json`: no composite indexes or field overrides.
- Live Production index listing for `greek-yogert`: none.
- Live UAT index listing for `greek-yogert-customer-uat-2026`: none.
- Merged query inventory uses collection subscriptions/reads and client-side filtering/sorting; no compound `where` plus `orderBy` query was found.

### Decision

No Firestore index deployment is required for the current Customer QR release. The index approval gate should explicitly approve **no index change**.

Do not include `firestore:indexes` in a release command merely for symmetry. Reinspect indexes if prerequisite implementation changes introduce server-side filters, ordering, or collection-group queries.

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
| 6. Index decision           | User + Codex                                                 | Confirm query inventory still needs no indexes. Deploy none.                                                                                                                                                                                   | Approved no-op index decision.                                                                        | New compound query appears.                                                                                       | Design/test required index before continuing.                                                                                     |
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

| Component                         | Reversibility                   | Rollback procedure                                                                                                                             | Important limitation                                                                                     |
| --------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Hosting                           | Immediate/fast                  | Roll back to the captured Firebase Hosting release or redeploy the last approved Production SHA. Stop QR distribution.                         | Does not undo Auth accounts, requests, orders, counters, or config writes.                               |
| Firestore rules                   | Fast but sequencing-sensitive   | Deploy the captured safe rules version. Keep hardened anonymous isolation unless Anonymous is disabled and existing sessions are addressed.    | Restoring current broad `signedIn()` rules while anonymous sessions exist is unsafe and prohibited.      |
| Firestore indexes                 | Slow/asynchronous               | No index change is planned. If later added, leave a healthy index in place during rollback unless a separately approved deletion is necessary. | Build/deletion takes time; deletion can break queries and is not immediate.                              |
| Anonymous Authentication          | Partially reversible            | Disable the provider to block new anonymous sign-ins and investigate/revoke specific sessions/users through approved admin procedures.         | Existing tokens/sessions may remain valid; disabling is not full revocation. Hardened rules must remain. |
| Public configuration documents    | Reversible with captured values | Restore exact captured public documents using an approved idempotent admin procedure.                                                          | Client caches/listeners converge asynchronously; already-created requests/orders are not reverted.       |
| Staff authorization documents     | Reversible per UID              | Restore exact captured `role`/`active` state for the affected UID only.                                                                        | Incorrect rollback can lock out Staff or grant access; never allow client self-service writes.           |
| Customer requests/orders/counters | Not rollback data               | Preserve records. Mark only approved smoke orders cancelled through normal application behavior.                                               | Deletion is not an acceptable rollback; queue increments remain consumed.                                |

### Safe emergency order

1. Stop QR distribution/customer traffic where operationally possible.
2. Roll Hosting back to remove the Customer entry point.
3. Disable new Anonymous sign-ins if the incident involves abuse or identity.
4. Keep hardened rules in place.
5. Restore only captured public configuration if necessary.
6. Investigate labelled records and metrics; do not delete Production business data.

## 14. Risk register

| Risk                                            | Rating       | Evidence/impact                                                                                        | Required control                                                                        |
| ----------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Anonymous enabled with current Production rules | **Critical** | Any anonymous account would satisfy broad `signedIn()` Staff rules.                                    | Hardened rules must precede Anonymous Auth.                                             |
| Deployment ordering                             | **Critical** | Customer-enabled Hosting before rules/Auth/config exposes an unsafe or broken flow.                    | Enforce sequence; Hosting last.                                                         |
| Customer data isolation                         | **Critical** | Owner/list mistakes expose requests or private collections.                                            | Production-specific rules plus Emulator and live denial probes.                         |
| Staff authorization migration                   | **High**     | Missing docs lock out Staff; bad docs grant Staff access.                                              | Complete UID inventory and admin-only exact documents before rules/Hosting.             |
| Untrusted customer price/item snapshots         | **High**     | Forged client payload could become an authoritative order when Staff confirms.                         | Reprice/revalidate at Staff confirmation or explicitly accept/manual-review risk.       |
| Anonymous spam/usage                            | **High**     | Unlimited anonymous accounts/requests can increase cost and operational load; no current rate limiter. | Usage alerts, monitoring, operational rejection, and mitigation decision before launch. |
| Public menu synchronization                     | **High**     | Missing projection falls back to hard-coded defaults; stale prices/options may be submitted.           | Current-product projection, value sampling, atomic ongoing sync.                        |
| Rollback complexity                             | **High**     | Auth sessions and created Firestore records are not removed by Hosting rollback.                       | Component rollback order; keep hardened rules; retain audit records.                    |
| Stale availability/configuration                | **Medium**   | Customers may hold prior cart state.                                                                   | Submission-time reread/validation, listener monitoring, clear error path.               |
| Legacy compatibility                            | **Medium**   | Old product/order fields may be missing.                                                               | Existing defaults plus smoke checks for legacy Staff flow and exports.                  |
| Full-collection subscriptions                   | **Medium**   | Request/order growth increases reads and client-side processing.                                       | Monitor volume; plan indexed/paginated queries before scale requires them.              |
| Duplicate order creation                        | **Low**      | Staff transaction rereads pending status and prevents repeated confirmation.                           | Retain transaction and monitor duplicate IDs/links.                                     |
| Queue assignment                                | **Low**      | Counter/order/request update is one transaction.                                                       | Verify one queue in smoke test; never let customers access counters.                    |
| Index readiness                                 | **Low**      | No compound queries and both environments currently have no indexes.                                   | Reinspect after any query architecture change.                                          |

## 15. Unresolved decisions

1. Approve the exact Production execution of the implemented trusted-confirmation and public-projection boundary; isolated UAT evidence does not approve Production.
2. Approve the exact Production-candidate rules deployment and Emulator/live denial tests; the candidate is merged but not deployed.
3. Identify and approve every Production Staff UID authorization document.
4. Approve the one-time current-product/public-availability projection mechanism and review its dry-run output.
5. Verify actual Production Authentication providers and approve Anonymous enablement.
6. Accept or mitigate anonymous spam/cost risk; decide whether App Check or another hardening cycle is required.
7. Approve the hardened Production Hosting workflow and exact release SHA.
8. Approve creation and retention of labelled Production smoke-test records.
9. Define monitoring duration, thresholds, and who has rollback authority.

## 16. Go/no-go rule

Production rollout is **No-Go** until every mandatory prerequisite and approval gate is complete. If any identity, authorization, rules, projection, pricing-integrity, workflow, or rollback fact is unclear, stop before changing Production.
