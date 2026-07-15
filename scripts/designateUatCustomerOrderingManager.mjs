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
let designatedAccount = null;
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
    if (account.disabled || !account.email) continue;
    designated = authorization.ref;
    designatedAccount = account;
    break;
  } catch {
    // Deleted automated identities are intentionally skipped.
  }
}

if (!designated) {
  const authorizations = await firestore.collection("users").limit(100).get();
  const candidates = [];
  for (const authorization of authorizations.docs) {
    const data = authorization.data();
    if (data.role !== "staff" || data.active !== true) continue;
    try {
      const account = await auth.getUser(authorization.id);
      const email = account.email?.toLowerCase() ?? "";
      if (
        account.disabled ||
        !email ||
        automationActors.some((prefix) =>
          authorization.id.startsWith(prefix),
        ) ||
        email.includes("wp3-auto") ||
        email.includes("wp4-auto")
      )
        continue;
      candidates.push({
        authorization: authorization.ref,
        account,
        lastSignIn: Date.parse(account.metadata.lastSignInTime ?? "") || 0,
      });
    } catch {
      // Authorization documents without a current Auth account are skipped.
    }
  }
  candidates.sort((left, right) => right.lastSignIn - left.lastSignIn);
  designated = candidates[0]?.authorization ?? null;
  designatedAccount = candidates[0]?.account ?? null;
}

if (!designated) {
  const accounts = await auth.listUsers(1000);
  const candidates = accounts.users
    .filter((account) => {
      const email = account.email?.toLowerCase() ?? "";
      return (
        !account.disabled &&
        Boolean(email) &&
        !automationActors.some((prefix) => account.uid.startsWith(prefix)) &&
        !email.includes("wp3-auto") &&
        !email.includes("wp4-auto")
      );
    })
    .sort(
      (left, right) =>
        (Date.parse(right.metadata.lastSignInTime ?? "") || 0) -
        (Date.parse(left.metadata.lastSignInTime ?? "") || 0),
    );
  designatedAccount = candidates[0] ?? null;
  designated = designatedAccount
    ? firestore.doc(`users/${designatedAccount.uid}`)
    : null;
}

if (!designated || !designatedAccount)
  throw new Error(
    "No existing active non-automation UAT Staff account was found",
  );

await designated.set(
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
      "Use the most recently active non-automation UAT Staff account; the signed-in email and UI capability label identify it",
    maskedEmail: designatedAccount.email.replace(
      /^(.{1,2}).*(@.*)$/,
      "$1***$2",
    ),
    uidExposed: false,
    passwordExposed: false,
  }),
);
