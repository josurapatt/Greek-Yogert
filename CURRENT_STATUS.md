# GreekYogurtOrderApp — Current Status

This is the current operational snapshot. Git history is authoritative for earlier work-package history.

## Status metadata

- Last verified: 2026-07-17 (Asia/Bangkok)
- Repository: `josurapatt/Greek-Yogert`
- Local repository: `C:\Users\surapat.c\Desktop\GreekYogurtOrderApp`
- Current branch: `feature/app-check-monitoring`
- App Check monitoring work-package base: `15b19caff7a864f7727bfd27466b2f92000648f1`
- App Check implementation commit: `13f78e7558b740eeb641bdb30451574887e08fe5`
- App Check automated-UAT implementation baseline: `e0775d6a6cf1fc76bc41901c4914d3da8dae57bd`
- App Check PR: [#10 — Add isolated UAT App Check monitoring](https://github.com/josurapatt/Greek-Yogert/pull/10) — Draft, open, and unmerged
- App Check decision: Path B approved; isolated-UAT monitoring implementation in progress; enforcement unapproved and disabled
- WP5 base `main` SHA: `bcac47999734d2dfbb887401908b5423dae8e9b1`
- WP5 approved PR head: `b6825948d63faeee8e67d61bbaf759cfe0461330`
- WP5 squash-merge commit: `f85b7f25f483888e48bc019ab982ee774207f128`
- WP5 PR: [#9 — Full isolated Production release rehearsal](https://github.com/josurapatt/Greek-Yogert/pull/9) — approved, squash-merged, and closed
- WP5 exact-head workflow: [29517251575](https://github.com/josurapatt/Greek-Yogert/actions/runs/29517251575) — successful at the approved PR head
- WP4 final Human-UAT implementation head: `78cfffe524025c4a32ff5dfabdbfdca1d1056e5d`
- WP4 approved PR head: `b69c220b973d537b15dbb05bbd6317e83d192eba`
- WP4 squash-merge commit: `a41cba9cbed8ba9827db5366764fad0df66d8313`
- PR: [#8 — Harden anonymous ordering abuse controls](https://github.com/josurapatt/Greek-Yogert/pull/8) — approved, squash-merged, and closed
- PR state gate: complete
- Production status: **No-Go**; Production was not accessed or changed during WP5

## App Check monitoring work-package state

Path B is approved for implementation and testing only in
`greek-yogert-customer-uat-2026`. The focused branch integrates the Firebase Web
App Check SDK with `ReCaptchaEnterpriseProvider` only when the environment,
project, explicit enable flag, provider, and public Website key all match the
isolated UAT boundary.

The enabled bootstrap runs after Firebase app creation and before
Authentication or Firestore. Runtime diagnostics expose only configured state,
provider, monitoring-only mode, token success/failure, environment, and project
identity. Production-disabled and release-rehearsal builds resolve to a no-SDK
bootstrap. The Production workflow is unchanged.

Local and exact-head workflow validation passed with 263 application tests
across 33 files, including 27 focused App Check tests across 6 files, plus 22
canonical Firestore Emulator tests. TypeScript, lint, formatting, JavaScript syntax, workflow actionlint,
Production-disabled, isolated-UAT, and release-rehearsal builds, bundle
inspection, Production-project rejection, diff checks, and repository/changed-
file secret scans passed.

The exact isolated-UAT reCAPTCHA Enterprise Website key and CI debug token
loaded successfully from the `customer-qr-uat` GitHub environment without
being logged or stored in Git. [Exact-head workflow 29564143960](https://github.com/josurapatt/Greek-Yogert/actions/runs/29564143960)
passed at implementation baseline `e0775d6a6cf1fc76bc41901c4914d3da8dae57bd`.
It validated all three bundle modes, deployed Hosting only to
`greek-yogert-customer-uat-2026`, obtained an App Check token in
monitoring-only mode, completed Customer-to-Staff and ordinary-Staff browser
UAT, uploaded sanitized evidence, and verified cleanup. The final isolated-UAT
state is Customer Ordering enabled with zero temporary Customer requests and
Orders; both designated Staff authorization documents remain unchanged.

The failed runs exposed and corrected a shared-harness coupling between
designated Staff and the WP5-only `release-rehearsal` display identity. The
browser harness now requires an explicit isolated artifact identity, keeps the
normal App Check artifact bound to `customer-qr-uat`, keeps WP5 bound to
`release-rehearsal`, restores the isolated intake baseline before a retry, and
accepts only the exact headless reCAPTCHA storage-access and report-only CSP
console messages inside the exact CI debug boundary. All other environment,
project, console, and fail-closed checks remain strict.

Human UAT and exact-head approval remain pending. No App Check enforcement has
been enabled, and no Production resource has been accessed or changed.

## WP5 implementation and automated rehearsal state

Production Hardening Work Package 5 implementation, exact-head full isolated Production release rehearsal, rollback rehearsal, final Human UAT, exact-head approval, and squash merge are complete with no known defects. Trusted-mismatch no-write protection and control-audit evidence were accepted from the automated evidence. PR #9 is merged and closed; this does not approve any Production rollout gate.

Implemented and verified:

- A dedicated `release-rehearsal` runtime mode uses the exact isolated-UAT Firebase Web App with Customer QR enabled and Production-like display behavior. The runtime interlock fails Customer QR closed for any project other than `greek-yogert-customer-uat-2026`.
- The dedicated workflow is exact-SHA-, branch-, environment-, credential-project-, Vite-project-, and Firebase-project-bound; it uses only the `customer-qr-uat` GitHub environment and explicitly rejects `greek-yogert`.
- The safeguarded Production workflow remains Hosting-only, manual, and Customer-QR-disabled. WP5 did not invoke it.
- The workflow captures sanitized pre-state; validates designated capable/ordinary Staff accounts without changing passwords or authorization; runs the complete tests and three builds; deploys candidate Rules, six indexes, Projection V2, and Hosting only to isolated UAT; exercises browser/security/authorization controls; rehearses Customer-disabled rollback; restores the byte-identical enabled candidate; and verifies cleanup.
- A deterministic non-secret release manifest records the exact SHA, project, mode, feature state, Rules/index hashes, Projection V2 fingerprint/counts, workflow identity, test summary, deployment scope, rollback bundle hash, and manifest hash.
- The App Check decision is documented in `WP5_RELEASE_REHEARSAL.md`: no enforcement in WP5; Production requires either explicit residual-risk acceptance with staffed shutdown authority or a separately approved staged App Check task. A trusted backend/rate limiter remains the strongest future option but requires a separate architecture/billing decision.

## WP4 implementation state

Production Hardening Work Package 4 implementation, automated isolated UAT, final Human UAT, Customer Requests search-icon recheck, exact-head approval, and squash merge are complete on `main`. No known WP4 defects remain. WP5 automated and Human-UAT evidence is recorded above.

Implemented:

- Balanced Customer-request caps are enforced consistently in the Customer UI, shared TypeScript validation, Firestore Rules, and trusted Staff confirmation. Product-specific limits may be lower; the stricter limit wins.
- Customer payloads reject unknown fields, unsupported values, excessive nesting, oversized arrays, invalid currency precision, and values over the approved limits. Values are rejected rather than truncated or corrected.
- New requests use a bounded normalized parent/child model with exact child reads, while legacy and confirmed requests remain readable and are not rewritten.
- Customer submission uses a stable persisted active-request envelope, same request UUID, ambiguous-result recovery, cross-tab locking, and a five-second cooldown. Cooldown expiry never permits a second normal-UI request while the owned request remains pending.
- Limit attempts now show nearby Thai feedback without removing selections or silently truncating nickname/note input. The Customer can return to the stable owned status route across refresh and same-profile tabs.
- The Customer Ordering control and Operations indicators use a dedicated responsive layout that remains readable at desktop, tablet, and mobile widths.
- Runtime ordering control fails closed for new Customer intake when missing or malformed. Existing Customer status pages and Staff processing remain available.
- Any active non-anonymous Staff user can disable intake. Re-enable requires the server-controlled `canManageCustomerOrdering` capability, explicit confirmation, and a reason. Clients cannot grant or edit that capability.
- Disable and re-enable actions record previous state, new state, acting Staff UID, server timestamp, required reason, and control schema version.
- Balanced operational indicators use bounded queries and Staff dashboard/manual-review evidence. Thresholds do not automatically block Customers and are not represented as guaranteed real-time alerts.
- Staff request views, Queue, History, Reports, backup/export, and monitoring paths are bounded and paginated. Six required Firestore indexes are defined and were deployed only to isolated UAT.
- Projection V2 includes the request policy and operational control in the deterministic fingerprint and preserves atomic dry-run/apply/idempotency behavior.
- Customer QR operational controls now live only at the bottom of Settings under `การควบคุม Customer QR`. The section is collapsed by default, expands and receives focus for `/settings#customer-ordering`, and retains the existing authorization, audit, atomic-write, operational-indicator, and Projection V2 behavior.
- Customer Requests is request-processing only: it provides bounded pending-request status, search, filters, 12-row client pagination over the bounded subscription, details, confirmation, and rejection. It contains no ordering-control or UAT projection-seed action, and existing requests remain processable while intake is disabled.
- Products is the sole Staff UI for product, topping, and separated-packaging availability. The private `settings/toppingAvailability.availability` map is retained as active canonical runtime data, not as a hidden compatibility override: Products writes it transactionally with the public projection and trusted confirmation re-reads it. Historical order snapshots remain unchanged and require no migration.

## Validation evidence

Local validation for the exact implementation content:

- Application tests: 213 passed across 25 files
- Canonical Firestore Emulator tests: 22 passed
- TypeScript: passed
- Lint: passed
- Production-disabled build: passed
- UAT-enabled build: passed
- Prettier 3.6.2: passed for all changed supported files
- Workflow YAML/JSON parsing, Node syntax checks, UAT bundle checks, diff checks, and changed-file secret scan: passed
- Production workflows: unchanged

Projection V2 isolated-UAT evidence:

- [Initial dry run 29382197721](https://github.com/josurapatt/Greek-Yogert/actions/runs/29382197721): fingerprint `wp4-5c4fce122e7d5d4f`, 8 planned writes, 0 performed
- [Reviewed apply 29382254874](https://github.com/josurapatt/Greek-Yogert/actions/runs/29382254874): 8 allowed writes applied atomically
- [Idempotency run 29382293555](https://github.com/josurapatt/Greek-Yogert/actions/runs/29382293555): 0 planned and 0 performed writes
- [Final exact-head dry run 29384022168](https://github.com/josurapatt/Greek-Yogert/actions/runs/29384022168): same fingerprint, all six menus plus availability, policy, and control current; 0 planned and 0 performed writes

Latest final automated isolated UAT:

- [Workflow 29505898681](https://github.com/josurapatt/Greek-Yogert/actions/runs/29505898681) succeeded for the approved final PR head `b69c220b973d537b15dbb05bbd6317e83d192eba`, including exact-source checkout verification, application and Rules tests, isolated-UAT build/deploy, security/control validation, responsive browser rehearsal, and cleanup.
- Desktop, tablet, and mobile browser checks verified the Customer Requests search icon remains centered inside the input, with correct padding, alignment, focus/hover behavior, keyboard navigation, accessible naming, and no overflow.
- Settings collapsed/anchor behavior and desktop/tablet/mobile layouts passed; Customer Requests contained no Operations or projection-seed controls; Products exposed exactly one global packaging control; capable disable/re-enable, maintenance messaging, disabled-intake status access, and Staff processing while disabled passed.
- Security/control rehearsal passed ordinary-Staff disable, ordinary-Staff re-enable denial, capable-Staff re-enable, capability self-grant denial, and missing/malformed-control fail-closed behavior while preserving Customer status and Staff processing.
- Browser rehearsal opened both pages before Anonymous Auth initialization, created one anonymous identity, synchronized both submit handlers at the actual write boundary, waited beyond cooldown, invoked the blocked second submit handler, and kept exactly one request parent, one item document, and one summary document. Both tabs converged on request `26d42c21-864d-4349-9ba7-93fa60a5a04b`, refreshed successfully, and cleared the profile-wide pointer only after terminal confirmation.
- The two preserved failed Human-UAT requests `e93cf4ae-ae6f-4918-8819-c1a26239b0ca` and `8a2e8805-218b-42a5-96d4-8bf443b5dae0` remain pending and have different safe owner references, confirming the concurrent Anonymous-UID initialization race. Each has matching retry ID, item `00`, summary `0`, and consistent ownership metadata. The older preserved-link test is N/A without its original anonymous browser identity; that does not reduce the confirmed same-profile blocker.
- Projection integrity remained fingerprint `wp4-5c4fce122e7d5d4f`. Temporary UAT requests, normalized children, identities, authorization records, and mismatch controls were removed. UAT intake was restored to enabled.
- Read-only UAT diagnostics verified Email/Password enabled and both designated Authentication users remain enabled with the approved capable/ordinary authorization split. No password update was requested, no ephemeral password secret was present, and no password or UID was logged or stored in Git.

Defects found and corrected during rehearsal:

- Fresh submissions no longer perform an ownership-protected read of a nonexistent request before creation; ambiguous recovery still uses exact owned reads without weakening Rules.
- The trusted-mismatch negative control is now temporary and isolated instead of depending on a permanent WP3 request.
- Report export waits for bounded-query readiness before download assertions.
- Human limit tests were silent because disabled boundary controls and input length attributes prevented any explanatory path. Boundary attempts now preserve values and show Thai line/total/option/character feedback and counters.
- The Operations panel inherited a three-column settings-card grid despite having no icon, collapsing content into a narrow column. It now uses a dedicated one-column responsive card/metric layout.
- Successful submission cleared the retry envelope without retaining an active request pointer. The stable request ID now persists through pending status, refresh, same-profile tabs, and transient load failures, and clears only at terminal status.
- The five-second cooldown was the only post-success duplicate guard, and initial Anonymous sign-in could race before local persistence completed, producing different UIDs in two tabs. Auth persistence/bootstrap and submission locks are now browser-profile scoped; an identity change fails closed; the active pointer cannot be replaced; and the pointer plus exact owned request is revalidated while holding the lock immediately before `writeBatch.commit()`.
- Re-enable authorization worked but the capable account and visible proof were unclear. The panel now shows explicit capable/ordinary Thai labels, and the exact isolated-UAT account is designated through guarded admin tooling.
- The final browser failure was a test-harness race against the Operations panel's initial fail-closed render. The rehearsal now waits for the authoritative runtime state and uses non-checkbox action selectors.
- The Customer Requests search icon floated above the input because undefined `sr-only` styling left redundant label spans in normal grid flow. The spans were removed, the existing accessible names were retained, and the icon is now centered deterministically inside the input. Final Human recheck passed.

## WP5 automated release-rehearsal evidence

- [Exact-head workflow 29517251575](https://github.com/josurapatt/Greek-Yogert/actions/runs/29517251575) succeeded at approved PR head `b6825948d63faeee8e67d61bbaf759cfe0461330` and uploaded the sanitized artifact `wp5-isolated-release-rehearsal-b6825948d63faeee8e67d61bbaf759cfe0461330`.
- Application tests: 235 passed across 27 files. Canonical Firestore Emulator tests: 22 passed. Lint, TypeScript, Production-disabled build, ordinary UAT-enabled build, production-like release-rehearsal build, formatting, workflow validation, diff checks, and credential scans passed.
- Canonical Rules SHA-256: `331eabc38e385c8a03c3ca9643c01b7b5cf6cf3d1c6e663a50eb6d2ee2d22579`. Canonical indexes SHA-256: `90e5075281d826511a99bc42433f8c86753455284bfd8eba143f0e242e32e991`. All six required composite indexes were Ready.
- Projection V2 fingerprint remained `wp4-5c4fce122e7d5d4f`. Dry-run planned 0 writes, reviewed apply performed 0 writes because UAT was already current, and the idempotency dry-run planned 0 writes. No forbidden namespace was included.
- The production-like browser rehearsal passed Customer boundary feedback, same-profile two-tab convergence, one normalized request, trusted mismatch no-write, Staff confirmation with mixed payment, Queue, History, Reports, Excel, pagination, responsive Operations/search layouts, and the direct legacy Staff Order flow.
- Existing designated accounts passed capable/ordinary authorization checks. Ordinary Staff disable passed; ordinary re-enable and client self-grant were denied; capable restore passed. Their passwords, designated identities, and authorization documents were not mutated.
- Rollback deployed a Customer-disabled Hosting build while keeping hardened Rules and six indexes active, then restored the exact saved enabled bundle. Rollback bundle SHA-256: `4827d9e36710c99315a9590d4a1781a826d310e08bb88f98c056d77975490c25`.
- Post-restore security passed: public menu readable; private collections, request listing, and another owner's request denied. Final cleanup passed with zero temporary WP5 requests and Orders, Customer Ordering enabled, designated Staff unchanged, both Auth providers ready, and bounded control-audit evidence retained.
- Deterministic release manifest SHA-256: `f76ff2999a12640b6210d7d28866c9b314e1f25d2a7d47edfcb4536c177bd9f0`; downloaded manifest artifact SHA-256: `85ec8774dd61582b486b301fd415a2d794d6629cb3267e92b91f4e00f8ce5cf0`.
- No Production Authentication, IAM, Firestore, Hosting, workflow, API, billing, or business data was accessed or changed.

## WP5 final Human UAT evidence

- Production-like Staff UI/routes, Settings collapse/anchor/Customer QR controls, Products-only availability, and Customer menu consistency: passed.
- Customer request, refresh, same-profile two-tab convergence, mixed-payment confirmation, single Order/queue allocation, Customer status, Queue, History, Reports, Excel, and legacy direct Staff Order: passed.
- Ordinary Staff disable/re-enable denial, capable Staff restore, Thai limits, duplicate prevention, terminal clearing, final enabled state, and cleanup: passed.
- Trusted mismatch no-write protection and audit evidence: automated evidence accepted; additional manual repetition was not required.
- Reported defects: none.

## Environment status

### Isolated Customer QR UAT

- Firebase project: `greek-yogert-customer-uat-2026`
- Customer ordering: enabled
- Projection fingerprint: `wp4-5c4fce122e7d5d4f`
- WP5 production-like automated release rehearsal: passed at approved PR head `b6825948d63faeee8e67d61bbaf759cfe0461330`
- Rollback and exact enabled-candidate restoration: passed
- Final temporary WP5 request/Order counts: 0/0
- WP5 Human UAT: passed with no known defects
- Automated WP4 implementation/security/browser rehearsal: passed
- Corrected automated UAT: passed
- Final Human UAT: passed all 10 functional items
- Customer Requests search-icon Human recheck: passed
- Known defects: none
- App Check monitoring automated isolated UAT: passed at implementation baseline `e0775d6a6cf1fc76bc41901c4914d3da8dae57bd`
- App Check runtime evidence: monitoring-only, token obtained, no token value reported
- App Check temporary Customer requests/Orders: 0/0
- App Check Human UAT: pending

### Production

- Firebase project: `greek-yogert`
- Customer QR remains disabled by the Production build boundary
- No WP4 Production authorization was provisioned or changed
- No Production Authentication, IAM, Firestore rules, indexes, documents, Hosting, or workflow execution occurred
- Production remains **No-Go**

## Remaining gates

- [x] WP5 implementation and exact-head automated isolated Production release rehearsal complete
- [x] WP5 Human UAT complete with no known defects; trusted mismatch and audit evidence accepted from automation
- [x] PR #9 final documentation head passed all validation and was changed to Ready for Review
- [x] PR #9 received explicit exact-head approval and was squash-merged as `f85b7f25f483888e48bc019ab982ee774207f128`
- [ ] Every independent Production approval in `PRODUCTION_ROLLOUT_PLAN.md` completes

## Immediate next action

Perform the separately controlled App Check monitoring Human UAT at the exact
Draft PR head, then obtain exact-head approval before any Ready-for-Review or
merge action. Keep Production No-Go. Production App Check
registration/monitoring, Firestore enforcement, Authentication enforcement,
and every independent Production approval remain pending.
