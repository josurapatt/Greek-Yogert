# Production Staff Authorization Writer

This runbook defines a Production-specific, create-only authorization gate. It
does not authorize Production access by itself. Online planning and applying
require their own exact-head approval and a controlled Production window.

The gate supports three modes:

1. offline inventory validation;
2. online read-only planning with a deterministic approval fingerprint;
3. approved create-only application followed by read-only verification.

It never updates, merges, overwrites, deletes, or repairs an existing
authorization document.

## Writer and protected inputs

The writer is `scripts/productionStaffAuthorizationWriter.mjs`. The Staff
inventory, service-account credential, and expected service-account principal
must be JSON files at absolute paths outside the repository. Each path must
exist and resolve through its real path outside the repository; a symlink or
junction into the repository is rejected.

Never copy an inventory, UID, email, credential, token, or service-account file
into Git, logs, artifacts, or chat. Do not print the protected file paths.

The external inventory must contain exactly:

```json
{
  "projectId": "greek-yogert",
  "staff": [
    {
      "email": "<ordinary-staff-email>",
      "uid": "<ordinary-staff-uid>",
      "role": "ordinary",
      "authDisabled": false
    },
    {
      "email": "<capable-staff-email>",
      "uid": "<capable-staff-uid>",
      "role": "capable",
      "authDisabled": false
    }
  ]
}
```

The separately protected expected-principal file must contain exactly:

```json
{
  "projectId": "greek-yogert",
  "serviceAccountEmail": "<approved-service-account-principal>"
}
```

The credential `client_email` must match that expected principal exactly before
Firebase is initialized. Neither value is printed. Placeholders, obvious
non-Production identifiers, and reserved email domains are rejected.

## Fingerprint contract

The inventory fingerprint is a SHA-256 fingerprint of the normalized, ordered
inventory, exact project, and exact desired authorization schemas. Input record
order and email casing do not change it. Any approved UID, email, role, project,
or authorization schema change does.

The approval fingerprint additionally binds the normalized expected
service-account principal after that principal has exactly matched the loaded
credential, the freshly observed state of each target (`missing` or `exact`),
and the exact fields planned for each missing target. It therefore changes if
the matched principal or a target changes between planning and applying. The
principal itself is never included in output; only the resulting fingerprint is
returned. Only the complete fingerprint from the immediately reviewed online
plan is accepted by apply mode.

Fingerprints are opaque approval handles. They are not substitutes for reviewing
the protected inventory through the approved secure channel.

## Offline validation

The default mode validates the project and external inventory and calculates
the inventory fingerprint. It does not initialize Firebase or contact
Production.

```powershell
& $nodeExecutable `
  $writerPath `
  --project greek-yogert `
  --inventory $secureInventoryPath
```

Require one JSON output line, a zero exit code, `status` equal to
`validation-only`, both validations equal to `passed`, `approvedStaff` equal to
`2`, `authorizationDocumentsCreated` equal to `0`, and
`identifiersLogged` equal to `false`.

## Controlled environment guard

Before either online mode, confirm that no emulator-routing variable is present:

```powershell
$emulatorVariables = @(
  "FIRESTORE_EMULATOR_HOST",
  "FIREBASE_AUTH_EMULATOR_HOST",
  "FIREBASE_DATABASE_EMULATOR_HOST",
  "FIREBASE_STORAGE_EMULATOR_HOST",
  "FUNCTIONS_EMULATOR"
)
foreach ($name in $emulatorVariables) {
  if (Test-Path "Env:$name") { throw "Emulator routing variable is present." }
}
```

The writer independently repeats this check before reading credentials. It also
rejects a conflicting `GCLOUD_PROJECT` or `GOOGLE_CLOUD_PROJECT`, and rejects
malformed or conflicting `FIREBASE_CONFIG`.

Set `GOOGLE_APPLICATION_CREDENTIALS` only for the approved controlled process,
restore its previous process value in `finally`, and never print it.

## Online read-only plan

Online plan mode performs only these remote reads:

- `getUser(uid)` for the two approved Authentication users;
- `get()` for the two exact `users/{uid}` documents.

It does not enumerate Authentication, query Firestore, initialize a write batch,
or perform a mutation.

```powershell
$planOutput = @(
  & $nodeExecutable `
    $writerPath `
    --plan `
    --project greek-yogert `
    --inventory $secureInventoryPath `
    --expected-principal $securePrincipalPath
)
$planExitCode = $LASTEXITCODE
if ($planExitCode -ne 0 -or $planOutput.Count -ne 1) {
  throw "Authorization planning failed."
}
$plan = $planOutput[0] | ConvertFrom-Json
```

Require all validation and verification fields to be `passed`, both Staff counts
to be `1`, `conflictingDocuments` to be `0`, and `plannedCreates` to be `0`,
`1`, or `2`. The sum of `existingExactDocuments` and `missingDocuments` must be
`2`, and `plannedCreateFields` must match only the exact missing-role schemas.
Require `identifiersLogged` to be `false`.

Review the inventory fingerprint, state counts, planned field names, and complete
approval fingerprint. Do not proceed with a partial, conflicting, malformed, or
unexpected result. Verify the protected expected-principal file and matching
credential through the approved secure channel; the principal value is
intentionally absent from writer output.

Any existing document is accepted only if it exactly equals its approved schema:

- ordinary: `{ role: "staff", active: true }`;
- capable: the ordinary schema plus
  `canManageCustomerOrdering: true`.

A missing field, wrong value, or extra field is conflicting and stops planning
without writes.

## Fingerprinted create-only apply

After the plan has been reviewed and its complete approval fingerprint has been
approved, provide that exact value to apply mode:

```powershell
$applyOutput = @(
  & $nodeExecutable `
    $writerPath `
    --apply `
    --project greek-yogert `
    --inventory $secureInventoryPath `
    --expected-principal $securePrincipalPath `
    --approved-fingerprint $approvedPlanFingerprint `
    --confirm APPLY_APPROVED_PRODUCTION_STAFF_AUTHORIZATIONS
)
$applyExitCode = $LASTEXITCODE
if ($applyExitCode -ne 0 -or $applyOutput.Count -ne 1) {
  throw "Authorization apply failed."
}
$apply = $applyOutput[0] | ConvertFrom-Json
```

Apply mode first revalidates the protected expected principal against the loaded
credential, then repeats Authentication verification and both document reads.
It recalculates the full plan and stops before a batch is created unless the
matched principal and fresh state produce the exact approved fingerprint. For
each still-missing approved target, it adds one Firestore batch `create`. The
atomic batch therefore contains zero, one, or two creates. `create`
preconditions prevent a race from overwriting a document.

After a successful non-empty batch, or immediately on the zero-create path, the
writer reads both documents again. Both must exactly equal their approved
schemas, and the resulting plan must contain zero creates.

Require:

- `status` equal to `applied` or `already-current`;
- `authorizationDocumentsCreated` equal to the approved `plannedCreates`;
- `postWriteVerification` and `idempotencyVerification` equal to `passed`;
- `postApplyPlannedCreates` equal to `0`;
- `identifiersLogged` equal to `false`.

## Read-only post-apply and zero-write verification

Run online plan mode again. Require two exact documents, zero missing or
conflicting documents, and zero planned creates. This is the required read-only
post-apply verification.

To prove the apply path is idempotent, separately approve that fresh zero-create
fingerprint and invoke apply mode once more with the same typed confirmation.
Require `status` equal to `already-current`, both planned and created counts equal
to `0`, and both post-write and idempotency verification equal to `passed`. The
writer does not construct or commit a batch on this path.

Stop here. Rules deployment, workflow dispatch, public projection, and every
other Production action are separate operations requiring separate authority.

## Fail-closed contract

- Only project `greek-yogert` is accepted. UAT, missing, malformed, and all other
  projects fail closed.
- The inventory must contain exactly two enabled, unique, non-placeholder
  mappings: one ordinary and one capable.
- The credential and expected principal must both be external and exact-project
  checked, and their principal emails must match exactly.
- Only the two approved Authentication users and two exact `users/{uid}` paths
  are read. Authentication is never mutated and unrelated Firestore data is
  never accessed.
- Existing exact documents are preserved. Existing non-exact documents stop the
  process. No existing document is updated, merged, overwritten, deleted,
  repaired, or broadened.
- A changed expected principal, stale or malformed fingerprint, state race,
  create-precondition failure, failed commit, or failed post-apply read stops
  the process.
- Output contains only sanitized states, counts, field names, fingerprints, and
  stages. It contains no UID, email, principal, document path, credential, or
  underlying Firebase error text.
- The writer never deploys Rules, indexes, Hosting, App Check, or any other
  resource.

## Indeterminate result and rollback limitation

An atomic create failure is never treated as partial success. If a commit may
have succeeded but post-apply verification fails, the result is indeterminate.
Stop and do not retry, overwrite, repair, update, merge, or delete either
document. A new read-only exact-state review and separate authorization are
required. Any rollback affecting an authorization document also requires
separate approval and a fresh exact-state check.
