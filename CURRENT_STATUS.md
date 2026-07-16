# GreekYogurtOrderApp — Current Status

This is the current operational snapshot. Git history is authoritative for earlier work-package history.

## Status metadata

- Last verified: 2026-07-16 (Asia/Bangkok)
- Repository: `josurapatt/Greek-Yogert`
- Local repository: `C:\Users\surapat.c\Desktop\GreekYogurtOrderApp`
- Current branch: `feature/anonymous-abuse-controls`
- WP4 corrected implementation head validated in isolated UAT: `e0656753341641fa3110f3cfa5b32c4861d52069`
- Draft PR: [#8 — Harden anonymous ordering abuse controls](https://github.com/josurapatt/Greek-Yogert/pull/8)
- PR state: Draft; not approved, not Ready for review, and not merged
- Production status: **No-Go**; Production was not accessed or changed during WP4

## WP4 implementation state

Production Hardening Work Package 4 implementation and the latest Human-UAT defect correction are automated-revalidated on the feature branch. A reduced Human retest is pending; approval and merge remain pending.

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

## Validation evidence

Local validation for the exact implementation content:

- Application tests: 203 passed across 22 files
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

Latest corrected automated isolated UAT:

- [Workflow 29491949583](https://github.com/josurapatt/Greek-Yogert/actions/runs/29491949583) succeeded for corrected implementation head `e0656753341641fa3110f3cfa5b32c4861d52069`.
- Security/control rehearsal passed ordinary-Staff disable, ordinary-Staff re-enable denial, capable-Staff re-enable, capability self-grant denial, and missing/malformed-control fail-closed behavior while preserving Customer status and Staff processing.
- Browser rehearsal opened both pages before Anonymous Auth initialization, created one anonymous identity, synchronized both submit handlers at the actual write boundary, waited beyond cooldown, invoked the blocked second submit handler, and kept exactly one request parent, one item document, and one summary document. Both tabs converged on request `26d42c21-864d-4349-9ba7-93fa60a5a04b`, refreshed successfully, and cleared the profile-wide pointer only after terminal confirmation.
- The two preserved failed Human-UAT requests `e93cf4ae-ae6f-4918-8819-c1a26239b0ca` and `8a2e8805-218b-42a5-96d4-8bf443b5dae0` remain pending and have different safe owner references, confirming the concurrent Anonymous-UID initialization race. Each has matching retry ID, item `00`, summary `0`, and consistent ownership metadata. The older preserved-link test is N/A without its original anonymous browser identity; that does not reduce the confirmed same-profile blocker.
- Projection integrity remained fingerprint `wp4-5c4fce122e7d5d4f`. Temporary UAT requests, normalized children, identities, authorization records, and mismatch controls were removed. UAT intake was restored to enabled.
- Read-only UAT diagnostics verified Email/Password enabled; both designated Authentication users exist and are enabled; the capable authorization remains `role: "staff"`, `active: true`, `canManageCustomerOrdering: true`; and the ordinary authorization remains active Staff without the capability. The ordinary account's reported `auth/invalid-credential` is reduced to a UID-preserving human password-reset action. No password or UID was logged or stored in Git.

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

## Environment status

### Isolated Customer QR UAT

- Firebase project: `greek-yogert-customer-uat-2026`
- Customer ordering: enabled
- Projection fingerprint: `wp4-5c4fce122e7d5d4f`
- Automated WP4 implementation/security/browser rehearsal: passed
- Corrected automated UAT: passed
- Corrected Human retest: reduced retest pending after the two-tab/status blocker correction and ordinary-account password reset

### Production

- Firebase project: `greek-yogert`
- Customer QR remains disabled by the Production build boundary
- No WP4 Production authorization was provisioned or changed
- No Production Authentication, IAM, Firestore rules, indexes, documents, Hosting, or workflow execution occurred
- Production remains **No-Go**

## Remaining gates

- [ ] PR #8 receives explicit approval
- [ ] PR #8 changes from Draft only after approval
- [ ] PR #8 is merged only after approval
- [ ] WP5 full isolated Production release rehearsal completes
- [ ] Every independent Production approval in `PRODUCTION_ROLLOUT_PLAN.md` completes

## Immediate next action

Complete the one UID-preserving ordinary-UAT password reset, then run only the reduced Human retest for two-tab convergence, status refresh, ordinary disable/re-enable denial, and capable re-enable. Do not change Production, mark PR #8 Ready, merge, or start WP5.
