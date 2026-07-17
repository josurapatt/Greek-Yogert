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
- Production security rules squash-merge commit: `241b17637b1b7e34e97b05f9bfceebf3b061d6fe`
- Trusted Customer boundary squash-merge commit: `851ae86137733498c4c4ef7b0fdc94a5e0255726`
- Anonymous abuse controls squash-merge commit: `a41cba9cbed8ba9827db5366764fad0df66d8313`
- Full isolated Production release rehearsal squash-merge commit: `f85b7f25f483888e48bc019ab982ee774207f128`
- Retained feature branch: `feature/customer-qr-ordering-foundation`
- Retained hardening branch: `feature/production-rollout-hardening`
- PR #4: **Merged and closed**
- PR #5: **Approved, squash-merged, and closed**
- PR #6: **Approved, squash-merged, and closed**
- PR #7: **Approved at exact head `765e015779c696e03dee9e62905b5645307530f6`, squash-merged, and closed**
- PR #8: **Approved, squash-merged, and closed**
- PR #9: **Approved at exact head `b6825948d63faeee8e67d61bbaf759cfe0461330`, squash-merged, and closed**

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

**App Check Monitoring Work Package — Path B isolated-UAT implementation and Human UAT complete; exact-head approval pending**

Current App Check state:

- [x] Residual-risk decision completed with Path B selected.
- [x] Draft PR [#10 — Add isolated UAT App Check monitoring](https://github.com/josurapatt/Greek-Yogert/pull/10) opened and remains unmerged.
- [x] Scope is limited to `greek-yogert-customer-uat-2026` with
      `ReCaptchaEnterpriseProvider` and monitoring only.
- [x] Production App Check registration and every enforcement decision remain
      separately unapproved.
- [x] Complete local implementation and validation on
      `feature/app-check-monitoring`.
- [x] Register the exact isolated-UAT Website key and CI debug token through the
      separately authorized manual Console procedure.
- [x] Run automated isolated-UAT deployment/browser rehearsal and final Human UAT; visible metrics passed with no known defects.
- [x] Clean the exact Human-UAT request, normalized children, Order, and Anonymous identity while preserving bounded audit evidence and the queue counter.
- [ ] Obtain explicit exact-head approval before merging PR #10.

**Production Hardening Work Package 5 — Full Isolated Production Release Rehearsal — complete, approved, squash-merged, and closed**

Current state:

- [x] WP1, WP2, and WP3 are approved and squash-merged into `main`.
- [x] WP4 was implemented on `feature/anonymous-abuse-controls`, approved at exact PR head `b69c220b973d537b15dbb05bbd6317e83d192eba`, and squash-merged through PR #8 as `a41cba9cbed8ba9827db5366764fad0df66d8313`.
- [x] Balanced Customer-request caps are enforced across the Customer UI, shared TypeScript validation, Firestore Rules, and trusted Staff confirmation.
- [x] Bounded normalized request storage, retry/idempotency controls, cross-tab locking, and cooldown behavior are implemented with legacy read compatibility.
- [x] Asymmetric emergency disable/re-enable authority, server-controlled capability, audit evidence, and fail-closed intake are implemented.
- [x] Balanced bounded operational indicators, pagination, report/export limits, operational runbook, and six UAT indexes are implemented.
- [x] Projection V2 dry-run, reviewed atomic apply, idempotency, and final exact-head dry-run passed at fingerprint `wp4-5c4fce122e7d5d4f`.
- [x] Local automated validation passed: 213 application tests and 22 canonical Firestore Emulator tests, plus lint, typecheck, both builds, formatting, workflow parsing, diff, and secret checks.
- [x] Human-UAT defects in limit feedback, Operations layout, Customer status recovery, two-tab active-request convergence, and capable-Staff usability were corrected with regression coverage.
- [x] Exact-head workflow `29491949583` passed security/control and real synchronized two-tab Customer UI → Staff UI → Queue → History → Reports → Excel browser rehearsal at corrected implementation head `e0656753341641fa3110f3cfa5b32c4861d52069`.
- [x] Desktop/tablet/mobile Operations layouts, status refresh, disabled-intake status access, cooldown-expired second-tab convergence, and designated capable-Staff re-enable passed in isolated UAT.
- [x] Customer QR controls were consolidated under the collapsed-by-default Settings section with direct-anchor expansion; Customer Requests is processing-only with search, filters, and pagination; Products is the sole Staff availability UI.
- [x] The private topping-availability map remains the canonical transactional input for Products, Projection V2, Customer rendering, and trusted confirmation; no legacy or historical records were migrated or rewritten.
- [x] Exact-head workflow `29501510514` passed the final isolated-UAT deployment, security/control tests, responsive Settings checks, Products-only control check, Customer Requests regression, real Customer-to-Staff flow, Queue, History, Reports, Excel, and cleanup at `2e7180ae5c1a5ab57ef544601428f973764685f8`.
- [x] Exact-head workflow `29503666183` passed final isolated UAT at `78cfffe524025c4a32ff5dfabdbfdca1d1056e5d`, including desktop/tablet/mobile Customer Requests search-icon geometry, focus/hover, keyboard, accessibility, and regression checks.
- [x] Final approval workflow `29505898681` passed at exact PR head `b69c220b973d537b15dbb05bbd6317e83d192eba`, including exact checkout, tests, isolated-UAT build/deploy, security/control validation, browser rehearsal, and cleanup.
- [x] The capable UAT Staff authorization was verified unchanged; the dedicated ordinary UAT Staff was designated active without re-enable capability.
- [x] Temporary UAT requests, normalized children, identities, authorization records, and mismatch controls were removed.
- [x] Final Human UAT passed all 10 functional items; the Customer Requests search-icon Human recheck also passed; no known defects remain.
- [x] PR #8 received explicit exact-head approval, was squash-merged, and is closed.
- [x] WP5 started from exact verified `main` SHA `bcac47999734d2dfbb887401908b5423dae8e9b1` on `feature/full-isolated-production-release-rehearsal`; PR #9 was approved at exact head `b6825948d63faeee8e67d61bbaf759cfe0461330` and squash-merged as `f85b7f25f483888e48bc019ab982ee774207f128`.
- [x] Dedicated exact-SHA isolated workflow, production-like UAT runtime mode, deterministic manifest, rollback rehearsal, monitoring evidence, and Human-UAT runbook are implemented.
- [x] Exact-head workflow `29517251575` passed at approved PR head `b6825948d63faeee8e67d61bbaf759cfe0461330`: 235 application tests, 22 canonical Rules tests, three builds, six Ready indexes, zero-write Projection V2 dry/apply/idempotency, full Customer/Staff/legacy browser flows, ordinary/capable authorization controls, rollback/restoration, post-restore security, and cleanup.
- [x] Final isolated UAT state is enabled with projection fingerprint `wp4-5c4fce122e7d5d4f`, designated Staff unchanged, zero temporary WP5 requests/Orders, and deterministic release-manifest hash `f76ff2999a12640b6210d7d28866c9b314e1f25d2a7d47edfcb4536c177bd9f0`.
- [x] App Check/trusted-backend options are documented; no App Check enforcement, IAM elevation, API enablement, billing change, or Production action occurred.
- [x] Final WP5 Human UAT passed with no known defects; trusted-mismatch no-write protection and audit evidence were accepted from the automated rehearsal.
- [x] Final documentation-head validation, Ready-for-Review transition, explicit exact-head approval, and PR #9 squash merge completed.
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
- [x] Production Hardening Work Package 2 targeted Manual UAT and approval complete
- [x] Production Hardening Work Package 2 squash merge complete
- [x] Production Hardening Work Package 3 implementation, automated UAT, and Human Manual UAT complete
- [x] Production Hardening Work Package 3 exact-head PR approval and squash merge complete
- [x] Production Hardening Work Package 4 — implementation, automated isolated UAT, final Human UAT, exact-head approval, and squash merge complete
- [x] Production Hardening Work Package 5 — implementation and exact-head automated isolated release rehearsal complete
- [x] Production Hardening Work Package 5 — final Human UAT complete with no known defects
- [x] Production Hardening Work Package 5 — Full Isolated Production Release Rehearsal complete
- [x] Production Hardening Work Package 5 — exact-head review approval and squash merge complete
- [x] App Check/residual-risk decision — Path B approved
- [x] App Check monitoring isolated-UAT implementation, automated UAT, and Human UAT complete
- [ ] Production App Check monitoring registration/client release approved
- [ ] Production Cloud Firestore App Check enforcement approved
- [ ] Production Firebase Authentication App Check enforcement approved
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
