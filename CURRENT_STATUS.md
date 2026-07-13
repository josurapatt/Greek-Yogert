# GreekYogurtOrderApp — Current Status

This document is the latest operational snapshot, not a changelog. Git history is authoritative for historical changes. Repository and GitHub facts below were verified on 2026-07-13; user-controlled approvals remain pending unless explicitly stated.

## Status Metadata

- Last verified date: 2026-07-13 (Asia/Bangkok)
- Verified by: Codex, using the local repository, portable GitHub CLI, authenticated Firebase/Google Cloud tooling, isolated-UAT automation, and browser verification
- Repository: `C:\Users\surapat.c\Desktop\GreekYogurtOrderApp`
- Current branch: `feature/trusted-customer-boundary`
- Verified WP2 starting baseline: `e8b16c8e05c30cbcc5bedebe73a96966a56b5ff8`
- Production Hardening Work Package 2 implementation commit: `8da6f45bd12b2015754613371a5419f2b810659a`
- Production Hardening Work Package 2 public-read security correction: `79421683d531c3337db06d1bab4b26666476ceff`
- Approved PR #6 documentation-only successor head: `405e266f952e22c4a4314423454f0aab2119b4ad`
- Production Hardening Work Package 2 squash-merge commit: `241b17637b1b7e34e97b05f9bfceebf3b061d6fe`
- Production Hardening Work Package 3 branch: `feature/trusted-customer-boundary`
- Production Hardening Work Package 3 implementation commit: `ff09e330f8215865362ec9f2e6e1552c24200435`
- Production Hardening Work Package 3 latest verified implementation head: `9273113577530cfb9ce3e75c6cd50ad7b5049f60`
- Verified hardening starting commit: `36fff5fb983688bf668707efc5a983558fdcf134`
- Production Hardening Work Package 1 implementation commit: `953c6f3bac5bd4424d0728a495fad46b2aeb6b1b`
- Approved PR #5 head before merge: `aa2bf6d45d494d08ec40fe7e1013ea09a8fca9fe`
- Production Hardening Work Package 1 squash-merge commit: `4145a554ff428311a3c7e37b7c069a614fb77b3f`
- Customer QR foundation squash-merge commit on `main`: `4bd879e7d0f5e5aff85ad675103d74700780e347`
- Approved PR #4 head before merge: `52662b84fe7427e56004397a8ab5acca378c637f`
- Retained feature branch: `feature/customer-qr-ordering-foundation` at `52662b84fe7427e56004397a8ab5acca378c637f`
- Working tree before this documentation update: Clean after WP3 implementation, projection, automated UAT, defect fixes, and isolated-UAT deployment
- Remote synchronization before this documentation update: implementation head `9273113577530cfb9ce3e75c6cd50ad7b5049f60` is pushed to `origin/feature/trusted-customer-boundary`
- Status-document commit note: The documentation-only commit containing this snapshot is necessarily newer than the merge commit above. Verify actual HEAD with Git before relying on it.

## Pull Request

- PR: [#4 — Add customer QR ordering UAT foundation](https://github.com/josurapatt/Greek-Yogert/pull/4)
- State: Merged and closed
- Final review status before merge: Ready for review and user-approved
- Merge method: Squash merge
- Resulting `main` commit: `4bd879e7d0f5e5aff85ad675103d74700780e347`
- Latest Customer QR UAT check: Passed for implementation commit `de5478f`
- Production hardening PR: [#5 — Harden Customer QR production isolation](https://github.com/josurapatt/Greek-Yogert/pull/5)
- PR #5 state: Merged and closed
- PR #5 approval: Approved by the user after Targeted Hardening Manual UAT passed
- PR #5 approved head: `aa2bf6d45d494d08ec40fe7e1013ea09a8fca9fe`
- PR #5 squash-merge commit: `4145a554ff428311a3c7e37b7c069a614fb77b3f`
- Production security rules PR: [#6 — Harden Production security rules and Staff authorization](https://github.com/josurapatt/Greek-Yogert/pull/6)
- PR #6 state: Merged and closed
- PR #6 final approved documentation-only head: `405e266f952e22c4a4314423454f0aab2119b4ad`
- PR #6 Targeted Manual UAT: Passed with no observed bugs; approved by the user
- PR #6 squash-merge commit: `241b17637b1b7e34e97b05f9bfceebf3b061d6fe`
- Production trusted-data PR: [#7 — Add trusted Customer confirmation and public projection](https://github.com/josurapatt/Greek-Yogert/pull/7)
- PR #7 state: Open Draft, unapproved, and unmerged

## Latest Completed Work

- Production Hardening Work Package 1 is complete and squash-merged into `main`.
- One typed `VITE_CUSTOMER_QR_ENABLED` boundary now fails closed for missing, malformed, or unsupported environment configuration.
- Customer routing, Staff customer-request behavior, and Customer Firebase startup use the same canonical enable state; UAT labels and seed behavior use the separate environment mode.
- Disabled anonymous `/order` and all disabled customer status routes show a controlled Thai unavailable page, while authenticated Staff `/order` remains unchanged.
- The Customer ordering provider is lazy-loaded and does not start its auth listener, Anonymous Authentication, or public Firestore listeners while disabled.
- The Production workflow now requires exact project `greek-yogert`, rejects the UAT project, remains Hosting-only, and builds with Customer QR explicitly disabled.
- The isolated UAT workflow explicitly enables Customer QR and preserves its exact project guard and existing Hosting/rules/index deployment scope.
- Targeted Hardening Manual UAT passed every disabled-local, Staff, enabled-UAT, request/status synchronization, and workflow-guard check with no observed bugs.
- Production Hardening Work Package 2 now has one canonical `firestore.production.rules` candidate. It restricts all private application data to explicit active non-anonymous Staff, isolates customer requests to their anonymous owner, denies client authorization-document writes/listing, and preserves existing Staff order validation.
- Firebase-backed non-anonymous Staff sessions now verify the explicit Staff document even when Customer QR is disabled and fail closed if verification cannot complete.
- The isolated UAT configuration validates and deploys the same canonical candidate rules; the legacy duplicate UAT rules/test source was removed.
- A manual-only Production Firestore-rules workflow artifact and blank Staff authorization inventory template were added. Neither was executed or populated with Production data.
- A pre-Manual-UAT security-consistency review found that public menu/settings reads were too broad because they used `signedIn()`. The candidate rules now allow those reads only to Anonymous Customers or exact active Staff; unauthorized, inactive, and malformed Email/Password identities are denied.
- The approved PR tree was squash-merged as `4145a554ff428311a3c7e37b7c069a614fb77b3f`; the resulting `main` tree exactly matched the approved PR head.
- Production Hardening Work Package 2 is complete and squash-merged into `main` as `241b17637b1b7e34e97b05f9bfceebf3b061d6fe`; the resulting tree exactly matched approved PR #6 head `405e266f952e22c4a4314423454f0aab2119b4ad`.
- The merged Production rules candidate, Staff authorization procedure, and Customer QR feature were not deployed or executed in Production.
- Work Package 3 rebuilds every pending Customer request from current private products and availability inside the existing confirmation transaction, then rejects any forged or stale snapshot without allocating a queue or creating an order.
- Work Package 3 adds a dedicated `PublicCustomerProduct` whitelist, deterministic projection fingerprint/diff logic, atomic projection runner, and manual-only Production projection workflow. The Production workflow has not been run.
- The existing GitHub UAT deployer (`gith...ye@greek-yogert-customer-uat-2026.iam.gserviceaccount.com`) received only project-scoped `roles/datastore.user` in `greek-yogert-customer-uat-2026`; no Production or unrelated IAM binding changed.
- The UAT projection completed dry-run, reviewed apply, and idempotency verification at fingerprint `wp3-7fc7b4c5be82c3da`.
- WP3 now includes an exact-source-SHA-bound manual UAT projection workflow, explicit source/public-target audit output, private product identity validation, the full mismatch matrix, transaction no-write assertions, and a reusable live isolated-UAT validator.
- Live automated UAT confirmed the public/private boundary, applied fingerprint, trusted confirmation, queue/request linkage, payment allocation, duplicate blocking, forged-price rejection without writes, Staff rejection, Customer status isolation, request-update denial, and unauthorized/inactive/malformed Staff denial. Temporary Auth identities and authorization documents were removed.
- WP3 defects fixed in this continuation: incomplete projection audit evidence, ambiguous private product-ID acceptance, missing explicit mismatch/no-write coverage, non-source-bound UAT projection dispatch, slow-emulator startup timeout, and UAT cleanup warning handling.

- Work Package 1 implementation exists on the PR branch.
- Manual UAT reported four defects: the product editor remained open after save, Customer QR cart lines could not be modified, global separated-packaging availability was not clearly exposed, and Customer QR could retain stale per-product packaging support.
- Stabilization commit `39b76f1fa8ad5054f98966ae4d05769c10445381` fixes all four defects in code.
- Coverage completion commit `dc8790d4957abe09425a80324c02836eafec5aa3` adds explicit Customer quantity-decrease and topping-edit regression assertions and renders the selected options in the Customer cart.
- Manual UAT confirmed the product save behavior, Customer cart editing/removal, global and per-product packaging behavior, stale-cart blocking, Staff/Customer regressions, and Excel validation all passed functionally.
- Final UX adjustment commit `de5478fff3fa2c938bdf2d390ada7633f39a660c` places the actual global `แยกท็อปปิ้ง` toggle directly on Products and reuses the same canonical control in Settings.
- Product and public-menu updates now use one atomic Firestore batch, and public projections omit undefined optional fields.
- Product editing now closes only after successful persistence, remains open with an error on failure, and prevents duplicate save actions while saving.
- Customer QR cart lines now support quantity increase/decrease, configuration editing, packaging changes, and removal before explicit submission.
- The existing global separated-packaging setting is directly editable on Products and remains available in Settings through the same shared state and persistence function.
- Customer submission re-reads the latest public product and availability configuration and blocks stale invalid packaging without silently changing it.
- PR #4 was squash-merged into `main` as `4bd879e7d0f5e5aff85ad675103d74700780e347`; the resulting tree exactly matched the approved PR head.

## Latest Automated Validation

Validation was run locally against implementation commit content before commit and also exercised by the isolated UAT workflow where applicable:

- Application tests: 131 passed across 11 test files
- Firestore Emulator security tests: 10 passed
- Lint: Passed
- TypeScript production build: Passed
- Prettier: Passed for every changed and new implementation file using pinned Prettier 3.6.2
- Focused diff scan: Passed; no workflow, Production Firebase configuration, Firestore rule, or index changes
- Secret scan: Passed
- Workflow: [29182431027](https://github.com/josurapatt/Greek-Yogert/actions/runs/29182431027) completed successfully for `de5478fff3fa2c938bdf2d390ada7633f39a660c`

Production Hardening Work Package 1 validation:

- Focused feature-flag, routing, and Firebase-isolation tests: 18 passed
- Application tests: 142 passed across 13 test files
- Firestore Emulator security tests: 10 passed
- Lint: Passed
- TypeScript Production-disabled build: Passed with `production` and `VITE_CUSTOMER_QR_ENABLED=false`
- UAT-enabled build: Passed with `customer-qr-uat` and `VITE_CUSTOMER_QR_ENABLED=true`
- Prettier: Passed for all supported changed files using pinned Prettier 3.6.2
- Workflow YAML validation: Passed
- Focused diff and secret scans: Passed
- Isolated UAT workflow: [29189257511](https://github.com/josurapatt/Greek-Yogert/actions/runs/29189257511) succeeded for `953c6f3bac5bd4424d0728a495fad46b2aeb6b1b`

Production Hardening Work Package 2 validation:

- Application tests: 144 passed across 14 test files
- Focused Staff authorization, Customer request/status/confirmation, packaging, Queue, History, Reports, Excel, mixed-payment, and legacy regression tests: 65 passed
- Canonical Production-candidate Firestore Emulator tests: 13 passed
- Lint: Passed
- TypeScript Production-disabled build: Passed with `production` and `VITE_CUSTOMER_QR_ENABLED=false`
- UAT-enabled build: Passed with `customer-qr-uat` and `VITE_CUSTOMER_QR_ENABLED=true`
- Prettier: Passed for all supported changed files; Firestore rules were compiled and exercised by the Emulator suite
- Workflow YAML validation, focused diff review, and secret scan: Passed
- Isolated UAT workflow: [29218201189](https://github.com/josurapatt/Greek-Yogert/actions/runs/29218201189) succeeded for `8da6f45bd12b2015754613371a5419f2b810659a`
- Focused public-resource identity checks: covered unauthenticated, Anonymous Customer, unauthorized Email/Password, inactive/malformed Staff, and authorized Staff behavior for both public collections
- Corrected canonical Production-candidate Firestore Emulator tests: 15 passed
- Affected Staff and Customer QR tests: 28 passed
- Full application suite after the rules correction: 144 passed across 14 test files
- Corrected isolated UAT workflow: [29218624822](https://github.com/josurapatt/Greek-Yogert/actions/runs/29218624822) succeeded for `79421683d531c3337db06d1bab4b26666476ceff`

Production Hardening Work Package 3 validation:

- Focused trusted-confirmation, public-projection, and transaction tests: 31 passed across 3 test files
- Application tests: 175 passed across 17 test files
- Canonical Production-candidate Firestore Emulator tests: 15 passed
- Lint, Production-disabled build, UAT-enabled build, Prettier, workflow YAML parsing, diff review, and secret scan: Passed
- Firestore Emulator harness startup defect fixed without changing rules or assertions; the final 15-test rerun passed
- Isolated UAT deployment: [29243389577](https://github.com/josurapatt/Greek-Yogert/actions/runs/29243389577) succeeded for `9273113577530cfb9ce3e75c6cd50ad7b5049f60`
- Projection dry-run: [29241851162](https://github.com/josurapatt/Greek-Yogert/actions/runs/29241851162) validated 6 private products; planned 4 creates, 2 whitelist replacements, 0 stale removals, availability/control updates, and 0 dry-run writes
- Projection apply: [29241980849](https://github.com/josurapatt/Greek-Yogert/actions/runs/29241980849) atomically committed 8 writes at fingerprint `wp3-7fc7b4c5be82c3da`
- Projection idempotency: [29242037737](https://github.com/josurapatt/Greek-Yogert/actions/runs/29242037737) reported all 6 menu documents, availability, and control current with 0 planned writes
- Live automated UAT marker `WP3-AUTO-1783939065803`: Passed; 4 temporary Auth identities and 2 temporary authorization documents removed
- Browser verification: UAT `/order` rendered all 6 projected products with the UAT label and 0 console errors

## Deployment Status

### Customer QR UAT

- Firebase project: `greek-yogert-customer-uat-2026`
- Deployment status: Safeguarded isolated UAT workflow succeeded
- Latest workflow run: [29243389577](https://github.com/josurapatt/Greek-Yogert/actions/runs/29243389577)
- Workflow target safeguard: Build and deployment both require the exact project ID `greek-yogert-customer-uat-2026`
- UAT Staff URL: <https://greek-yogert-customer-uat-2026.web.app/> — HTTP 200 verified
- UAT Customer URL: <https://greek-yogert-customer-uat-2026.web.app/order> — HTTP 200 verified
- Hardening UAT workflow: [29189257511](https://github.com/josurapatt/Greek-Yogert/actions/runs/29189257511) — succeeded
- Rendered Staff verification: Staff login loaded successfully
- Rendered Customer verification: `/order` loaded the enabled Thai storefront, UAT mode label, and live menu without console errors
- WP2 UAT workflow: [29218201189](https://github.com/josurapatt/Greek-Yogert/actions/runs/29218201189) — succeeded for the canonical candidate rules
- WP2 UAT Staff URL: <https://greek-yogert-customer-uat-2026.web.app/> — HTTP 200 verified
- WP2 UAT Customer URL: <https://greek-yogert-customer-uat-2026.web.app/order> — HTTP 200 verified
- Corrected WP2 UAT workflow: [29218624822](https://github.com/josurapatt/Greek-Yogert/actions/runs/29218624822) — succeeded
- Corrected WP2 UAT Staff and Customer URLs: HTTP 200 verified
- WP3 UAT workflow: [29243389577](https://github.com/josurapatt/Greek-Yogert/actions/runs/29243389577) — succeeded for implementation head `9273113577530cfb9ce3e75c6cd50ad7b5049f60`
- WP3 UAT projection: Applied and idempotent at `wp3-7fc7b4c5be82c3da`; writes were restricted to `publicMenu/*`, `publicSettings/toppingAvailability`, and `publicProjectionControl/current`

### Production

- Firebase project: `greek-yogert`
- Production impact: None
- Production configuration, Authentication, Firestore rules, indexes, data, and Hosting were not modified
- Production deployment: Not approved and not performed
- Customer QR Production state: Disabled
- Latest Production workflow remains run `29116625544` for pre-Customer-QR SHA `4d5b6547cc02b83be821c90d2cfb473bc65b2a12`; no Production action ran for the hardening branch
- Latest GitHub Production environment deployment remains SHA `4d5b6547cc02b83be821c90d2cfb473bc65b2a12`

## Manual UAT

- Overall status: **Passed**
- User-confirmed passed: product dialog save behavior; Customer cart editing and removal; global packaging behavior; per-product synchronization; stale-cart blocking; Staff and Customer regression
- Final targeted Products-page toggle UX retest: Passed
- Products toggle visibility, disable/enable synchronization, per-product precedence, shared Products/Settings state, pricing, and Customer QR regression: Passed
- Excel manual validation: Passed
- Observed remaining UAT bugs: None
- Production hardening targeted Manual UAT: **Passed**
- Disabled local `/order` and status routing, absence of Anonymous Authentication/public-menu reads/customer-bundle loading, authenticated Staff `/order`, enabled UAT storefront, UAT request/status flow, Staff synchronization, and Production workflow guards: Passed
- Observed hardening bugs: None
- Production Hardening Work Package 2 targeted Manual UAT: **Passed**
- WP2 Manual UAT passed: authorized Staff access; unauthorized/inactive/malformed Staff denial; Anonymous public menu access; owned-request isolation; request-update denial; Staff confirmation/rejection and duplicate protection; Queue, History, Reports, and Excel regression
- WP2 Manual UAT observed bugs: None
- WP3 automated UAT: Passed
- WP3 remaining Manual UAT: Pending only for visual presentation, interaction usability, and business acceptance
- Human-only checks remain for Customer menu/cart presentation, Staff mismatch-message clarity and end-to-end usability, Queue/History/Reports presentation, downloaded Excel presentation, and final business acceptance.

## Known Bugs and Blockers

- No known automated-validation, isolated-UAT deployment, or WP2 Manual UAT blocker; the public-read discrepancy was corrected and revalidated before Manual UAT
- Production rollout is blocked pending Staff authorization provisioning, current-product public projection, customer price revalidation/risk decision, Authentication, exact Production rules deployment approval, Hosting, smoke-test, and monitoring gates.
- No known WP3 automated-validation, UAT IAM, projection, deployment, or runtime blocker remains.

## Immediate Next Action

- Complete the reduced human-only WP3 Manual UAT, then obtain exact PR-head approval before Ready for Review or merge. Production remains No-Go.

## Release Status

- PR #4 approval: Approved by the user for review/merge decision
- PR #4 Draft-to-Ready transition: Approved and completed
- Merge to `main`: Completed by squash merge
- Production rollout plan: Drafted and verified; not approved
- Production rollout: Not approved
- Production Anonymous Authentication: Not approved
- Production Firestore deployment: Not approved
- Production Hardening Work Package 1: Completed, manually validated, approved, and merged into `main`
- PR #5 approval: Approved by the user
- PR #5 merge: Completed by squash merge; PR closed
- Production Customer QR: Disabled
- Production Hosting activation and deployment: Not approved and not performed
- Production Staff authorization provisioning, public projection, and smoke testing: Not approved and not performed
- Production Hardening Work Package 2: Completed, automated-validated, manually validated, approved, and squash-merged into `main`; its candidate rules were deployed only to isolated UAT
- PR #6 approval and merge: Approved by the user; squash-merged and closed
- Production rules candidate: Merged but not deployed
- Production Staff authorization procedure: Prepared but not executed
- Production Hardening Work Package 3: Implemented, projected, automated-validated, and deployed only to isolated UAT on Draft PR #7; reduced human Manual UAT and approval remain pending

## Documentation Consistency

- `AGENTS.md`: Corrected stale active-PR guidance and documented canonical candidate-rules/UAT and rules-workflow safeguards
- `PRODUCTION_STAFF_AUTHORIZATION_INVENTORY.template.md`: Added as a blank non-sensitive future provisioning procedure; it contains no Production data
- `PRODUCTION_ROLLOUT_PLAN.md`: Records WP2 as merged while preserving every separate Production prerequisite, approval, sequence, smoke test, rollback, and risk
- `ROADMAP.md`: Records WP2 completion and keeps WP3, WP4, WP5, and all Production gates pending
- `CURRENT_STATUS.md`: Records merged PR #6, WP2 validation/UAT evidence, unchanged Production state, and WP3 as the next pending Work Package
- `CURRENT_STATUS.md`: Records the resolved UAT IAM blocker, projection evidence, automated UAT, final implementation baseline, unchanged Production state, and reduced human-only stop point
