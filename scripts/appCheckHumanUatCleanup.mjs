import { readFileSync, writeFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import {
  createOwnerReference,
  exactUatProjectId,
  isAutomatedUatRecord,
  isExactVerifiedIdentityToken,
  productionProjectId,
  timestampMillis,
  validateExactAnonymousOrphan,
  validateExactHumanUatChain,
} from "./appCheckHumanUatCleanupPolicy.mjs";

const argument = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const required = (name) => {
  const value = argument(name);
  if (!value || value.startsWith("--")) throw new Error(`Missing --${name}`);
  return value;
};
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const projectId = process.env.CUSTOMER_UAT_FIREBASE_PROJECT_ID;
const managerEmail = process.env.CUSTOMER_UAT_MANAGER_EMAIL;
const ordinaryEmail = process.env.CUSTOMER_UAT_ORDINARY_STAFF_EMAIL;
const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const apiKey = process.env.VITE_FIREBASE_API_KEY;
assert(
  projectId === exactUatProjectId,
  "Exact isolated UAT project is required",
);
assert(projectId !== productionProjectId, "Production access is prohibited");
assert(
  managerEmail === "greekmore.uat@gmail.com",
  "Exact capable UAT Staff is required",
);
assert(
  ordinaryEmail === "greekmore.staff.uat@gmail.com",
  "Exact ordinary UAT Staff is required",
);
assert(credentialPath, "The isolated UAT credential path is required");
assert(apiKey, "The isolated UAT Web API key is required");
const serviceAccount = JSON.parse(readFileSync(credentialPath, "utf8"));
assert(
  serviceAccount?.type === "service_account" &&
    serviceAccount.project_id === exactUatProjectId &&
    serviceAccount.client_email?.endsWith(
      `@${exactUatProjectId}.iam.gserviceaccount.com`,
    ),
  "Credential is outside the isolated UAT boundary",
);

const app = initializeApp(
  { credential: cert(serviceAccount), projectId },
  `app-check-human-${Date.now()}`,
);
const db = getFirestore(app);
const auth = getAuth(app);
const submittedAfter = required("submitted-after");
const submittedAfterMillis = Date.parse(submittedAfter);
assert(
  Number.isFinite(submittedAfterMillis),
  "Valid --submitted-after ISO timestamp is required",
);
const output = required("output");
const ownerReference = createOwnerReference;

async function identityRequest(action, body) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok)
    throw new Error(
      `Isolated UAT identity ${action} failed: ${response.status}`,
    );
  return response.json();
}

async function deleteIdentityAsExactUser(uid) {
  const customToken = await auth.createCustomToken(uid);
  const identity = await identityRequest("signInWithCustomToken", {
    token: customToken,
    returnSecureToken: true,
  });
  assert(identity.idToken, "Exact isolated UAT identity exchange failed");
  const verified = await auth.verifyIdToken(identity.idToken);
  assert(
    isExactVerifiedIdentityToken(verified, uid, projectId),
    "Exchanged identity token is outside the exact UAT identity boundary",
  );
  await identityRequest("delete", { idToken: identity.idToken });
}

async function staffState() {
  const [manager, ordinary] = await Promise.all([
    auth.getUserByEmail(managerEmail),
    auth.getUserByEmail(ordinaryEmail),
  ]);
  const [managerAuthorization, ordinaryAuthorization] = await Promise.all([
    db.doc(`users/${manager.uid}`).get(),
    db.doc(`users/${ordinary.uid}`).get(),
  ]);
  assert(
    !manager.disabled && !ordinary.disabled,
    "Designated UAT Staff must remain enabled",
  );
  assert(
    managerAuthorization.data()?.canManageCustomerOrdering === true &&
      ordinaryAuthorization.data()?.canManageCustomerOrdering !== true,
    "Designated UAT Staff authorization changed",
  );
  return { manager, ordinary };
}

async function readChain(requestDocument, staff) {
  const request = requestDocument.data();
  const [items, groups, orderDocument, owner, ownerAuthorization, audits] =
    await Promise.all([
      requestDocument.ref.collection("items").get(),
      requestDocument.ref.collection("itemGroups").get(),
      typeof request.confirmedOrderId === "string"
        ? db.doc(`orders/${request.confirmedOrderId}`).get()
        : Promise.resolve(null),
      auth.getUser(request.ownerUid),
      db.doc(`users/${request.ownerUid}`).get(),
      db
        .collection("customerOrderingAuditEvents")
        .where("requestId", "==", requestDocument.id)
        .get(),
    ]);
  const order = orderDocument?.exists ? orderDocument.data() : null;
  const ownerIsAnonymous =
    owner.providerData.length === 0 && !owner.email && !owner.phoneNumber;
  const validation = validateExactHumanUatChain({
    requestId: requestDocument.id,
    request,
    orderId: request.confirmedOrderId,
    order,
    submittedAfterMillis,
    itemIds: items.docs.map((entry) => entry.id),
    groupIds: groups.docs.map((entry) => entry.id),
    itemDocuments: items.docs.map((entry) => entry.data()),
    groupDocuments: groups.docs.map((entry) => entry.data()),
    designatedStaffUids: [staff.manager.uid, staff.ordinary.uid],
    ownerIsAnonymous,
    ownerAuthorizationExists: ownerAuthorization.exists,
  });
  return { request, items, groups, orderDocument, owner, audits, validation };
}

async function inspect() {
  const staff = await staffState();
  const recent = await db
    .collection("customerOrderRequests")
    .orderBy("submittedAt", "desc")
    .limit(25)
    .get();
  const candidates = [];
  for (const requestDocument of recent.docs) {
    const request = requestDocument.data();
    const submittedAt = timestampMillis(request.submittedAt);
    if (
      submittedAt === null ||
      submittedAt < submittedAfterMillis ||
      isAutomatedUatRecord(requestDocument.id, request)
    )
      continue;
    const chain = await readChain(requestDocument, staff);
    candidates.push({
      requestId: requestDocument.id,
      orderId: request.confirmedOrderId ?? null,
      queueNumber: request.queueNumber ?? null,
      customerName: request.customerName ?? null,
      status: request.status ?? null,
      submittedAtMillis: submittedAt,
      normalizedItemIds: chain.items.docs.map((entry) => entry.id).sort(),
      normalizedGroupIds: chain.groups.docs.map((entry) => entry.id).sort(),
      ownerReference: ownerReference(request.ownerUid),
      anonymousIdentity: chain.validation.errors.every(
        (error) =>
          !error.includes("anonymous Customer") && !error.includes("provider"),
      ),
      exactCleanupEligible: chain.validation.valid,
      validationErrors: chain.validation.errors,
      boundedRequestAuditCount: chain.audits.size,
    });
  }
  return {
    status: "passed",
    phase: "human-uat-inspection",
    projectId,
    submittedAfter,
    candidates,
    candidateCount: candidates.length,
    writesPerformed: 0,
    designatedStaff: "unchanged",
  };
}

async function cleanup() {
  assert(
    required("confirm") === "APP_CHECK_HUMAN_UAT_EXACT_CLEANUP",
    "Typed exact Human-UAT cleanup confirmation is required",
  );
  const requestId = required("request-id");
  const orderId = required("order-id");
  const staffBefore = await staffState();
  const requestDocument = await db
    .doc(`customerOrderRequests/${requestId}`)
    .get();
  assert(requestDocument.exists, "Exact Human-UAT request does not exist");
  const chain = await readChain(requestDocument, staffBefore);
  assert(
    chain.request.confirmedOrderId === orderId,
    "Exact Human-UAT Order does not match the request",
  );
  assert(
    chain.validation.valid,
    `Human-UAT cleanup rejected: ${chain.validation.errors.join("; ")}`,
  );
  const batch = db.batch();
  chain.items.docs.forEach((entry) => batch.delete(entry.ref));
  chain.groups.docs.forEach((entry) => batch.delete(entry.ref));
  batch.delete(chain.orderDocument.ref);
  batch.delete(requestDocument.ref);
  await batch.commit();
  await deleteIdentityAsExactUser(chain.owner.uid);
  const [requestAfter, orderAfter, itemsAfter, groupsAfter] = await Promise.all(
    [
      requestDocument.ref.get(),
      chain.orderDocument.ref.get(),
      requestDocument.ref.collection("items").get(),
      requestDocument.ref.collection("itemGroups").get(),
    ],
  );
  assert(
    !requestAfter.exists &&
      !orderAfter.exists &&
      itemsAfter.empty &&
      groupsAfter.empty,
    "Exact Human-UAT Firestore cleanup verification failed",
  );
  await auth.getUser(chain.owner.uid).then(
    () => {
      throw new Error(
        "Anonymous Human-UAT identity cleanup verification failed",
      );
    },
    (error) =>
      assert(
        error?.code === "auth/user-not-found",
        "Unable to verify Anonymous identity cleanup",
      ),
  );
  await staffState();
  const control = await db.doc("settings/customerOrdering").get();
  assert(
    control.data()?.enabled === true,
    "Customer Ordering is not enabled after cleanup",
  );
  return {
    status: "passed",
    phase: "human-uat-exact-cleanup",
    projectId,
    requestId,
    orderId,
    normalizedItemsDeleted: chain.items.size,
    normalizedGroupsDeleted: chain.groups.size,
    anonymousIdentityDeleted: true,
    queueCounterMutation: "none",
    boundedRequestAuditEvidencePreserved: chain.audits.size,
    designatedStaff: "unchanged",
    customerOrdering: "enabled",
  };
}

async function cleanupOrphanIdentity() {
  assert(
    required("confirm") === "APP_CHECK_HUMAN_UAT_EXACT_CLEANUP",
    "Typed exact Human-UAT cleanup confirmation is required",
  );
  const expectedOwnerReference = required("owner-reference");
  assert(
    /^[a-f0-9]{12}$/.test(expectedOwnerReference),
    "Exact hashed owner reference is required",
  );
  const staff = await staffState();
  const matches = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    matches.push(
      ...page.users.filter(
        (user) => ownerReference(user.uid) === expectedOwnerReference,
      ),
    );
    pageToken = page.pageToken;
  } while (pageToken);
  assert(
    matches.length === 1,
    "Expected exactly one hashed Anonymous identity",
  );
  const owner = matches[0];
  const ownerAuthorization = await db.doc(`users/${owner.uid}`).get();
  const validation = validateExactAnonymousOrphan({
    uid: owner.uid,
    expectedOwnerReference,
    creationTime: owner.metadata.creationTime,
    submittedAfterMillis,
    providerData: owner.providerData,
    email: owner.email,
    phoneNumber: owner.phoneNumber,
    ownerAuthorizationExists: ownerAuthorization.exists,
    designatedStaffUids: [staff.manager.uid, staff.ordinary.uid],
  });
  assert(
    validation.valid,
    `Anonymous orphan cleanup rejected: ${validation.errors.join("; ")}`,
  );
  await deleteIdentityAsExactUser(owner.uid);
  await auth.getUser(owner.uid).then(
    () => {
      throw new Error(
        "Anonymous Human-UAT identity cleanup verification failed",
      );
    },
    (error) =>
      assert(
        error?.code === "auth/user-not-found",
        "Unable to verify Anonymous identity cleanup",
      ),
  );
  await staffState();
  return {
    status: "passed",
    phase: "human-uat-exact-orphan-identity-cleanup",
    projectId,
    ownerReference: expectedOwnerReference,
    anonymousIdentityDeleted: true,
    firestoreWrites: 0,
    queueCounterMutation: "none",
    designatedStaff: "unchanged",
  };
}

const command = required("command");
const result =
  command === "inspect"
    ? await inspect()
    : command === "cleanup"
      ? await cleanup()
      : command === "cleanup-identity"
        ? await cleanupOrphanIdentity()
        : (() => {
            throw new Error("Unknown App Check Human-UAT data command");
          })();
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
console.log(
  JSON.stringify({
    status: result.status,
    phase: result.phase,
    projectId: result.projectId,
    candidateCount: result.candidateCount,
  }),
);
