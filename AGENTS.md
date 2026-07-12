# AGENTS.md — GreekYogurtOrderApp

## 1. Purpose

This file is the standing instruction set for AI agents working in this repository.

Goals:

- Preserve the current working architecture.
- Produce the same safe, complete result with shorter task prompts.
- Avoid repeating stable project rules in every prompt.
- Keep Production, UAT, staff, and customer flows strictly separated.
- Prefer focused implementation over redesign.

Agents must read this file, the root-level `CURRENT_STATUS.md`, and the root-level `ROADMAP.md` before inspecting or modifying the repository.

### Instruction hierarchy and required reading order

Use this authority order:

1. Explicit user instruction in the current task.
2. `AGENTS.md`.
3. `CURRENT_STATUS.md`.
4. `ROADMAP.md`.
5. Existing code and project documentation.

If these sources or the actual repository and connected GitHub state conflict materially, stop and report the conflict instead of guessing. Do not perform implementation work until the conflict is resolved.

Before any analysis or implementation:

1. Read `AGENTS.md` completely.
2. Read the root-level `CURRENT_STATUS.md` completely.
3. Read the root-level `ROADMAP.md` completely.
4. Inspect only the files needed for the current task.
5. Verify the repository, branch, HEAD, working tree, remote synchronization, and applicable PR state.

The current task prompt defines the work to perform now. `CURRENT_STATUS.md` records the latest verified operational snapshot. `ROADMAP.md` records project direction and high-level progress. Neither status nor roadmap content authorizes implementation by itself.

The actual repository and connected GitHub state are authoritative for factual Git and PR state. They do not imply Manual UAT, business acceptance, PR approval, Production approval, or feature priority; those decisions remain user-controlled.

---

## 2. Repository and Tools

Repository:

```text
C:\Users\surapat.c\Desktop\GreekYogurtOrderApp
```

GitHub:

```text
https://github.com/josurapatt/Greek-Yogert
```

Portable tools:

```text
Git:
C:\Users\surapat.c\Tools\PortableGit\cmd\git.exe

GitHub CLI:
C:\Users\surapat.c\Tools\gh\bin\gh.exe

Portable Node.js:
C:\Users\surapat.c\Tools\NodePortable\node-v24.17.0-win-x64
```

Do not assume administrator rights are available.

Use portable or user-local tooling when a dependency is missing.

Do not install system-wide software unless the user explicitly approves it.

---

## 3. Project Environments

### Production

Firebase project:

```text
greek-yogert
```

Production URL:

```text
https://greek-yogert.firebaseapp.com/
```

Production is protected.

Unless the user explicitly gives a release instruction:

- Do not deploy to Production.
- Do not modify Production Authentication.
- Do not modify Production Firestore rules or indexes.
- Do not read, write, migrate, seed, export, or copy Production user/order/history data.
- Do not modify `main`.
- Do not infer permission to release from a successful UAT.

### Customer QR UAT

Firebase project:

```text
greek-yogert-customer-uat-2026
```

Display name:

```text
Greek Yogurt Customer QR UAT
```

Known UAT configuration:

```text
Plan: Spark / free tier
Firestore database: (default)
Firestore mode: Native
Firestore region: asia-southeast1
Web App nickname: Greek Yogurt Customer QR UAT Web
Web App ID: 1:595147478182:web:f8cfb2a7103557ef791067
```

Dedicated UAT files:

```text
firestore.customer-uat.rules
firebase.customer-uat.json
```

UAT deployments must explicitly target:

```text
greek-yogert-customer-uat-2026
```

Deployment must fail if the target project is missing or equals:

```text
greek-yogert
```

Never use implicit/default Firebase targeting for Customer QR UAT.

---

## 4. Development Principles

Use this order of preference:

```text
Extend existing code
→ Integrate with existing services
→ Refactor only when required
→ Replace only when technically justified
```

Rules:

- Do only the current approved task.
- Do not begin adjacent roadmap items.
- Preserve working architecture and behavior.
- Reuse existing pricing, availability, order snapshot, queue, and validation logic.
- Do not recreate working modules.
- Make the smallest focused change that satisfies the task.
- Avoid unrelated refactoring.
- Do not introduce speculative architecture for future phases unless the current task requires it.
- Avoid mass formatting of legacy files.
- Do not add speculative features.
- Do not redesign unless the requested task cannot be completed safely without it.
- Use Plan Mode only for genuinely ambiguous or architectural work.
- For normal micro-tasks, inspect, implement, validate, and report directly.
- Do not rewrite broad roadmap history during normal feature implementation.

### Roadmap governance

`ROADMAP.md` is the source of truth for changing project status, phase progress, current active work, planned direction, release gates, and deferred ideas.

- Do not automatically implement items labeled **Next**, **Planned**, **Deferred**, or **Future Ideas**.
- Do not mark a phase complete without implementation evidence and explicit user approval when approval is required.
- Edit `ROADMAP.md` only when the current task explicitly requests a roadmap update, or when the current task explicitly authorizes synchronized documentation updates for implementation that materially changes roadmap status.
- For normal micro tasks, report the suggested roadmap impact in the completion report without editing `ROADMAP.md`.
- The user remains the authority for prioritization, phase approval, and release approval.

### Current-status governance

`CURRENT_STATUS.md` is the current operational snapshot, not a changelog. Git history remains the source for historical changes.

- Verify repository and GitHub facts before relying on the snapshot. If it is stale, update it only with verified facts.
- Update `CURRENT_STATUS.md` after work that materially changes branch HEAD, PR state, validation state, deployment state, UAT state, blockers, or the immediate next action.
- Normal micro tasks update `CURRENT_STATUS.md` only when the operational snapshot materially changes.
- Do not mark Manual UAT passed without explicit verified evidence.
- Do not mark PR approval, merge approval, Production approval, or release approval without explicit user authorization.
- `ROADMAP.md` changes only when a phase, capability, priority, release gate, or high-level direction changes.
- Completion reports must state whether `CURRENT_STATUS.md` and `ROADMAP.md` were updated or intentionally left unchanged.
- Status documents must not contain secrets, credentials, private UIDs, passwords, or service-account JSON.
- A status-only commit necessarily follows the HEAD it records. Record the verified implementation baseline and require agents to verify the actual current HEAD rather than trying to embed a commit hash that contains itself.

---

## 5. Git and Pull Request Rules

- Work on a focused feature branch.
- Never commit directly to `main` unless the user explicitly requests and approves a release operation.
- Never force push.
- Keep commits focused.
- Do not merge a Draft PR.
- Do not merge before explicit UAT approval.
- Verify the approved PR head SHA before release.
- Stop if the actual PR head differs from the approved SHA.
- Do not commit:
  - `.env.local`
  - secrets
  - Firebase service-account credentials
  - `node_modules`
  - `dist`
  - portable tool binaries
  - generated local caches
- Keep Customer QR Ordering changes separate from unrelated staff-side work.

Current active Customer QR work:

```text
Branch: feature/customer-qr-ordering-foundation
Draft PR: #4
```

Treat commit hashes as task-specific and verify them from Git instead of trusting stale documentation.

---

## 6. Authentication and Staff Authorization

### Production

Do not change Production Authentication unless explicitly instructed during an approved release.

### Customer QR UAT

Enabled providers:

```text
Email/Password
Anonymous
```

Use:

- Anonymous Authentication for customer `/order` and customer status access.
- Email/Password for UAT staff login.

A non-anonymous user is not automatically staff.

Explicit UAT staff authorization schema:

```text
users/<Firebase Auth UID>
  role: "staff"   // string
  active: true    // boolean
```

Authorized staff must satisfy all conditions:

1. Authenticated.
2. Sign-in provider is not anonymous.
3. `users/{request.auth.uid}` exists.
4. `role == "staff"`.
5. `active == true`.

Never authorize staff:

- only by email
- only by provider type
- only because the user is authenticated
- through client-created role documents

Client applications must not create, update, or delete authorization documents.

The UAT seed action must not create or modify staff authorization.

---

## 7. Customer QR Ordering Invariants

Customer routes:

```text
/order
/order/status/:requestId
```

Customer behavior must remain:

- Direct entry without staff login.
- Thai-language mobile-first UI.
- Clearly marked `โหมดทดลอง` in UAT.
- Storefront pricing and Storefront rules only.
- No channel selector.
- No payment-method selector.
- Duplicate toppings follow Storefront rules.
- Sold-out options remain visible, show `หมด`, and are disabled.
- Missing availability keys default to available.
- Stale unavailable selections are revalidated before submission.
- Invalid selections are not silently deleted or replaced.
- Only optional nickname and optional note are collected.
- Do not collect phone, email, delivery address, payment evidence, or marketing consent.

Customer request collection:

```text
customerOrderRequests
```

Initial customer-visible status:

```text
รอร้านยืนยัน
```

Before staff confirmation:

- No queue number.
- No payment method.
- No active queue order.
- No confirmed order ID.
- Customer cannot set staff-controlled fields.

Customer request snapshots must remain readable if menu or pricing changes later.

Customer status access must be limited to the owning anonymous UID.

Customers must not:

- list all customer requests
- read another customer’s request
- access users, reports, counters, active orders, history, or private settings
- assign payment, queue number, confirmed order ID, or staff status
- execute queue-counter logic

---

## 8. Staff Confirmation Invariants

Authorized UAT staff may review, confirm, or reject pending customer requests.

Allowed payment methods:

```text
สด
โอน
โครงการ
```

Disallowed for Customer QR requests:

```text
Platform
LINE MAN
Grab
```

Confirmation must be atomic and must:

1. Re-read the latest request.
2. Verify it is still pending.
3. Require a valid staff-selected payment method.
4. Assign the next normal daily queue number.
5. Create one normal active queue order.
6. Preserve and link the customer request.
7. Update the customer-visible request.
8. Prevent duplicate order creation and duplicate queue assignment.

Repeated clicks, stale clients, retries, and reloads must be safe.

Rejection must:

- occur only while pending
- create no active order
- assign no queue number
- update the customer-visible status
- optionally store a short reason

Do not move queue assignment to the customer client.

Do not add Cloud Functions unless the user explicitly changes project scope.

---

## 9. Firestore Security Rules

Customer QR UAT rules must use:

```text
firestore.customer-uat.rules
```

Minimum rule guarantees:

- Unauthenticated users cannot submit requests.
- Anonymous users can access only the minimum public menu and availability data.
- Customers can create requests only for their own UID.
- Owner UID cannot be forged.
- Customers can read only their own request.
- Customer collection listing is denied.
- Customers cannot modify immutable snapshots or staff-controlled fields.
- Customers cannot access counters or create active orders.
- Anonymous users cannot access staff collections.
- Unauthorized Email/Password users have no staff privileges.
- Only explicit `users/{uid}` staff authorization grants staff access.
- Authorization documents cannot be self-created or self-modified by clients.
- Production rules are never used as a substitute for UAT rules.

Do not weaken rules merely to make a test pass.

---

## 10. UAT Data and Seed Rules

The UAT project may contain only minimum non-sensitive test configuration:

- products
- Storefront prices
- toppings
- granola flavors
- availability settings
- public menu projection
- minimum explicit staff authorization

The UAT seed action:

```text
Seed เมนู UAT
```

must be:

- available only to explicitly authorized UAT staff
- idempotent where practical
- unable to grant staff access
- unable to create/update `users/{uid}`

Never copy from Production:

- users
- customers
- customer requests
- queue orders
- order history
- reports
- credentials
- sensitive settings

Using the same public product names and approved pricing is acceptable.

---

## 11. Secrets and CI/CD

GitHub environment:

```text
customer-qr-uat
```

Expected UAT environment secrets:

```text
CUSTOMER_UAT_FIREBASE_API_KEY
CUSTOMER_UAT_FIREBASE_AUTH_DOMAIN
CUSTOMER_UAT_FIREBASE_PROJECT_ID
CUSTOMER_UAT_FIREBASE_STORAGE_BUCKET
CUSTOMER_UAT_FIREBASE_MESSAGING_SENDER_ID
CUSTOMER_UAT_FIREBASE_APP_ID
CUSTOMER_UAT_FIREBASE_SERVICE_ACCOUNT_JSON
```

Rules:

- Never print secret values.
- Never commit secret values.
- Never place service-account JSON in repository files.
- Never include credentials in PR comments or completion reports.
- Use the exact secret names already defined by the workflow.
- Do not rename secrets without proving the workflow is defective.
- Validate that workflows explicitly target UAT.
- Production release workflow must remain Hosting-only unless an approved task says otherwise.
- Customer QR UAT workflow may deploy only the explicitly configured UAT resources.

---

## 12. Validation Policy

Run only the validation required by the change, except where security or release work requires broader checks.

### Normal focused application change

Run:

- affected tests
- lint
- TypeScript production build

### Firestore rules, authorization, or customer-data boundary change

Run:

- affected application tests
- full relevant application test suite
- Firestore Emulator security tests
- lint
- TypeScript production build
- Prettier check for changed/new files
- workflow YAML validation when workflows changed
- secret scan
- focused diff review

### UAT deployment task

Before deployment verify:

- branch and head SHA
- repository clean state
- UAT project ID
- UAT Web App configuration
- required GitHub environment secrets
- UAT-only Firebase target
- Production exclusion safeguards

Deploy only the resources named in the task.

### Production release task

Before merge/release verify:

- explicit user UAT approval
- approved PR head SHA
- required checks passed
- PR is safely mergeable
- exact deployment scope
- Production target identity

Stop if any release identity or SHA is unclear.

Do not invent credentials or create Production test data for smoke testing.

---

## 13. Portable Dependency Policy

Administrator rights are not assumed.

When a required tool is missing:

1. Check existing portable tools under:
   ```text
   C:\Users\surapat.c\Tools
   ```
2. Prefer ZIP/portable distributions.
3. Keep tools outside the repository.
4. Configure environment variables for the current session where possible.
5. Do not commit tool paths into application logic.
6. Do not permanently alter system-wide configuration unless approved.

For Firestore Emulator tests, use JDK 21 or newer.

A portable JDK may be placed under:

```text
C:\Users\surapat.c\Tools\JavaPortable
```

Do not commit Java binaries or archives.

---

## 14. Stop Conditions

Stop and report before acting when:

- the repository, branch, or approved SHA differs unexpectedly
- the target Firebase project is unclear
- a UAT command may target Production
- required secrets or credentials are unavailable
- a safe operation requires user interaction in Firebase/GitHub Console
- billing, Blaze, Cloud Functions, or a destructive migration would be required
- security rules cannot enforce customer isolation
- queue assignment cannot remain atomic and staff-only
- Production data/configuration would need modification
- an actual architecture defect is discovered outside the approved task scope

When blocked:

- complete all safe work first
- report the exact blocker
- provide only the required manual action
- do not repeat the full architecture discussion
- do not invent credentials, emails, passwords, UIDs, or secret values

---

## 15. Task Execution Protocol

For every task:

1. Read this file.
2. Read the root-level `CURRENT_STATUS.md`.
3. Read the root-level `ROADMAP.md`.
4. Inspect only files relevant to the task.
5. Verify repository state, branch, current head, working tree, remote synchronization, and applicable PR state.
6. Confirm that the task prompt, `AGENTS.md`, `CURRENT_STATUS.md`, `ROADMAP.md`, and actual state do not conflict materially.
7. Preserve existing architecture and invariants.
8. Make the smallest safe change authorized by the current task.
9. Run validation appropriate to the change.
10. Review the diff for scope creep and secret exposure.
11. Update current status or roadmap only under their governance rules.
12. Commit only when repository files changed.
13. Push only to the requested feature branch.
14. Do not merge or deploy unless explicitly requested.
15. Return a brief completion report stating whether `CURRENT_STATUS.md` and `ROADMAP.md` changed or were intentionally unchanged.

Do not restate this entire file in task reports.

A new user prompt may be short, for example:

```text
Continue from AGENTS.md.

Task:
Run the pending Firestore Emulator security tests using a portable JDK 21+.
Fix only genuine test, rule, or harness defects.
Do not deploy.
```

The task prompt overrides this file only when the user explicitly states a conflicting instruction.

---

## 16. Completion Report Format

Use only applicable fields:

```text
Completed:
- ...

Files changed:
- ...

Validation:
- tests:
- rules/emulator:
- lint:
- build:
- other:

Firebase impact:
- UAT:
- Production:

Git/PR:
- branch:
- commit:
- PR:
- merge/deploy:

Blockers or deviations:
- None
```

For a blocked task:

```text
Stopped before <operation>.

Verified:
- ...

Blocker:
- ...

Required manual action:
1. ...
2. ...

Changes made:
- None / exact safe changes only

Production impact:
- None
```

Keep reports factual and brief.

---

## 17. Token-Efficiency Rules

To reduce token use without reducing correctness:

- Do not repeat stable rules already contained in this file.
- Do not copy the full roadmap into task prompts.
- Do not repeat completed implementation details unless they affect the current task.
- Do not provide architecture explanations when the architecture is already approved.
- Refer to exact files, branch, SHA, and task objective only.
- Use focused validation instead of repeating a generic full checklist.
- Expand only when a defect, security boundary, deployment, or release risk requires it.
- Report deltas, evidence, and blockers—not a narrative of every command.
- Never reduce safety checks merely to save tokens.

The desired result is unchanged quality with less repeated context.
