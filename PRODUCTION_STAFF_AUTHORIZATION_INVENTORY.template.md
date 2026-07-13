# Production Staff Authorization Inventory Template

This blank template is a future controlled-release aid. It contains no
Production identity data and does not authorize a Production read or write.

## Required approval before use

- [ ] User has separately approved Production Staff authorization provisioning.
- [ ] Production project identity is verified as `greek-yogert`.
- [ ] Each listed Firebase Auth UID was independently verified by the user.
- [ ] The approved Production rules candidate and rollback source are recorded.

## Inventory

| Staff label                 | Firebase Auth UID           | Intended role | Intended active | UID verified by | Verification date | Provisioned by | Provisioned at |
| --------------------------- | --------------------------- | ------------- | --------------- | --------------- | ----------------- | -------------- | -------------- |
| _Do not commit real values_ | _Do not commit real values_ | `staff`       | `true`          |                 |                   |                |                |

## Future provisioning procedure

1. The user captures every legitimate Staff Firebase Auth UID from the
   Production Console or an independently approved administrative source.
2. A second reviewer verifies each UID and the intended access state.
3. After explicit user approval, an approved administrative procedure creates
   exactly one `users/{uid}` document for each verified row:

   ```json
   { "role": "staff", "active": true }
   ```

4. Verify each Staff account can read only its own authorization document and
   can access the Staff application after the hardened rules are deployed.
5. Keep the completed inventory outside the repository; never commit UIDs,
   emails, credentials, or service-account material.

This WP2 template neither accesses nor modifies Production.
