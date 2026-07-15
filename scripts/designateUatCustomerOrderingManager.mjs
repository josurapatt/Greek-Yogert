import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const projectId = process.env.CUSTOMER_UAT_FIREBASE_PROJECT_ID;
const managerEmail =
  process.env.CUSTOMER_UAT_MANAGER_EMAIL?.trim().toLowerCase();
const allowedManagerEmail = "greekmore.uat@gmail.com";

if (projectId !== "greek-yogert-customer-uat-2026")
  throw new Error(
    "UAT capability designation requires the exact isolated project",
  );
if (projectId === "greek-yogert")
  throw new Error("Production capability designation is prohibited");
if (managerEmail !== allowedManagerEmail)
  throw new Error("The exact approved isolated-UAT manager email is required");

const app = initializeApp({ credential: applicationDefault(), projectId });
const firestore = getFirestore(app);
const auth = getAuth(app);

let account;
try {
  account = await auth.getUserByEmail(managerEmail);
} catch (cause) {
  if (cause?.code === "auth/user-not-found")
    throw new Error(
      "The approved isolated-UAT Firebase Authentication account does not exist",
    );
  throw cause;
}

if (account.disabled || account.email?.toLowerCase() !== managerEmail)
  throw new Error("The approved isolated-UAT account is unavailable");

await firestore.doc(`users/${account.uid}`).set(
  {
    role: "staff",
    active: true,
    canManageCustomerOrdering: true,
    customerOrderingCapabilityAssignedAt: FieldValue.serverTimestamp(),
    customerOrderingCapabilityScope: "isolated-uat-human-retest",
  },
  { merge: true },
);

console.log(
  JSON.stringify({
    projectId,
    designated: true,
    accountHint:
      "Sign in with the dedicated Greek Yogurt Customer QR UAT account",
    maskedEmail: managerEmail.replace(/^(.{1,2}).*(@.*)$/, "$1***$2"),
    uidExposed: false,
    passwordExposed: false,
  }),
);
