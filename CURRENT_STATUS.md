# GreekYogurtOrderApp — Current Status

This document is the latest operational snapshot, not a changelog. Git history is authoritative for historical changes. Repository and GitHub facts below were verified on 2026-07-13; user-controlled approvals remain pending unless explicitly stated.

## Status Metadata

- Last verified date: 2026-07-13 (Asia/Bangkok)
- Verified by: Codex, using the local repository and portable GitHub CLI
- Repository: `C:\Users\surapat.c\Desktop\GreekYogurtOrderApp`
- Current branch: `feature/production-security-authorization`
- Verified WP2 starting baseline: `e8b16c8e05c30cbcc5bedebe73a96966a56b5ff8`
- Production Hardening Work Package 2 implementation commit: `8da6f45bd12b2015754613371a5419f2b810659a`
- Verified hardening starting commit: `36fff5fb983688bf668707efc5a983558fdcf134`
- Production Hardening Work Package 1 implementation commit: `953c6f3bac5bd4424d0728a495fad46b2aeb6b1b`
- Approved PR #5 head before merge: `aa2bf6d45d494d08ec40fe7e1013ea09a8fca9fe`
- Production Hardening Work Package 1 squash-merge commit: `4145a554ff428311a3c7e37b7c069a614fb77b3f`
- Customer QR foundation squash-merge commit on `main`: `4bd879e7d0f5e5aff85ad675103d74700780e347`
- Approved PR #4 head before merge: `52662b84fe7427e56004397a8ab5acca378c637f`
- Retained feature branch: `feature/customer-qr-ordering-foundation` at `52662b84fe7427e56004397a8ab5acca378c637f`
- Working tree before this documentation update: Clean after the WP2 implementation commit and UAT verification
- Remote synchronization before this documentation update: WP2 implementation commit pushed to `origin/feature/production-security-authorization`
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
- PR #6 state: Open Draft; unapproved and unmerged
- PR #6 implementation head: `8da6f45bd12b2015754613371a5419f2b810659a`

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
- The approved PR tree was squash-merged as `4145a554ff428311a3c7e37b7c069a614fb77b3f`; the resulting `main` tree exactly matched the approved PR head.

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

## Deployment Status

### Customer QR UAT

- Firebase project: `greek-yogert-customer-uat-2026`
- Deployment status: Safeguarded isolated UAT workflow succeeded
- Latest workflow run: [29182431027](https://github.com/josurapatt/Greek-Yogert/actions/runs/29182431027)
- Workflow target safeguard: Build and deployment both require the exact project ID `greek-yogert-customer-uat-2026`
- UAT Staff URL: <https://greek-yogert-customer-uat-2026.web.app/> — HTTP 200 verified
- UAT Customer URL: <https://greek-yogert-customer-uat-2026.web.app/order> — HTTP 200 verified
- Hardening UAT workflow: [29189257511](https://github.com/josurapatt/Greek-Yogert/actions/runs/29189257511) — succeeded
- Rendered Staff verification: Staff login loaded successfully
- Rendered Customer verification: `/order` loaded the enabled Thai storefront, UAT mode label, and live menu without console errors
- WP2 UAT workflow: [29218201189](https://github.com/josurapatt/Greek-Yogert/actions/runs/29218201189) — succeeded for the canonical candidate rules
- WP2 UAT Staff URL: <https://greek-yogert-customer-uat-2026.web.app/> — HTTP 200 verified
- WP2 UAT Customer URL: <https://greek-yogert-customer-uat-2026.web.app/order> — HTTP 200 verified

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
- Production Hardening Work Package 2 targeted Manual UAT: **Pending**

## Known Bugs and Blockers

- No known automated-validation or isolated-UAT deployment blocker
- Production rollout is blocked pending WP2 targeted Manual UAT, PR #6 approval/merge, Staff authorization provisioning, current-product public projection, customer price revalidation/risk decision, Authentication, Hosting, smoke-test, and monitoring gates.

## Immediate Next Action

- Complete the targeted WP2 Manual UAT checklist and obtain explicit PR #6 review/merge approval. Production remains No-Go.

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
- Production Hardening Work Package 2: Implemented, locally validated, and deployed only to isolated UAT; Manual UAT, PR approval, merge, and every Production action remain pending

## Documentation Consistency

- `AGENTS.md`: Corrected stale active-PR guidance and documented canonical candidate-rules/UAT and rules-workflow safeguards
- `PRODUCTION_STAFF_AUTHORIZATION_INVENTORY.template.md`: Added as a blank non-sensitive future provisioning procedure; it contains no Production data
- `PRODUCTION_ROLLOUT_PLAN.md`: Records the isolated-UAT-validated WP2 candidate while preserving every Production prerequisite, approval, sequence, smoke test, rollback, and risk
- `ROADMAP.md`: Records WP2 implementation/UAT completion and pending targeted Manual UAT, PR approval, merge, and all Production gates
- `CURRENT_STATUS.md`: Records PR #6, WP2 validation/UAT evidence, unchanged Production state, and pending targeted Manual UAT
