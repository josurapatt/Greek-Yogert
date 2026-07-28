# AI Team Protocol

This file is the concise coordination protocol for the configurable catalogue
workstream. Permanent repository and environment rules remain in `AGENTS.md`.
The approved architecture, scope, work-package state, and handoff are in
`docs/CONFIGURABLE_CATALOGUE_WORKSTREAM.md`.

## Roles and routing

| Chat    | Role                               | Receives from             | Sends to                                                       |
| ------- | ---------------------------------- | ------------------------- | -------------------------------------------------------------- |
| Chat 01 | Planner and architecture authority | Chat 02 escalations       | Chat 02 approved plan or architecture decisions                |
| Chat 02 | Orchestrator and task-state owner  | Chat 01, Chat 03, Chat 04 | One exact task at a time to Chat 03 or Chat 04                 |
| Chat 03 | Production developer               | Chat 02 only              | Bounded implementation evidence to Chat 02                     |
| Chat 04 | Independent QA                     | Chat 02 only              | Formal `PASS`, `PASS_WITH_NOTES`, or `FAIL` verdict to Chat 02 |

Chat 02 routes a delivered Chat 03 commit to Chat 04. A `FAIL` returns only
actionable findings to Chat 03. Architecture, scope, data-migration, billing,
permission, historical-order, pricing-behaviour, or Production questions return
to Chat 01. Only business behaviour, prices, permissions, deletion, Production
execution, billing, or removal of mandatory scope is escalated to the user.

## Message and work-package rules

- Read `AGENTS.md`, `CURRENT_STATUS.md`, and
  `docs/CONFIGURABLE_CATALOGUE_WORKSTREAM.md` before acting.
- Verify the repository, worktree, branch, exact starting SHA, cleanliness, and
  remote state at every handoff.
- Chat 02 assigns one approved Work Package at a time.
- Repository governance requires a fresh implementation branch and Draft PR per
  Work Package. Do not start the next package until the current package is
  approved and merged.
- No role may merge, deploy, migrate Production data, modify Production
  configuration, or modify PR #14 without explicit user approval.
- Chat 03 does not self-approve. Chat 04 does not implement application code
  unless Chat 02 explicitly assigns a correction.
- Durable state is updated before rotation; prose messages are not the sole
  source of truth.

## Required handoff format

```text
Work Package:
Owner / active chat:
Starting SHA:
Ending SHA:
Branch:
Worktree:
Files changed:
Behaviour delivered:
Tests and exact results:
QA verdict:
Known limitations:
Unexpected changes:
Open blockers or decisions:
Production access / deployment:
Next permitted action:
```

## Rotation

At outbound response 18, the active role prepares and verifies its durable
handoff. At response 20 it stops taking new work and hands off to the next
numbered chat (`Chat 02-2`, `Chat 03-2`, or `Chat 04-2`). The replacement chat
must independently reconcile Git and the durable files before continuing.

| Role         | Active chat | Outbound count | Rotation state                                        |
| ------------ | ----------- | -------------: | ----------------------------------------------------- |
| Planner      | Chat 01     |              0 | Active                                                |
| Orchestrator | Chat 02     |              4 | QA result durably recorded; awaiting separate PR gate |
| Production   | Chat 03     |              2 | Formatting correction delivered                       |
| QA           | Chat 04     |              2 | Re-QA PASS delivered; awaiting separate PR gate       |

## Prohibited role behaviour

- Scope expansion, unrelated refactoring, visual redesign, or dependency
  upgrades unrelated to the approved package.
- Reusing the light-purple UI branch or mixing PR #14 changes into this
  workstream.
- Searching reflogs, stashes, or old project copies for topping CRUD code.
- Weakening Firestore or Storage authorization to make tests pass.
- Repricing, rewriting, or deleting confirmed historical order snapshots.
- Enabling billing, Blaze, Cloud Functions, App Check enforcement, or any
  Production action without explicit approval.
