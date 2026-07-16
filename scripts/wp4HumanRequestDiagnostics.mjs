import { createHash } from "node:crypto";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const expectedProjectId = "greek-yogert-customer-uat-2026";
const projectId = process.env.CUSTOMER_UAT_FIREBASE_PROJECT_ID;
const capableEmail = process.env.CUSTOMER_UAT_MANAGER_EMAIL;
const ordinaryEmail = process.env.CUSTOMER_UAT_ORDINARY_STAFF_EMAIL;

if (projectId !== expectedProjectId) {
  throw new Error(
    "WP4 Human-UAT diagnostics are restricted to the isolated UAT project.",
  );
}
if (capableEmail !== "greekmore.uat@gmail.com") {
  throw new Error("The capable UAT account designation is not exact.");
}
if (ordinaryEmail !== "greekmore.staff.uat@gmail.com") {
  throw new Error("The ordinary UAT Staff account designation is not exact.");
}

const app = initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth(app);
const db = getFirestore(app);

async function getIdentityPlatformConfig() {
  const accessToken = await app.options.credential.getAccessToken();
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`,
    { headers: { Authorization: `Bearer ${accessToken.access_token}` } },
  );
  if (!response.ok)
    throw new Error(
      `Unable to inspect isolated-UAT Authentication provider configuration (${response.status})`,
    );
  return response.json();
}

const ownerHash = (uid) =>
  typeof uid === "string" && uid.length > 0
    ? createHash("sha256").update(uid).digest("hex").slice(0, 12)
    : null;

const timestampMillis = (value) =>
  typeof value?.toMillis === "function" ? value.toMillis() : null;

const safeAuthUser = async (email) => {
  try {
    const user = await auth.getUserByEmail(email);
    return { uid: user.uid, exists: true, disabled: user.disabled === true };
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      return { uid: null, exists: false, disabled: null };
    }
    throw error;
  }
};

const capableAccount = await safeAuthUser(capableEmail);
const ordinaryAccount = await safeAuthUser(ordinaryEmail);

const [
  identityConfig,
  capableAuthorization,
  ordinaryAuthorization,
  privateControl,
  publicControl,
  recentRequests,
] = await Promise.all([
  getIdentityPlatformConfig(),
  capableAccount.uid
    ? db.collection("users").doc(capableAccount.uid).get()
    : Promise.resolve(null),
  ordinaryAccount.uid
    ? db.collection("users").doc(ordinaryAccount.uid).get()
    : Promise.resolve(null),
  db.doc("settings/customerOrdering").get(),
  db.doc("publicSettings/customerOrdering").get(),
  db
    .collection("customerOrderRequests")
    .orderBy("submittedAt", "desc")
    .limit(25)
    .get(),
]);

const humanRequests = [];
for (const requestDocument of recentRequests.docs) {
  const request = requestDocument.data();
  const nickname =
    typeof request.customerNickname === "string"
      ? request.customerNickname
      : "";
  const note =
    typeof request.customerNote === "string" ? request.customerNote : "";
  if (nickname.startsWith("WP4-AUTO-") || note === "isolated browser UAT")
    continue;
  if (humanRequests.length >= 8) break;

  const [items, groups] = await Promise.all([
    requestDocument.ref.collection("items").get(),
    requestDocument.ref.collection("itemGroups").get(),
  ]);
  const itemIds = items.docs.map((document) => document.id).sort();
  const groupIds = groups.docs.map((document) => document.id).sort();
  const ownerUid = request.ownerUid;
  humanRequests.push({
    requestId: requestDocument.id,
    status: request.status ?? null,
    schemaVersion: request.schemaVersion ?? null,
    retryIdMatchesRequestId: request.retryId === requestDocument.id,
    ownerReference: ownerHash(ownerUid),
    submittedAtMillis: timestampMillis(request.submittedAt),
    itemIds,
    groupIds,
    itemCountMatchesSnapshot: request.itemCount === itemIds.length,
    childOwnershipConsistent: items.docs.every(
      (document) =>
        document.data().ownerUid === ownerUid &&
        document.data().requestId === requestDocument.id,
    ),
    groupOwnershipConsistent: groups.docs.every(
      (document) =>
        document.data().ownerUid === ownerUid &&
        document.data().requestId === requestDocument.id,
    ),
  });
}

const authorization = (snapshot) => {
  if (!snapshot) {
    return {
      exists: false,
      role: null,
      active: false,
      canManageCustomerOrdering: false,
    };
  }
  const data = snapshot.exists ? snapshot.data() : {};
  return {
    exists: snapshot.exists,
    role: data.role ?? null,
    active: data.active === true,
    canManageCustomerOrdering: data.canManageCustomerOrdering === true,
  };
};

const result = {
  projectId,
  readOnly: true,
  runtimeControl: {
    privateExists: privateControl.exists,
    privateEnabled: privateControl.exists
      ? privateControl.data().enabled === true
      : null,
    publicExists: publicControl.exists,
    publicEnabled: publicControl.exists
      ? publicControl.data().enabled === true
      : null,
  },
  authentication: {
    emailPasswordEnabled: identityConfig.signIn?.email?.enabled === true,
    capableUser: {
      exists: capableAccount.exists,
      disabled: capableAccount.disabled,
    },
    ordinaryUser: {
      exists: ordinaryAccount.exists,
      disabled: ordinaryAccount.disabled,
    },
  },
  authorization: {
    capable: authorization(capableAuthorization),
    ordinary: authorization(ordinaryAuthorization),
  },
  preservedHumanRequests: humanRequests,
  uidExposed: false,
  passwordExposed: false,
  writesPerformed: 0,
};

console.log(JSON.stringify(result, null, 2));
