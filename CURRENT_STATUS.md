# GreekYogurtOrderApp — Current Status

This document is the latest operational snapshot, not a changelog. Git history is authoritative for historical changes. Repository and GitHub facts below were verified on 2026-07-12; user-controlled approvals remain pending unless explicitly stated.

## Status Metadata

- Last verified date: 2026-07-12 (Asia/Bangkok)
- Verified by: Codex, using the local repository and portable GitHub CLI
- Repository: `C:\Users\surapat.c\Desktop\GreekYogurtOrderApp`
- Current branch: `feature/production-rollout-hardening`
- Verified hardening starting commit: `36fff5fb983688bf668707efc5a983558fdcf134`
- Production Hardening Work Package 1 implementation commit: `953c6f3bac5bd4424d0728a495fad46b2aeb6b1b`
- Verified squash-merge commit on `main`: `4bd879e7d0f5e5aff85ad675103d74700780e347`
- Approved PR head before merge: `52662b84fe7427e56004397a8ab5acca378c637f`
- Retained feature branch: `feature/customer-qr-ordering-foundation` at `52662b84fe7427e56004397a8ab5acca378c637f`
- Working tree after implementation push and UAT verification: Clean
- Remote synchronization: Local hardening branch and `origin/feature/production-rollout-hardening` matched; ahead 0, behind 0
- Status-document commit note: The documentation-only commit containing this snapshot is necessarily newer than the merge commit above. Verify actual HEAD with Git before relying on it.

## Pull Request

- PR: [#4 — Add customer QR ordering UAT foundation](https://github.com/josurapatt/Greek-Yogert/pull/4)
- State: Merged and closed
- Final review status before merge: Ready for review and user-approved
- Merge method: Squash merge
- Resulting `main` commit: `4bd879e7d0f5e5aff85ad675103d74700780e347`
- Latest Customer QR UAT check: Passed for implementation commit `de5478f`
- Production hardening PR: [#5 — Harden Customer QR production isolation](https://github.com/josurapatt/Greek-Yogert/pull/5)
- PR #5 state: Open Draft, unapproved, and unmerged
- PR #5 implementation head: `953c6f3bac5bd4424d0728a495fad46b2aeb6b1b`

## Latest Completed Work

- Production Hardening Work Package 1 is implemented on the focused hardening branch.
- One typed `VITE_CUSTOMER_QR_ENABLED` boundary now fails closed for missing, malformed, or unsupported environment configuration.
- Customer routing, Staff customer-request behavior, and Customer Firebase startup use the same canonical enable state; UAT labels and seed behavior use the separate environment mode.
- Disabled anonymous `/order` and all disabled customer status routes show a controlled Thai unavailable page, while authenticated Staff `/order` remains unchanged.
- The Customer ordering provider is lazy-loaded and does not start its auth listener, Anonymous Authentication, or public Firestore listeners while disabled.
- The Production workflow now requires exact project `greek-yogert`, rejects the UAT project, remains Hosting-only, and builds with Customer QR explicitly disabled.
- The isolated UAT workflow explicitly enables Customer QR and preserves its exact project guard and existing Hosting/rules/index deployment scope.

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
- Production hardening targeted Manual UAT: **Pending**

## Known Bugs and Blockers

- No known remaining UAT bugs or implementation blockers
- Production rollout is blocked pending targeted hardening UAT and PR #5 approval/merge, followed by separately approved Production-specific rules, Staff authorization bootstrap, current-product public projection, customer price revalidation/risk decision, Authentication, Hosting, smoke-test, and monitoring gates.

## Immediate Next Action

- Perform targeted Production hardening Manual UAT for PR #5. After it passes and the user separately approves the Draft PR, proceed only to the separately authorized Production security-rules Work Package. Production remains No-Go.

## Release Status

- PR #4 approval: Approved by the user for review/merge decision
- PR #4 Draft-to-Ready transition: Approved and completed
- Merge to `main`: Completed by squash merge
- Production rollout plan: Drafted and verified; not approved
- Production rollout: Not approved
- Production Anonymous Authentication: Not approved
- Production Firestore deployment: Not approved
- Production Hardening Work Package 1: Implemented and deployed only to isolated UAT; targeted Manual UAT pending
- PR #5 approval: Not approved
- PR #5 merge: Not approved and not performed

## Documentation Consistency

- `AGENTS.md`: Unchanged; no missing stable governance rule was discovered
- `PRODUCTION_ROLLOUT_PLAN.md`: Records the implemented Draft PR #5 flag/workflow design while preserving the remaining prerequisites, approvals, sequence, smoke test, rollback, and risks
- `ROADMAP.md`: Records hardening Work Package 1 implementation and isolated UAT deployment, with targeted Manual UAT and every Production release gate still pending
- `CURRENT_STATUS.md`: Records the hardening branch, validation, isolated UAT workflow, Draft PR #5, and unchanged Production state
