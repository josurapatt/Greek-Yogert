# App Check Monitoring Runbook

## Authority and boundary

Path B is approved: integrate Firebase App Check in monitoring-only mode before
the first Customer QR Production launch. This work package is limited to
`greek-yogert-customer-uat-2026` and uses `ReCaptchaEnterpriseProvider`.

This runbook does not approve any action in `greek-yogert`, App Check
enforcement, billing, Blaze, Cloud Functions, Cloud Run, or Production rollout.
Firestore, Authentication, and every other Firebase service must remain
unenforced.

## Client architecture

The exact enabled configuration is:

```text
VITE_APP_ENVIRONMENT=customer-qr-uat
VITE_FIREBASE_PROJECT_ID=greek-yogert-customer-uat-2026
VITE_FIREBASE_APP_CHECK_ENABLED=true
VITE_FIREBASE_APP_CHECK_PROVIDER=recaptcha-enterprise
VITE_FIREBASE_APP_CHECK_SITE_KEY=<public UAT website key>
```

All five values must be valid. The UAT build then includes the App Check SDK and
initializes it immediately after the Firebase app and before Authentication or
Firestore. Token auto-refresh is enabled. The runtime records only configured
state, provider, monitoring-only mode, token success/failure, environment, and
project identity. It never records the site key or token value.

Missing or malformed configuration does not select another provider. App Check
stays uninitialized, diagnostics show a failure reason, and the unenforced
Firebase client continues operating so Staff can diagnose the monitoring gap.

Production-disabled and release-rehearsal builds resolve to a no-SDK bootstrap.
They reject any attempt to enable the UAT provider through the wrong environment
or project. The existing Production workflow is unchanged.

## Required manual isolated-UAT registration

Stop before this procedure unless the user explicitly authorizes the manual
Console action. Never open or change the Production project.

1. Open Google Cloud Console and select exactly
   `greek-yogert-customer-uat-2026`.
2. Open reCAPTCHA Enterprise. If prompted, enable the reCAPTCHA Enterprise API
   only in this UAT project.
3. Create a Website key using score-based detection. Leave the checkbox
   challenge option unselected.
4. Allow exactly `greek-yogert-customer-uat-2026.web.app`. Add another domain
   only if Firebase shows that it is already required by this exact UAT Web App.
   Never add `localhost`, a wildcard, or a Production domain.
5. Open Firebase Console for exactly `greek-yogert-customer-uat-2026`, then
   Security > App Check > Apps.
6. Register Web App `1:595147478182:web:f8cfb2a7103557ef791067` with the
   reCAPTCHA Enterprise provider and the Website key. Keep the default one-hour
   TTL.
7. Confirm Cloud Firestore, Firebase Authentication, and every other service
   remain **Unenforced**. Do not click Enforce.
8. Copy the public Website key directly into the encrypted GitHub environment
   secret `CUSTOMER_UAT_APP_CHECK_SITE_KEY` in `customer-qr-uat`. Do not paste it
   into chat or source.
9. In the same UAT App Check app, create one CI debug token under Manage debug
   tokens. Copy it directly into encrypted GitHub environment secret
   `CUSTOMER_UAT_APP_CHECK_DEBUG_TOKEN`. Do not print, download into the
   repository, or paste it into chat.
10. Confirm the project remains Spark with no Cloud Billing account. If the
    Console reports a different assessment quota, shared scope, billing
    requirement, or project identity, stop without registering or deploying.

After registration, deliberately apply the exact `run-app-check-uat` label to
Draft PR #10. The labeled-PR trigger binds the run to that PR's exact head SHA
and `feature/app-check-monitoring`. Remove and reapply the label only when an
explicit rerun is approved. The workflow deploys Hosting only to the isolated
UAT project. It performs no App Check configuration or enforcement action.

## Debug-provider and CI safety

The ordinary UAT bundle contains no debug token or CI flag. The Playwright
process accepts the debug token only when all of these are exact:

- `CUSTOMER_UAT_APP_CHECK_DEBUG_MODE=ci`;
- `CUSTOMER_UAT_FIREBASE_PROJECT_ID=greek-yogert-customer-uat-2026`;
- a non-empty registered `CUSTOMER_UAT_APP_CHECK_DEBUG_TOKEN` is supplied from
  the encrypted UAT environment.

The token is injected into each Playwright browser context before page load. It
is never a Vite variable, bundle value, artifact field, log value, or manifest
value. Normal browser sessions use reCAPTCHA Enterprise, not the debug token.

To revoke or rotate a debug token:

1. Open Firebase Console for exactly the isolated UAT project.
2. Open Security > App Check > Apps and Manage debug tokens for the exact UAT
   Web App.
3. Revoke the affected token immediately.
4. Delete or replace `CUSTOMER_UAT_APP_CHECK_DEBUG_TOKEN` in the
   `customer-qr-uat` GitHub environment.
5. Cancel any active UAT run using the old token and rerun only after rotation.

## Assessment quota and monitoring

The reCAPTCHA Enterprise no-cost allowance is treated as a hard limit of 10,000
assessments per calendar month. The default one-hour TTL is retained; the web
SDK normally refreshes at approximately half the TTL, so active browser time,
not Firestore request count alone, consumes assessments.

- Warning: 7,000 assessments in the current month. Stop nonessential automated
  browser runs and review active-browser usage.
- Critical: 9,000 assessments. Stop further App Check UAT sessions except a
  separately approved incident check.
- Hard stop: 10,000 or any Console indication that paid usage would begin. Do
  not enable billing or shorten the TTL.

Review App Check API metrics separately for Cloud Firestore and Firebase
Authentication: verified, outdated, unknown-origin, and invalid requests. A
successful browser token exchange proves client operation but does not prove
that Console metrics have populated. Record metrics only when they are visible.

## Recovery

Because enforcement remains disabled, App Check monitoring cannot reject
Firebase requests. If the client integration causes a regression:

1. Disable Customer Ordering with the existing Staff emergency control.
2. Roll isolated UAT Hosting back to the last approved WP5 bundle.
3. Keep Firestore Rules, indexes, Authentication, Staff authorization, and data
   unchanged.
4. Revoke the debug token if exposure is suspected.
5. Keep App Check enforcement off while investigating.
6. Re-enable Customer Ordering only after the exact healthy UAT bundle and
   critical paths are verified.

## Residual risks

App Check does not identify a person or provide a trusted rate limiter. A real
or automated browser may obtain a valid token, create new Anonymous identities,
and submit multiple individually bounded requests. Session tokens remain
reusable during their TTL. Existing request caps, duplicate prevention,
operational indicators, staffed shutdown, trusted confirmation, and rollback
therefore remain required.

Production App Check registration, a Production monitoring client release,
Cloud Firestore enforcement, and Authentication enforcement are four separate
later decisions. Authentication support is Preview and must not inherit a
Firestore enforcement approval.

## Human UAT checklist

- [ ] Confirm the visible URL is exactly the isolated UAT Hosting domain.
- [ ] Confirm Settings shows App Check provider `recaptcha-enterprise`, mode
      `monitoring-only`, exact UAT environment/project, and `token-obtained`.
- [ ] Confirm Cloud Firestore and Authentication remain Unenforced in App Check.
- [ ] Capable Staff login and all Staff routes pass.
- [ ] Ordinary Staff login passes and authorization remains unchanged.
- [ ] Customer Anonymous sign-in, menu, request submission, status refresh, and
      same-profile two-tab convergence pass.
- [ ] Staff confirmation creates exactly one Order and queue allocation.
- [ ] Queue, History, Reports, and Excel pass.
- [ ] Ordinary Staff can disable but cannot re-enable Customer Ordering.
- [ ] Capable Staff can re-enable Customer Ordering.
- [ ] Desktop and mobile layouts remain usable.
- [ ] App Check metrics are recorded only if visibly populated; otherwise mark
      them pending without claiming success.
- [ ] Temporary requests, Orders, Anonymous identities, and test authorization
      are cleaned; designated Staff remains unchanged.
- [ ] Final isolated-UAT Customer Ordering state is enabled.
- [ ] Production remained untouched, Customer QR disabled, and rollout No-Go.

## Official Firebase references

- <https://firebase.google.com/docs/app-check>
- <https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider>
- <https://firebase.google.com/docs/app-check/web/debug-provider>
- <https://firebase.google.com/docs/app-check/monitor-metrics>
- <https://firebase.google.com/docs/app-check/enable-enforcement>
- <https://firebase.google.com/pricing>
