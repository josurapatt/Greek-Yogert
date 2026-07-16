import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

const projectId = process.env.CUSTOMER_UAT_FIREBASE_PROJECT_ID;
const managerEmail =
  process.env.CUSTOMER_UAT_MANAGER_EMAIL?.trim().toLowerCase();
const allowedManagerEmail = "greekmore.uat@gmail.com";
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

function readCredentialPrincipal() {
  if (!credentialsPath) return "unknown UAT CI principal";
  try {
    const value = JSON.parse(readFileSync(credentialsPath, "utf8"));
    const email =
      typeof value.client_email === "string" ? value.client_email : "";
    if (
      email.endsWith("@greek-yogert-customer-uat-2026.iam.gserviceaccount.com")
    )
      return email;
  } catch {
    // Never include credential file contents in the failure output.
  }
  return "unknown UAT CI principal";
}

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
  if (cause?.code === "auth/insufficient-permission")
    throw new Error(
      `UAT CI principal ${readCredentialPrincipal()} requires Firebase Authentication Viewer in project ${projectId}`,
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
