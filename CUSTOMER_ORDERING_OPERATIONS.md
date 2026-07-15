# Customer Ordering Operations

## Scope

This runbook governs ordinary Customer QR intake. It does not authorize a Production release. Orders above 30 cups are coordinated manually outside the QR flow.

The controls below are operational safeguards available in the current client-and-Firestore architecture. They are not secure server-side rate limits, guaranteed push alerts, or automatic abuse prevention.

## Request policy

Customer request schema V2 rejects, rather than truncates or corrects:

- more than 12 product lines;
- more than 10 units on one line;
- more than 30 total units;
- more than 10 option entries on one line;
- anything other than exactly one granola choice under the current product model;
- option counts outside the product's configured minimum/maximum;
- nickname over 40 characters or note over 200 characters;
- a total above 5,000 THB;
- fractional, negative, non-finite, unknown, unsupported, or structurally excessive values.

The stricter product configuration always wins. Monetary snapshots use the application's existing whole-THB precision and remain untrusted until Staff confirmation rebuilds the order from current private products.

V2 creation is one atomic batch: one parent, one item document per line, and one or two six-line summary documents. The maximum is 15 writes. Legacy parent-embedded and confirmed requests remain readable and are never migrated or repriced by WP4.

## Runtime control model

Customer intake requires both gates:

1. the build-time `VITE_CUSTOMER_QR_ENABLED` gate; and
2. a valid, enabled private/public runtime-control pair.

If the runtime-control document is missing or malformed, new Customer intake fails closed. Existing Customer status pages and Staff ordering/processing remain available.

Each control action writes the private state, safe public state, and append-only audit evidence atomically. Evidence includes previous/new state, actor UID or safe server reference, server timestamp, required reason, change ID, and control schema version.

## Authority

- Any authenticated, non-anonymous, active Staff user may disable intake.
- Re-enabling requires the same Staff authorization plus server-controlled `canManageCustomerOrdering: true`.
- Client code cannot create or edit authorization documents or grant this capability.
- WP4 may provision the capability only on a designated isolated-UAT Staff account. Production authorization is outside scope.

## Emergency disable

1. Open **Customer Requests** and locate **การควบคุม Customer QR**.
2. Enter a concise reason. Add a safe Customer-facing maintenance message.
3. Select **ปิดรับคำสั่งซื้อฉุกเฉิน**.
4. Confirm the panel shows disabled and the Customer page blocks new intake.
5. Continue processing existing pending requests and record the operational incident outside the app if local procedure requires it.

Disabling is intentionally fast and does not require the re-enable capability.

## Re-enable

1. Confirm the underlying issue is resolved and review all critical/warning indicators.
2. If disabled for more than 30 minutes, complete the explicit extended-disable review.
3. Enter the re-enable reason.
4. Check the explicit confirmation box.
5. A capability-authorized Staff user selects **เปิดรับคำสั่งซื้ออีกครั้ง**.
6. Verify the panel, public Customer page, and audit evidence show the new state.

Do not repair a malformed control from the browser. Keep intake fail closed and use the reviewed isolated-UAT/administrative recovery procedure. Production recovery requires separate approval.

## Balanced monitoring checklist

| Indicator                       |                            Warning |                           Critical |
| ------------------------------- | ---------------------------------: | ---------------------------------: |
| Pending backlog                 |                        10 requests |                        20 requests |
| Oldest pending                  |              older than 15 minutes |              older than 30 minutes |
| One anonymous owner             |            3 requests / 10 minutes |            5 requests / 10 minutes |
| Overall intake burst            |           20 requests / 10 minutes |           40 requests / 10 minutes |
| Trusted-confirmation mismatches | 3 / 15 minutes or 20% of latest 20 | 5 / 15 minutes or 40% of latest 20 |
| Staff rejection rate            |                   30% of latest 20 |                   50% of latest 20 |

Treat a missing/malformed runtime control, unavailable/inconsistent public projection, or projection apply/integrity failure as immediately critical.

When intake remains disabled for more than 30 minutes, the panel shows a reminder and requires Staff review before re-enable.

Indicators use bounded queries, dashboard calculations, logs, and manual review. Thresholds do not automatically block a Customer. Only a separately authorized disable action changes intake.

## Query and export behavior

- Queue and pending-request listeners are bounded to 50 rows and show a gap/incomplete indicator at the boundary.
- History uses 50-row cursor pages and states that text/payment searches cover loaded pages.
- Reports and backups page through bounded reads with a 5,000-order cap.
- Excel and JSON export are disabled when the loaded dataset is incomplete; the app never presents a partial export as complete.
- Exact detail routes fall back to an exact document read when a row is outside the current page.

## Residual risks

- A browser cooldown, stable retry ID, Web Lock, and persisted envelope improve UX/idempotency but are not secure rate limiting.
- Anonymous identities can be recreated; Rules cannot securely enforce cross-identity time-window limits.
- Dashboard indicators are not guaranteed real-time alerts and require Staff attention.
- Client-side projection updates can race between simultaneous Staff edits; projection integrity indicators and guarded projection repair remain required.
- Disabling Anonymous Authentication does not immediately revoke every existing session.
- Queue counters consumed by completed UAT/Production confirmations are never decremented during cleanup.

## App Check deferral

App Check is deferred to WP5. WP4 does not register providers, create debug tokens, add secrets, change Console enforcement, or claim App Check protection. WP5 preparation must separately review provider choice, rollout/monitoring, enforcement sequencing, recovery, CI/UAT tokens, and Production approvals.

## Production boundary

Production Customer QR remains disabled and rollout remains **No-Go**. This document does not approve Production Firestore access, Rules/index deployment, Authentication, IAM, projection, Hosting, secrets, Staff capability provisioning, smoke data, or release activity.
