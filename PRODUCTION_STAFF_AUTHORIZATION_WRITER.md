# Production Staff Authorization Writer

This runbook documents a one-shot, Production-specific authorization writer. It
does not authorize a Production action by itself.

## Writer path

```text
C:\Users\surapat.c\Desktop\GreekYogurtOrderApp\scripts\productionStaffAuthorizationWriter.mjs
```

The writer accepts the Staff inventory only from an absolute file path outside
this repository. Never copy an inventory, UID, email, credential, token, or
service-account file into Git, logs, artifacts, or chat.

## Required inventory shape

The external JSON file must contain exactly:

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

Placeholders above are documentation only and are rejected by the writer.

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
approved Rules-only deployment. The credential path is an operator-held local
reference and must never be printed.

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = <secure-local-credential-path>
C:\Users\surapat.c\Tools\NodePortable\node-v24.17.0-win-x64\node.exe `
  C:\Users\surapat.c\Desktop\GreekYogurtOrderApp\scripts\productionStaffAuthorizationWriter.mjs `
  --project greek-yogert `
  --inventory <secure-external-inventory-path> `
  --execute `
  --confirm CREATE_EXACTLY_TWO_STAFF_AUTHORIZATIONS
```

## Contract and stop conditions

- The only accepted project is `greek-yogert`; missing, malformed, UAT, and all
  other projects fail closed.
- The inventory must be external, exact-shaped, contain exactly two enabled
  records, have unique non-placeholder UIDs and emails, and contain one ordinary
  and one capable role.
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

## Rollback limitation

If the atomic create fails, no partial result is accepted. If the batch succeeds
but a later verification cannot complete, stop: do not overwrite, repair, or
delete automatically. A rollback affecting either authorization document needs
separate approval and must recheck the exact document state first.
