# Customer QR Demo/UAT setup

This feature never targets the production Firebase project. Create a separate Spark-plan Firebase project, for example `greek-yogert-customer-uat`, then create a Web App, Firestore database, and enable Email/Password plus Anonymous Authentication **in that UAT project only**.

Create one authorized UAT staff user in Firebase Console: Authentication → Users → Add user. Do not commit that password.

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
