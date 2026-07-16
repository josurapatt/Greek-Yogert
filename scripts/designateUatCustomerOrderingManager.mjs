import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

const projectId = process.env.CUSTOMER_UAT_FIREBASE_PROJECT_ID;
const managerEmail =
  process.env.CUSTOMER_UAT_MANAGER_EMAIL?.trim().toLowerCase();
const ordinaryStaffEmail =
  process.env.CUSTOMER_UAT_ORDINARY_STAFF_EMAIL?.trim().toLowerCase();
const allowedManagerEmail = "greekmore.uat@gmail.com";
const allowedOrdinaryStaffEmail = "greekmore.staff.uat@gmail.com";
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
if (ordinaryStaffEmail !== allowedOrdinaryStaffEmail)
  throw new Error(
    "The exact approved isolated-UAT ordinary Staff email is required",
  );

const app = initializeApp({ credential: applicationDefault(), projectId });
const firestore = getFirestore(app);
const auth = getAuth(app);

async function getApprovedAccount(email, label) {
  try {
    const account = await auth.getUserByEmail(email);
    if (account.disabled || account.email?.toLowerCase() !== email)
      throw new Error(
        `The approved isolated-UAT ${label} account is unavailable`,
      );
    return account;
  } catch (cause) {
    if (cause?.code === "auth/user-not-found")
      throw new Error(
        `The approved isolated-UAT ${label} Firebase Authentication account does not exist`,
      );
    if (cause?.code === "auth/insufficient-permission")
      throw new Error(
        `UAT CI principal ${readCredentialPrincipal()} requires Firebase Authentication Viewer in project ${projectId}`,
      );
    throw cause;
  }
}

const managerAccount = await getApprovedAccount(managerEmail, "capable Staff");
const ordinaryAccount = await getApprovedAccount(
  ordinaryStaffEmail,
  "ordinary Staff",
);

const managerAuthorization = await firestore
  .doc(`users/${managerAccount.uid}`)
  .get();
const managerData = managerAuthorization.data();
if (
  !managerAuthorization.exists ||
  managerData?.role !== "staff" ||
  managerData.active !== true ||
  managerData.canManageCustomerOrdering !== true
)
  throw new Error(
    "The approved isolated-UAT capable Staff authorization is not configured",
  );

const ordinaryAuthorization = firestore.doc(`users/${ordinaryAccount.uid}`);
await ordinaryAuthorization.set(
  {
    role: "staff",
    active: true,
    canManageCustomerOrdering: FieldValue.delete(),
    customerOrderingCapabilityAssignedAt: FieldValue.delete(),
    customerOrderingCapabilityScope: FieldValue.delete(),
  },
  { merge: true },
);

const ordinaryData = (await ordinaryAuthorization.get()).data();
if (
  ordinaryData?.role !== "staff" ||
  ordinaryData.active !== true ||
  ordinaryData.canManageCustomerOrdering === true
)
  throw new Error(
    "The isolated-UAT ordinary Staff authorization verification failed",
  );

console.log(
  JSON.stringify({
    projectId,
    capableVerifiedUnchanged: true,
    ordinaryStaffDesignated: true,
    accountHint:
      "Use the dedicated capable or ordinary Greek Yogurt Customer QR UAT account for its documented role",
    capableMaskedEmail: managerEmail.replace(/^(.{1,2}).*(@.*)$/, "$1***$2"),
    ordinaryMaskedEmail: ordinaryStaffEmail.replace(
      /^(.{1,2}).*(@.*)$/,
      "$1***$2",
    ),
    ordinaryCanManageCustomerOrdering: false,
    uidExposed: false,
    passwordExposed: false,
  }),
);
