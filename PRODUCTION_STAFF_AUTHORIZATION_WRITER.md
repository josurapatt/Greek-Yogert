# Production Staff Authorization Writer

This runbook documents a one-shot, Production-specific authorization writer. It
does not authorize a Production action by itself.

## Writer path

```text
C:\Users\surapat.c\Desktop\GreekYogurtOrderApp\scripts\productionStaffAuthorizationWriter.mjs
```

The writer accepts the Staff inventory, service-account credential, and expected
service-account principal only from absolute paths outside this repository. Each
path must exist and resolve through its real path outside the repository; a
symlink or junction into this repository is rejected. Never copy an inventory,
UID, email, credential, token, or service-account file into Git, logs,
artifacts, or chat.

## Required external inputs

The external inventory JSON must contain exactly:

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

The separately protected expected-principal JSON must contain exactly:

```json
{
  "projectId": "greek-yogert",
  "serviceAccountEmail": "<approved-service-account-principal>"
}
```

The writer requires the credential `client_email` to match that external
principal exactly before it initializes Firebase. Neither value is printed.
Placeholders and obvious non-production identifiers or reserved email domains
are rejected.

## Safe validation command

This is the default mode. It validates only the project and external inventory;
it does not initialize Firebase or contact Production.

```powershell
C:\Users\surapat.c\Tools\NodePortable\node-v24.17.0-win-x64\node.exe `
  C:\Users\surapat.c\Desktop\GreekYogurtOrderApp\scripts\productionStaffAuthorizationWriter.mjs `
  --project greek-yogert `
  --inventory <secure-external-inventory-path>
```

## Controlled-window command

Run only after separate exact-head approval and immediately before the separately
approved Rules-only deployment. Do not echo any external path or content. The
writer rejects any emulator-routing environment variable, a conflicting project
environment variable, or conflicting `FIREBASE_CONFIG` before it reads a
credential or initializes Firebase.

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

$previousCredential = [Environment]::GetEnvironmentVariable(
  "GOOGLE_APPLICATION_CREDENTIALS", "Process"
)
try {
  $env:GOOGLE_APPLICATION_CREDENTIALS = <secure-external-credential-path>
  & C:\Users\surapat.c\Tools\NodePortable\node-v24.17.0-win-x64\node.exe `
    C:\Users\surapat.c\Desktop\GreekYogurtOrderApp\scripts\productionStaffAuthorizationWriter.mjs `
    --project greek-yogert `
    --inventory <secure-external-inventory-path> `
    --expected-principal <secure-external-principal-path> `
    --execute `
    --confirm CREATE_EXACTLY_TWO_STAFF_AUTHORIZATIONS
  if ($LASTEXITCODE -ne 0) { throw "Authorization writer failed." }

  # Stop here unless the only result is the exact sanitized success object:
  # {"status":"created","projectValidation":"passed","inventoryValidation":"passed","existingDocumentCheck":"passed","authorizationDocumentsCreated":2,"identifiersLogged":false}
  # A successful exit with any other output is a stop condition for review.
}
finally {
  if ($null -eq $previousCredential) {
    Remove-Item Env:GOOGLE_APPLICATION_CREDENTIALS -ErrorAction SilentlyContinue
  }
  else {
    $env:GOOGLE_APPLICATION_CREDENTIALS = $previousCredential
  }
}
```

Do not dispatch a Rules workflow unless the writer exits successfully and its
single sanitized result exactly matches the object in the comment. The workflow
is a separate authorized operation, not a continuation of this command.

## Contract and stop conditions

- The only accepted project is `greek-yogert`; missing, malformed, UAT, and all
  other projects fail closed.
- Execute mode fails before credential reads or Firebase initialization if an
  emulator variable is present, `GCLOUD_PROJECT` or `GOOGLE_CLOUD_PROJECT`
  conflicts, or `FIREBASE_CONFIG` is malformed or conflicts.
- The inventory must be external, exact-shaped, contain exactly two enabled
  records, have unique non-placeholder UIDs and emails, and contain one ordinary
  and one capable role.
- The credential and exact expected principal must both be external and
  real-path checked. The credential must be a `greek-yogert` service account
  and its principal must exactly match the separately protected expected value.
- The writer reads only the two matching Firebase Authentication users and the
  two target `users/{uid}` documents. It does not mutate Authentication or
  enumerate unrelated Firestore data.
- Both target documents must be absent before the atomic Firestore batch is
  created. The batch uses create preconditions, never merge or overwrite.
- The exact created documents are `{ role: "staff", active: true }` for the
  ordinary mapping and that schema plus
  `canManageCustomerOrdering: true` for the capable mapping.
- Any mismatch, existing document, failed commit, or failed post-write check
  stops the command. Output is limited to sanitized stage/result fields.
- The command never deploys Rules, indexes, Hosting, or any other resource.

## Indeterminate verification and rollback limitation

If the atomic create fails, no partial result is accepted. If the batch succeeds
but a later verification cannot complete, finds a missing document, finds a
schema mismatch, or finds an unexpected field, stop: do not overwrite, repair,
retry, or delete automatically. This is an indeterminate verification state
requiring separate exact-state review. A rollback affecting either authorization
document needs separate approval and must recheck the exact document state first.
