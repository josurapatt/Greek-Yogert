# Browser-only production deployment

The Product Owner does not need Node.js, npm, pnpm, or a local terminal. The repository contains a manual GitHub Actions workflow that builds the app on GitHub's runner and deploys Firestore rules, Firestore indexes, and Firebase Hosting.

The workflow is intentionally manual (`workflow_dispatch` only). Nothing deploys on a normal push, which prevents an accidental production release.

## One-time setup

### 1. Create or select the Firebase project

1. Open [Firebase Console](https://console.firebase.google.com/) in a browser.
2. Create a new project or select the shop's existing project. Record the exact **Project ID**.
3. Add a Web app under Project settings and copy its configuration values.
4. Open **Authentication → Sign-in method** and enable **Email/Password**.
5. Open **Firestore Database** and create the database in a suitable Asia-Pacific location.
6. In **Authentication → Users**, create the two shop accounts. Keep these passwords private; they are never placed in this repository.

The app treats Firebase as production only when all six web configuration values are present. If any value is missing, it remains visibly in `โหมดทดลอง` and uses browser-local demo data.

### 2. Create or select the GitHub repository

Create an empty private GitHub repository (without a README or generated files). Upload the contents of this project using the connected Codex/GitHub workflow, or use GitHub's browser upload flow. Do not upload `node_modules`, `dist`, `.env.local`, `.env`, or any service-account JSON file. The committed `.gitignore` excludes those local/generated files.

The current workspace has not been pushed because no repository URL or GitHub approval was provided. That is the only repository action still required.

### 3. Add GitHub Actions secrets

In the repository, open **Settings → Secrets and variables → Actions → New repository secret**. Add these exact names:

| Secret                              | Value                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `FIREBASE_PROJECT_ID`               | Firebase Project ID                                                                                          |
| `FIREBASE_SERVICE_ACCOUNT_JSON`     | Full JSON private key generated from Firebase Project settings → Service accounts → Generate new private key |
| `VITE_FIREBASE_API_KEY`             | Web app config `apiKey`                                                                                      |
| `VITE_FIREBASE_AUTH_DOMAIN`         | Web app config `authDomain`                                                                                  |
| `VITE_FIREBASE_PROJECT_ID`          | Web app config `projectId` (normally the same as `FIREBASE_PROJECT_ID`)                                      |
| `VITE_FIREBASE_STORAGE_BUCKET`      | Web app config `storageBucket`                                                                               |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Web app config `messagingSenderId`                                                                           |
| `VITE_FIREBASE_APP_ID`              | Web app config `appId`                                                                                       |

Treat `FIREBASE_SERVICE_ACCOUNT_JSON` as highly sensitive. Paste it only into the GitHub secret field; never commit it, place it in `.env.example`, or send it in chat. If it is exposed, revoke that key in Firebase/Google Cloud and create a replacement.

### 4. Run the deployment from a browser

1. Open the repository's **Actions** tab.
2. Select **Deploy Greek & More to Firebase**.
3. Click **Run workflow**, keep the default branch, and confirm.
4. Wait for the `build-and-deploy` job to finish successfully. The workflow runs tests, creates a production build with the GitHub secrets, then deploys rules, indexes, and Hosting.
5. In Firebase Console, open **Hosting** and copy the `web.app` or `firebaseapp.com` URL.

Open that URL on both the iPad Pro M2 and Samsung S23 Ultra. The header must show `ระบบจริง`, not `โหมดทดลอง`.

## Production activation checklist

- [ ] Correct Firebase Project ID recorded
- [ ] Firebase Web App registered
- [ ] All six web config values added as GitHub secrets
- [ ] Email/Password Authentication enabled
- [ ] Two shop accounts created
- [ ] Firestore database created
- [ ] `FIREBASE_SERVICE_ACCOUNT_JSON` added only to GitHub Actions secrets
- [ ] Workflow completed successfully
- [ ] Firestore rules deployed
- [ ] Firestore indexes deployed
- [ ] Firebase Hosting deployed
- [ ] Production URL shows `ระบบจริง`
- [ ] Login tested on both devices
- [ ] Test order, queue update, completion, cancellation, restore, report, Excel export, and JSON backup tested

## Redeploy and rollback

- To redeploy the current commit, run the same workflow again from **Actions → Run workflow**.
- To roll back application code, revert the bad commit in GitHub, then run the workflow again. The workflow always rebuilds from the selected repository commit.
- Firebase Hosting also keeps release history. Use **Firebase Console → Hosting → Release history** to roll back a Hosting release if needed.
- Firestore rules and indexes are versioned in this repository. Revert the rules/index changes in GitHub and run the workflow again. Do not delete production orders to undo a deployment.

## Local demo safety

Demo mode remains useful for development, but it is visibly labeled and isolated:

- No complete Firebase config means `firebaseReady` is false.
- Demo login uses only `localStorage` and the `demo-user` ID.
- Production builds created with the six GitHub secrets use Firebase Auth/Firestore instead of demo storage.
- Production initialization does not load local demo orders/products.

The workflow is the preferred path because the Product Owner only needs a browser after the one-time Firebase and GitHub setup.
