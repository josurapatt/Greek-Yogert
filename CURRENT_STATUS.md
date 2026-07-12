# GreekYogurtOrderApp — Current Status

This document is the latest operational snapshot, not a changelog. Git history is authoritative for historical changes. Repository and GitHub facts below were verified on 2026-07-12; user-controlled approvals remain pending unless explicitly stated.

## Status Metadata

- Last verified date: 2026-07-12 (Asia/Bangkok)
- Verified by: Codex, using the local repository and portable GitHub CLI
- Repository: `C:\Users\surapat.c\Desktop\GreekYogurtOrderApp`
- Branch: `feature/customer-qr-ordering-foundation`
- Verified implementation baseline HEAD: `de5478fff3fa2c938bdf2d390ada7633f39a660c`
- Working tree after implementation push: Clean
- Remote synchronization after implementation push: Local implementation HEAD and `origin/feature/customer-qr-ordering-foundation` matched; ahead 0, behind 0
- Status-document commit note: The documentation-only commit containing this snapshot is necessarily newer than the implementation baseline above. Verify actual HEAD with Git before relying on it.

## Pull Request

- PR: [#4 — Add customer QR ordering UAT foundation](https://github.com/josurapatt/Greek-Yogert/pull/4)
- State: Open and unmerged
- Draft status: Draft
- Merge status: GitHub reported `CLEAN`; this is not merge approval
- Latest Customer QR UAT check: Passed for implementation commit `de5478f`

## Latest Completed Work

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

## Deployment Status

### Customer QR UAT

- Firebase project: `greek-yogert-customer-uat-2026`
- Deployment status: Safeguarded isolated UAT workflow succeeded
- Latest workflow run: [29182431027](https://github.com/josurapatt/Greek-Yogert/actions/runs/29182431027)
- Workflow target safeguard: Build and deployment both require the exact project ID `greek-yogert-customer-uat-2026`
- UAT Staff URL: <https://greek-yogert-customer-uat-2026.web.app/> — HTTP 200 verified
- UAT Customer URL: <https://greek-yogert-customer-uat-2026.web.app/order> — HTTP 200 verified

### Production

- Firebase project: `greek-yogert`
- Production impact: None
- Production configuration, Authentication, Firestore rules, indexes, data, and Hosting were not modified
- Production deployment: Not approved and not performed

## Manual UAT

- Overall status: **Functional checks passed; final targeted UX retest pending**
- User-confirmed passed: product dialog save behavior; Customer cart editing and removal; global packaging behavior; per-product synchronization; stale-cart blocking; Staff and Customer regression
- Excel manual validation: Passed
- Remaining targeted retest: confirm the actual global toggle is visible and usable directly on Products, accurately reflects current state, and stays synchronized with Settings, Staff ordering, and Customer QR
- PR #4 approval remains a separate user-controlled gate

## Known Bugs and Blockers

- No remaining implementation blocker is known
- The Products-page toggle adjustment is deployed but awaits its final targeted UX retest

## Immediate Next Action

- Run the final targeted Products-page global-toggle UX retest, then decide PR #4 approval separately.

## Release Status

- PR #4 approval: Not approved
- PR #4 Draft-to-Ready transition: Not approved
- Merge to `main`: Not approved
- Production rollout: Not approved
- Production Anonymous Authentication: Not approved
- Production Firestore deployment: Not approved

## Documentation Consistency

- `AGENTS.md`: Unchanged; no missing stable governance rule was discovered
- `ROADMAP.md`: Records functional UAT and Excel as passed while preserving the final Products-toggle UX retest, PR approval, merge, and release as pending
- `CURRENT_STATUS.md`: Distinguishes reported defects, implemented fixes, automated validation, deployment, and pending manual acceptance
