import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const projectId = process.env.CUSTOMER_UAT_FIREBASE_PROJECT_ID;
if (projectId !== "greek-yogert-customer-uat-2026")
  throw new Error(
    "UAT capability designation requires the exact isolated project",
  );
if (projectId === "greek-yogert")
  throw new Error("Production capability designation is prohibited");

const app = initializeApp({ credential: applicationDefault(), projectId });
const firestore = getFirestore(app);
const auth = getAuth(app);
const automationActors = ["github-actions", "wp4-uat", "wp4-admin"];
const audits = await firestore
  .collection("customerOrderingAuditEvents")
  .orderBy("occurredAt", "desc")
  .limit(100)
  .get();

let designated = null;
for (const audit of audits.docs) {
  const value = audit.data();
  const actorUid = typeof value.actorUid === "string" ? value.actorUid : "";
  if (
    value.eventType !== "control_change" ||
    value.newState !== "disabled" ||
    !actorUid ||
    automationActors.some((prefix) => actorUid.startsWith(prefix))
  )
    continue;
  const authorization = await firestore.doc(`users/${actorUid}`).get();
  const data = authorization.data();
  if (!authorization.exists || data?.role !== "staff" || data.active !== true)
    continue;
  try {
    const account = await auth.getUser(actorUid);
    if (!account.email || account.providerData.length === 0) continue;
    designated = authorization.ref;
    break;
  } catch {
    // Deleted automated identities are intentionally skipped.
  }
}

if (!designated)
  throw new Error(
    "No existing active UAT Staff account from the Human disable evidence was found",
  );

await designated.set(
  {
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
      "Use the same UAT Staff account that performed the latest Human emergency disable; the UI capability label is authoritative",
    uidExposed: false,
    passwordExposed: false,
  }),
);
