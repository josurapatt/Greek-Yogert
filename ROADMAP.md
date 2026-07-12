# GreekYogurtOrderApp Roadmap

## 1. Project Purpose

GreekYogurtOrderApp supports Staff ordering, queue and fulfillment, history, reporting, product management, settings, and Customer QR ordering.

Development follows this incremental approach:

```text
Extend
→ Integrate
→ Refactor
→ Replace only when technically justified
```

## 2. Current Environment

### Production

- Firebase project: `greek-yogert`
- Production URL: <https://greek-yogert.firebaseapp.com/>
- Customer QR changes are not merged or deployed to Production.

### Isolated Customer QR UAT

- Firebase project: `greek-yogert-customer-uat-2026`
- UAT Staff URL: <https://greek-yogert-customer-uat-2026.web.app/>
- UAT Customer URL: <https://greek-yogert-customer-uat-2026.web.app/order>
- UAT uses Email/Password Authentication for Staff and Anonymous Authentication for customers.
- Production Authentication and other Production resources remain untouched.

## 3. Current Development Branch

- Branch: `feature/customer-qr-ordering-foundation`
- PR: `#4`
- PR status: **Draft, open, unmerged**

Exact HEAD, working-tree, validation, workflow, deployment, and blocker state is maintained in `CURRENT_STATUS.md` and must be verified against the repository and GitHub before future work.

## 4. Completed Capabilities

### Phase 1 — Staff Ordering Core

- [x] Staff authentication
- [x] Staff ordering
- [x] Sales-channel selection: หน้าร้าน, LINE MAN, Grab, and OpenChat
- [x] Channel-specific pricing and payment rules
- [x] Queue and History
- [x] Reports
- [x] Products and Settings
- [x] Topping and granola availability
- [x] Existing Staff-side Production release

### Phase 2 — Customer QR Foundation

- [x] Isolated Firebase UAT
- [x] Anonymous Customer entry
- [x] Customer routes `/order` and `/order/status/:requestId`
- [x] Storefront-only Customer pricing and channel locked to หน้าร้าน
- [x] No Customer payment selection
- [x] Sold-out display and stale-selection blocking
- [x] Optional nickname and note
- [x] Real-time Customer status
- [x] `customerOrderRequests` collection

### Phase 3 — Staff Customer Request Processing

- [x] Pending request list and real-time request badge
- [x] Request detail
- [x] Confirm and reject actions
- [x] Atomic queue assignment and active-order creation
- [x] Duplicate prevention
- [x] Quick confirmation
- [x] Per-line payment methods and mixed-payment support
- [x] Stale-card reconciliation

### Phase 4 — Queue, History, and Compatibility

- [x] Queue detail route `/orders/:id`
- [x] Back to Queue
- [x] Ready action and move to History
- [x] Mixed-payment History labels
- [x] Payment filtering
- [x] Legacy single-payment compatibility
- [x] Excel snapshot compatibility

### Phase 5 — Reporting Enhancement

- [x] Sales summary grouped by sales channel
- [x] Sales amount and order count
- [x] Legacy sales-channel spelling support
- [x] Unknown-channel handling
- [x] Hourly stacked-column sales chart
- [x] One column per populated hour with stack segments by sales channel
- [x] Asia/Bangkok timezone handling
- [x] Stable legend and responsive chart behavior

### Phase 6 — Work Package 1

- [x] Per-line normal and separated topping packaging
- [x] Channel-based separated-packaging surcharge
- [x] Global and per-product packaging availability
- [x] Durable packaging snapshots and legacy compatibility
- [x] Payment-method sales summary with mixed-payment allocation
- [x] Customer request, Queue, History, status, and Excel compatibility

### Phase 7 — Stabilization and UAT

- [x] Automated application, security, formatting, build, diff, and secret validation completed for the latest implementation
- [x] Isolated UAT deployment: passed
- [x] Four defects identified during Work Package 1 Manual UAT
- [x] Stabilization/fix cycle implemented, automated-revalidated, and redeployed to isolated UAT
- [x] Targeted Manual UAT defect retest: Passed
- [x] Excel export manual validation: Passed
- [x] Products-page inline global-toggle adjustment implemented and deployed to isolated UAT
- [x] Final targeted Products-page toggle UX retest: Passed
- [x] Final manual regression UAT: Passed

Exact validation counts and the latest workflow run belong in `CURRENT_STATUS.md`. Automated validation and an isolated UAT deployment do not constitute final release approval.

## 5. Current Active Work

**Release preparation and PR #4 merge decision**

Prepare:

- Preserve the approved PR head checkpoint and required checks before any merge.
- Decide whether to merge PR #4 into `main` in a separately authorized operation.
- Keep Production rollout, Authentication, Firestore deployment, smoke testing, and monitoring pending until explicitly approved.

## 6. Release Gates

- [x] Final manual regression UAT passed
- [x] Reported Work Package 1 UAT defects fixed and automated-revalidated
- [x] Targeted Manual UAT defect retest passed
- [x] Excel export manual validation passed
- [x] Final targeted Products-page toggle UX retest passed
- [x] PR #4 approved
- [x] PR #4 changed from Draft to Ready
- [ ] PR #4 merged to `main`
- [ ] Production rollout plan approved
- [ ] Production Authentication decision approved
- [ ] Production Firestore rules and deployment scope reviewed
- [ ] Production smoke test passed
- [ ] Post-release monitoring completed

Production Anonymous Authentication must not be enabled automatically.

## 7. Planned Future Work

These are broad planned areas, not approved implementation tasks:

- Further reporting and analytics
- Store operations improvements
- Customer ordering experience improvements
- Product and availability management
- Queue and fulfillment improvements
- Promotion and pricing features
- Data export and management
- Security and audit improvements
- Production hardening
- Other user-approved feature requests

## 8. Deferred / Future Ideas

Items recorded here are not automatically approved. They must not be implemented without a specific task prompt and may be reordered, removed, or promoted by the user.

No speculative technologies, Cloud Functions, paid Firebase plans, or major rewrites are approved by this section.

## 9. Permanent Restrictions

- Do not modify `main` without explicit instruction.
- Do not merge PR #4 without explicit approval.
- Do not deploy Customer QR Ordering to Production without explicit approval.
- Do not enable Anonymous Authentication in Production automatically.
- Do not modify Production Firestore rules, indexes, Authentication, or data without explicit approval.
- Do not copy Production users, orders, or history into UAT.
- Do not use Cloud Functions.
- Do not enable Blaze or billing.
- Do not commit secrets.
- Do not perform unrelated refactoring.
- Preserve isolated UAT deployment safeguards.
- Continue following `AGENTS.md`.

## 10. Roadmap Maintenance Rules

- Completed items require verified implementation evidence.
- Automated validation and Manual UAT are separate statuses.
- A deployed UAT build is not the same as a Production release.
- A Draft PR is not a completed release.
- Update roadmap status only from verified completion reports and when authorized by the current task.
- Future prompts may reference `ROADMAP.md` instead of repeating the entire project handoff.
- The user remains the authority for prioritization and release approval.
