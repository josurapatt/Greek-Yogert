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
- Customer QR changes are merged into `main` but are not deployed to Production.

### Isolated Customer QR UAT

- Firebase project: `greek-yogert-customer-uat-2026`
- UAT Staff URL: <https://greek-yogert-customer-uat-2026.web.app/>
- UAT Customer URL: <https://greek-yogert-customer-uat-2026.web.app/order>
- UAT uses Email/Password Authentication for Staff and Anonymous Authentication for customers.
- Production Authentication and other Production resources remain untouched.

## 3. Current Integration State

- Integrated branch: `main`
- Customer QR foundation squash-merge commit: `4bd879e7d0f5e5aff85ad675103d74700780e347`
- Production release isolation squash-merge commit: `4145a554ff428311a3c7e37b7c069a614fb77b3f`
- Retained feature branch: `feature/customer-qr-ordering-foundation`
- Retained hardening branch: `feature/production-rollout-hardening`
- PR #4: **Merged and closed**
- PR #5: **Approved, squash-merged, and closed**

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
- [x] PR #4 squash-merged into `main`
- [x] Production rollout plan drafted and verified; approval pending

### Phase 8 — Production Release Isolation

- [x] Neutral fail-closed Customer QR enablement
- [x] Separate UAT/Production environment display behavior
- [x] Disabled Customer Firebase initialization and Anonymous Authentication isolation
- [x] Exact Production project workflow guard with Hosting-only scope
- [x] Explicit isolated UAT enablement
- [x] Automated validation and isolated UAT deployment
- [x] Targeted Hardening Manual UAT passed with no observed bugs
- [x] PR #5 approved and squash-merged into `main`

Exact validation counts and the latest workflow run belong in `CURRENT_STATUS.md`. Automated validation and an isolated UAT deployment do not constitute final release approval.

## 5. Current Active Work

**Production Hardening Work Package 2 — Production Security Rules and Explicit Staff Authorization — targeted Manual UAT and PR review pending**

Current state:

- [x] Production release isolation Work Package 1 implemented, automated-revalidated, manually validated, approved, and squash-merged into `main`.
- [x] Work Package 2 implementation authorized, completed, and pushed on its dedicated Draft PR.
- [x] Canonical Production-candidate rules designed and Emulator-tested while preserving existing Production order validation.
- [x] Explicit Staff authorization checks made unconditional for Firebase-backed non-anonymous Staff sessions.
- [x] Blank Staff authorization inventory/provisioning procedure prepared without Production access or data.
- [x] Candidate rules deployed only to isolated Customer QR UAT and both UAT URLs verified.
- [x] Public menu/settings identity boundary corrected and revalidated: only Anonymous Customers and exact active Staff can read candidate public resources.
- [ ] Complete targeted WP2 Manual UAT and obtain explicit PR #6 approval before merge.
- Preserve independent approvals for Authentication, rules, indexes, data/configuration, Hosting, smoke testing, and monitoring.
- Keep every Production change pending until explicitly approved.

## 6. Release Gates

- [x] Final manual regression UAT passed
- [x] Reported Work Package 1 UAT defects fixed and automated-revalidated
- [x] Targeted Manual UAT defect retest passed
- [x] Excel export manual validation passed
- [x] Final targeted Products-page toggle UX retest passed
- [x] PR #4 approved
- [x] PR #4 changed from Draft to Ready
- [x] PR #4 merged to `main`
- [x] Production Hardening Work Package 1 implemented and automated-revalidated
- [x] Production Hardening Work Package 1 deployed to isolated Customer QR UAT only
- [x] Production Hardening Work Package 1 targeted Manual UAT passed
- [x] PR #5 approved by the user
- [x] PR #5 squash-merged into `main`
- [x] Production release isolation completed
- [x] Production Hardening Work Package 2 implemented, automated-validated, and deployed only to isolated Customer QR UAT
- [ ] Production Hardening Work Package 2 targeted Manual UAT, approval, and merge complete
- [ ] Production rollout plan approved
- [ ] Production Authentication decision approved
- [ ] Production Firestore rules and deployment scope reviewed
- [ ] Production Staff authorization provisioning approved and completed
- [ ] Production public projection approved and completed
- [ ] Production Hosting activation approved and completed
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
