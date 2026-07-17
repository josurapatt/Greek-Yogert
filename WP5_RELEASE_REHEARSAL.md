# WP5 Full Isolated Production Release Rehearsal

## Authority and boundary

This runbook covers only `greek-yogert-customer-uat-2026`. It does not approve
or perform any action against `greek-yogert`. Production Customer QR remains
disabled and Production remains No-Go.

The dedicated workflow is
`.github/workflows/full-isolated-production-release-rehearsal.yml`. It can run
only from the WP5 PR branch or by a manual exact-SHA dispatch, uses only
the `customer-qr-uat` GitHub environment, rejects the Production project, and
never calls a Production workflow.

## Release-rehearsal architecture

The `release-rehearsal` Vite mode combines:

- the exact isolated-UAT Firebase Web App;
- an explicit Customer QR feature state;
- Production display behavior, without Demo/UAT labels or seed actions; and
- a runtime project interlock that fails Customer QR closed unless the embedded
  project is exactly `greek-yogert-customer-uat-2026`.

The mode is not used by the Production workflow. The safeguarded Production
workflow continues to build `production` with
`VITE_CUSTOMER_QR_ENABLED=false` and deploy Hosting only.

## Automated release sequence

1. Verify the exact source SHA, WP5 branch, UAT GitHub environment, service
   account project, Vite project, and Firebase project.
2. Capture sanitized pre-release Hosting, rules, indexes, projection, runtime
   control, Authentication-provider, designated-Staff, public-ID, and temporary
   data evidence.
3. Require the existing capable and ordinary Staff accounts and unchanged
   authorization documents.
4. Run the complete application and canonical Firestore Emulator suites, lint,
   TypeScript, and three builds: Production-disabled, ordinary UAT-enabled, and
   production-like release rehearsal.
5. Disable new intake, then deploy only the canonical Production-candidate
   rules and the exact six indexes to isolated UAT. Stop before deployment if
   the pre-state contains a missing or unrelated index.
6. Run Projection V2 dry-run, print and validate the exact allowed write plan,
   apply only the reviewed fingerprint, and prove zero-write idempotency.
7. Exercise ordinary disable, ordinary re-enable denial, capable re-enable, and
   client self-grant denial using only the two existing designated accounts.
8. Deploy the Customer-enabled production-like build to isolated UAT Hosting.
9. Run the real browser Customer-to-Staff, trusted-mismatch, duplicate,
   operational-control, Queue, History, Reports, Excel, and legacy Staff flow.
10. Capture bounded monitoring evidence and clean temporary browser records and
    anonymous identities.
11. Rehearse rollback with a Customer-disabled production-style Hosting build
    while hardened rules and all indexes remain active.
12. Restore the byte-identical saved Customer-enabled build, re-enable intake,
    repeat critical anonymous-denial and Hosting checks, verify exact cleanup,
    and generate the release manifest.

## Release manifest

The workflow creates a deterministic JSON manifest containing only:

- exact source SHA, UAT project ID, environment, and Customer QR state;
- canonical rules and index filenames plus SHA-256 hashes;
- required index count and readiness;
- Projection V2 schema, fingerprint, dry-run/apply/idempotency write counts;
- workflow identity and test-result summary;
- explicit deployment scope; and
- the SHA-256 rollback baseline for the saved enabled Hosting bundle.

Manifest validation recursively rejects credential, token, password, private
key, Customer-name/note, owner/actor UID, and Staff-UID fields. Sanitized
evidence is retained as one GitHub Actions artifact for 30 days. The credential
file and working evidence remain in the ephemeral runner and are removed or
destroyed with the runner.

## Rollback runbook

### Trigger conditions

Invoke the rollback for an isolation failure, wrong menu/price, duplicate Order
or queue allocation, material browser failure, unexpected permission behavior,
uncontrolled request volume, Critical operational indicator, or inability to
prove the exact deployed candidate.

### Responsible role

The release operator executes Hosting restoration. Any active Staff member may
disable intake. Re-enable requires the designated capable Staff role or the
guarded isolated-UAT release operator. Future Production rollback authority is
not approved by this runbook.

### Rehearsed method

1. Disable Customer intake and retain the control audit event.
2. Build `release-rehearsal` with the exact UAT Firebase configuration and
   `VITE_CUSTOMER_QR_ENABLED=false`.
3. Deploy only Hosting to `greek-yogert-customer-uat-2026`.
4. Verify `/order` and `/order/status/*` show the Customer-unavailable boundary,
   while the Staff login entry remains available.
5. Keep `firestore.production.rules` and all six indexes active. Do not deploy
   legacy broad rules, delete indexes, or delete business data.
6. Restore the saved enabled `dist` directory and require its SHA-256 tree hash
   to equal the captured rollback baseline.
7. Deploy only Hosting to the exact UAT project, verify `/order`, restore intake
   to enabled, and rerun anonymous private-collection denials.

### Expected state and limitations

The Customer-disabled Hosting boundary removes both new ordering and direct
Customer status entry. Staff routes and server-side processing remain available.
Runtime-control disable, tested before Hosting rollback, preserves an existing
owner's status and Staff processing. Hosting rollback does not revoke existing
Auth sessions or revert requests, Orders, audit events, or queue counters.
Queue counters are never decremented as cleanup.

## Monitoring rehearsal

The automated window starts with pre-release state capture and ends only after
post-restoration security and cleanup verification. It observes:

- Email/Password and Anonymous Auth readiness;
- exact request and Order counts for the unique `WP5-` marker;
- anonymous permission denials and public-read success;
- one Customer conversion and exact queue allocation;
- duplicate and trusted-mismatch no-write results;
- bounded Warning/Critical UI indicators and browser console errors;
- Hosting enabled, rollback-disabled, and restored behavior; and
- final cleanup, index readiness, projection fingerprint, designated-Staff
  state, and Customer Ordering state.

It is a bounded rehearsal, not guaranteed real-time alerting.

Recommended future Production window, pending approval: a staffed two-hour
active smoke/rollback window followed by 24 hours of enhanced review. Retain the
WP4 Warning/Critical thresholds, treat any isolation, duplicate Order/queue,
malformed control, or projection-integrity failure as immediate Critical, and
authorize one named operational lead plus one backup to order rollback. This
recommendation is not approved.

## App Check and trusted-backend decision

The current browser directly uses Firebase Authentication and Firestore. App
Check can therefore add a meaningful attestation layer for Firestore and Auth:
after a separately monitored rollout and enforcement decision, requests without
a valid token can be rejected. Firebase recommends reCAPTCHA Enterprise for new
web integrations and documents a 10,000-assessment monthly no-cost allowance.
Spark operation must remain within provider quotas; it must not be treated as
unlimited zero-cost capacity.

App Check would raise the cost of simple scripts using a copied Web API key and
would provide valid/invalid/unverified request metrics. It would not identify a
human, stop a real browser from creating new Anonymous identities, enforce a
per-person or per-IP request rate, prevent reuse of ordinary Firestore session
tokens during their TTL, or replace Authentication, Security Rules, trusted
confirmation, idempotency, and operational shutdown. Firebase documents replay
protection for standard Google services as unavailable for Cloud Firestore.

| Option                       | Protection                                                                                           | Cost/architecture                                                                                                                        | Residual risk                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| WP4 bounded controls only    | Rules isolation, bounded payloads, stable request ID, indicators, manual shutdown                    | Current Spark architecture; no new service                                                                                               | Identity rotation and automated real-browser abuse remain possible                                |
| Firebase App Check           | Adds app/browser attestation and invalid/unverified metrics                                          | Separate provider registration, client rollout, CI/debug strategy, monitoring, and explicit enforcement approval; provider quota applies | Not a secure rate limiter; legitimate or automated browsers can still rotate Anonymous identities |
| Trusted backend/rate limiter | Can enforce server-side per-IP/device/account budgets, replay/idempotency, and centralized admission | Requires a backend, operational ownership, and likely Blaze/billing; outside WP5                                                         | Strongest control, but still requires abuse policy and monitoring                                 |

Recommendation: do not enable App Check enforcement in WP5. Before Production,
either explicitly accept the WP4 residual risk with staffed shutdown authority,
or approve a separate staged App Check task (register, deploy unenforced,
monitor, rehearse recovery, then decide enforcement). For materially higher or
unattended volume, prefer a trusted backend/rate limiter; that requires a future
architecture and billing decision. Production remains No-Go while this decision
is pending.

Official references:

- <https://firebase.google.com/docs/app-check>
- <https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider>
- <https://firebase.google.com/docs/app-check/monitor-metrics>
- <https://firebase.google.com/docs/app-check/enable-enforcement>
- <https://firebase.google.com/pricing>

## Verified automated evidence

The PR's final exact-head rehearsal [29517251575](https://github.com/josurapatt/Greek-Yogert/actions/runs/29517251575) succeeded at approved PR SHA `b6825948d63faeee8e67d61bbaf759cfe0461330` against only `greek-yogert-customer-uat-2026`.

- 235 application tests across 27 files and 22 canonical Firestore Emulator tests passed; lint, TypeScript, all three builds, formatting, workflow/static checks, diff integrity, and credential scans passed.
- Rules SHA-256 was `331eabc38e385c8a03c3ca9643c01b7b5cf6cf3d1c6e663a50eb6d2ee2d22579`; indexes SHA-256 was `90e5075281d826511a99bc42433f8c86753455284bfd8eba143f0e242e32e991`; all six composite indexes were Ready.
- Projection V2 fingerprint was `wp4-5c4fce122e7d5d4f`. Dry-run, reviewed apply, and idempotency each required 0 writes because the isolated target was already current; forbidden namespaces were absent.
- The full production-like Customer-to-Staff and direct legacy Staff browser flows passed, as did ordinary disable, ordinary re-enable denial, client self-grant denial, capable restore, bounded monitoring, Customer-disabled rollback, byte-identical enabled restoration, and post-restore anonymous security denials.
- Final state was Customer Ordering enabled, both Auth providers ready, designated Staff unchanged, and 0 temporary WP5 requests/Orders. Only bounded control-audit evidence was retained.
- Rollback bundle SHA-256 was `4827d9e36710c99315a9590d4a1781a826d310e08bb88f98c056d77975490c25`; deterministic release-manifest SHA-256 was `f76ff2999a12640b6210d7d28866c9b314e1f25d2a7d47edfcb4536c177bd9f0` and the downloaded manifest artifact SHA-256 was `85ec8774dd61582b486b301fd415a2d794d6629cb3267e92b91f4e00f8ce5cf0`.
- Sanitized evidence artifact `wp5-isolated-release-rehearsal-b6825948d63faeee8e67d61bbaf759cfe0461330` is retained for 30 days. No Production project, workflow, Authentication, IAM, Firestore, Hosting, API, billing, or business data was accessed or changed.

Final Human UAT passed with no known defects. Trusted-mismatch no-write protection and audit evidence were accepted from this automated evidence without requiring manual repetition. PR #9 was approved at the exact head above, squash-merged as `f85b7f25f483888e48bc019ab982ee774207f128`, and closed. Production approval remains separate.

## WP5 Human UAT checklist

The following checklist records the final Human UAT accepted on 2026-07-16.
Human UAT does not approve merge or Production.

- [x] Record approved exact PR head `b6825948d63faeee8e67d61bbaf759cfe0461330` and successful workflow `29517251575`.
- [x] Confirm the visible URL is the isolated UAT Hosting domain.
- [x] Sign in with the designated capable Staff account; do not change its
      password or authorization.
- [x] Verify Home, Staff Order, Queue, History, Reports, Products, Settings, and
      Customer Requests.
- [x] Confirm the Staff header shows Production display behavior and no
      Demo/UAT label or seed action is visible.
- [x] Confirm Settings Customer QR is collapsed by default.
- [x] Open `/settings#customer-ordering`; confirm expansion and focus.
- [x] Confirm Customer Requests has no ordering controls and Products is the
      sole availability-control UI.
- [x] Open `/order` in a fresh customer profile and confirm the production-like
      Customer flow with no UAT label.
- [x] Compare sampled public menu, availability, packaging, and option labels
      with Products/current UAT configuration.
- [x] Create one low-value two-line request with packaging/options and the
      unique Human marker.
- [x] Confirm pending status, refresh persistence, and same-profile two-tab
      convergence on exactly one request.
- [x] Confirm it through Staff with mixed payment; verify exactly one Order and
      one queue allocation.
- [x] Verify confirmed Customer status, Queue details, then complete or cancel
      using the agreed safe UAT fixture.
- [x] Verify History, Reports, and Excel values and labels.
- [x] Accept the automated controlled trusted-mismatch evidence: visible rejection, no Order, no queue allocation, and no partial write; manual repetition was not required.
- [x] Create one direct legacy-compatible Staff Order and verify Queue,
      History, Reports, and Excel.
- [x] Sign in as ordinary Staff, disable intake, and verify the configured
      maintenance message.
- [x] Verify an existing Customer status and existing request processing while
      intake is disabled.
- [x] Confirm ordinary Staff cannot re-enable or self-grant capability.
- [x] Sign in as capable Staff and re-enable; accept the automated reason, explicit-confirmation, and audit evidence without requiring manual audit inspection.
- [x] Check Thai boundary feedback, cooldown-expired duplicate prevention,
      terminal pointer clearing, and readable Warning/Critical indicators.
- [x] Confirm the final isolated-UAT Customer Ordering state is enabled and no
      temporary Human-UAT request/Order remains, except deliberately retained
      bounded audit evidence.
- [x] Confirm Production was not accessed, Production Customer QR is disabled,
      PR #9 is squash-merged/closed, and Production remains No-Go.
