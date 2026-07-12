# Customer QR Demo/UAT setup

This feature never targets the production Firebase project. Create a separate Spark-plan Firebase project, for example `greek-yogert-customer-uat`, then create a Web App, Firestore database, and enable Email/Password plus Anonymous Authentication **in that UAT project only**.

## UAT staff authorization bootstrap

Creating an Email/Password account alone does not grant staff access. The UAT rules require the Firebase Authentication UID document `users/{uid}` to contain exactly `role: "staff"` (string) and `active: true` (boolean).

1. Firebase Console → `greek-yogert-customer-uat-2026` → **Authentication** → **Users** → **Add user**.
2. Create the UAT staff Email/Password account and copy its Firebase Authentication UID. Do not copy its password into Firestore, source control, GitHub secrets, documentation, or PR comments.
3. Firebase Console → **Firestore Database** → **Data** → **Start collection** (or open `users`).
4. Set collection ID to `users` and document ID to `<UAT_STAFF_UID>`.
5. Add only these required fields:
   - `role` — string — `staff`
   - `active` — boolean — `true`

The application does not create or update authorization documents. Deleting this document or changing `active` to `false` removes staff access at the next authorization check. Anonymous customer accounts do not need, and cannot use, a `users/{uid}` document.

## Emulator security tests

Run `pnpm test:rules` to test `firestore.customer-uat.rules` locally. Firebase Emulator Suite requires JDK 21 or later; this test never contacts the UAT or Production Firebase projects.

Add these GitHub environment secrets to the `customer-qr-uat` environment:

- `CUSTOMER_UAT_FIREBASE_PROJECT_ID`
- `CUSTOMER_UAT_FIREBASE_API_KEY`
- `CUSTOMER_UAT_FIREBASE_AUTH_DOMAIN`
- `CUSTOMER_UAT_FIREBASE_STORAGE_BUCKET`
- `CUSTOMER_UAT_FIREBASE_MESSAGING_SENDER_ID`
- `CUSTOMER_UAT_FIREBASE_APP_ID`
- `CUSTOMER_UAT_FIREBASE_SERVICE_ACCOUNT_JSON`

The service account must belong to the UAT project only. The workflow rejects the known production ID and deploys `firebase.customer-uat.json`, which contains the UAT-only Firestore rules.

After deployment, sign in as the UAT staff user, open **คำขอลูกค้า**, and press **Seed เมนู UAT** once. This only creates missing `publicMenu/*` and `publicSettings/toppingAvailability` documents from the approved defaults; it does not copy orders, users, or any production data.

Customer QR URL: `<UAT Hosting URL>/order`. Generate the printable QR only after the stable UAT Hosting URL is known; do not add a temporary URL to application source.

Customer-facing collections:

- `publicMenu/{productId}`: customer menu projection
- `publicSettings/toppingAvailability`: availability map
- `customerOrderRequests/{requestId}`: owner-bound anonymous request and status

Anonymous users cannot access `orders`, `counters`, private `settings`, staff `users`, or list requests. Only non-anonymous UAT staff can confirm/reject. Confirmation uses one Firestore transaction to reread the request, increment the existing daily counter, create `orders/{id}`, and update the request with the linked order and queue number.
