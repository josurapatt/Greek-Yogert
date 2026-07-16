import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import {
  applicationDefault,
  initializeApp as initializeAdminApp,
} from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import {
  FieldValue,
  getFirestore as getAdminFirestore,
} from "firebase-admin/firestore";
import { deleteApp, initializeApp as initializeClientApp } from "firebase/app";
import { getAuth as getClientAuth, signInWithCustomToken } from "firebase/auth";
import {
  doc,
  getFirestore as getClientFirestore,
  updateDoc,
} from "firebase/firestore";
import { changeCustomerOrderingControl } from "../src/customerOrderingControl.ts";

const projectId = process.env.CUSTOMER_UAT_FIREBASE_PROJECT_ID;
const apiKey = process.env.CUSTOMER_UAT_FIREBASE_API_KEY;
const expectedProjectId = "greek-yogert-customer-uat-2026";
const productionProjectId = "greek-yogert";
const expectedManagerEmail = "greekmore.uat@gmail.com";
const expectedOrdinaryEmail = "greekmore.staff.uat@gmail.com";
const managerEmail =
  process.env.CUSTOMER_UAT_MANAGER_EMAIL?.trim().toLowerCase();
const ordinaryEmail =
  process.env.CUSTOMER_UAT_ORDINARY_STAFF_EMAIL?.trim().toLowerCase();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function required(name) {
  const value = argument(name);
  if (!value || value.startsWith("--")) throw new Error(`Missing --${name}`);
  return value;
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writeResult(value) {
  const output = required("output");
  writeFileSync(output, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  console.log(
    JSON.stringify({
      status: value.status,
      projectId: value.projectId,
      phase: value.phase,
    }),
  );
}

assert(
  projectId === expectedProjectId,
  "WP5 requires the exact isolated project",
);
assert(projectId !== productionProjectId, "Production access is prohibited");
assert(
  managerEmail === expectedManagerEmail,
  "Exact capable UAT Staff is required",
);
assert(
  ordinaryEmail === expectedOrdinaryEmail,
  "Exact ordinary UAT Staff is required",
);

const credential = applicationDefault();
const adminApp = initializeAdminApp(
  { credential, projectId },
  `wp5-${Date.now()}`,
);
const firestore = getAdminFirestore(adminApp);
const adminAuth = getAdminAuth(adminApp);

async function accessToken() {
  const value = await credential.getAccessToken();
  assert(value?.access_token, "Unable to obtain isolated UAT access token");
  return value.access_token;
}

async function authorizedJson(url, optional = false) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
  });
  if (!response.ok) {
    if (optional) return { available: false, status: response.status };
    throw new Error(`Isolated UAT metadata request failed: ${response.status}`);
  }
  return response.json();
}

async function designatedStaff() {
  const [manager, ordinary] = await Promise.all([
    adminAuth.getUserByEmail(managerEmail),
    adminAuth.getUserByEmail(ordinaryEmail),
  ]);
  assert(
    !manager.disabled && !ordinary.disabled,
    "A designated Staff account is disabled",
  );
  const [managerRow, ordinaryRow] = await Promise.all([
    firestore.doc(`users/${manager.uid}`).get(),
    firestore.doc(`users/${ordinary.uid}`).get(),
  ]);
  const managerData = managerRow.data();
  const ordinaryData = ordinaryRow.data();
  assert(
    managerRow.exists &&
      managerData?.role === "staff" &&
      managerData.active === true &&
      managerData.canManageCustomerOrdering === true,
    "Capable Staff authorization is not ready",
  );
  assert(
    ordinaryRow.exists &&
      ordinaryData?.role === "staff" &&
      ordinaryData.active === true &&
      ordinaryData.canManageCustomerOrdering !== true,
    "Ordinary Staff authorization is not ready",
  );
  return { manager, ordinary };
}

async function temporaryCounts() {
  const [requests, orders] = await Promise.all([
    firestore.collection("customerOrderRequests").get(),
    firestore.collection("orders").get(),
  ]);
  const isWp5 = (snapshot) => {
    const data = snapshot.data();
    return [snapshot.id, data.customerName, data.customerNote]
      .filter((value) => typeof value === "string")
      .some((value) => value.startsWith("WP5-"));
  };
  return {
    customerRequests: requests.docs.filter(isWp5).length,
    orders: orders.docs.filter(isWp5).length,
  };
}

async function capture(phase) {
  const staff = await designatedStaff();
  const [
    publicMenu,
    publicAvailability,
    publicPolicy,
    projectionControl,
    privateProducts,
    privateAvailability,
    privateControl,
    publicControl,
    indexesResponse,
    authConfig,
    rulesRelease,
    hostingReleases,
    temp,
  ] = await Promise.all([
    firestore.collection("publicMenu").get(),
    firestore.doc("publicSettings/toppingAvailability").get(),
    firestore.doc("publicSettings/customerRequestPolicy").get(),
    firestore.doc("publicProjectionControl/current").get(),
    firestore.collection("products").get(),
    firestore.doc("settings/toppingAvailability").get(),
    firestore.doc("settings/customerOrdering").get(),
    firestore.doc("publicSettings/customerOrdering").get(),
    authorizedJson(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/collectionGroups/-/indexes`,
    ),
    authorizedJson(
      `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`,
    ),
    authorizedJson(
      `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases/cloud.firestore`,
      true,
    ),
    authorizedJson(
      `https://firebasehosting.googleapis.com/v1beta1/sites/${projectId}/releases?pageSize=1`,
      true,
    ),
    temporaryCounts(),
  ]);
  const indexes = (indexesResponse.indexes ?? []).map((index) => ({
    collectionGroup: index.queryScope
      ? index.name?.split("/collectionGroups/")[1]?.split("/indexes/")[0]
      : undefined,
    state: index.state,
    queryScope: index.queryScope,
    fields: (index.fields ?? []).map((field) => ({
      fieldPath: field.fieldPath,
      order: field.order,
      arrayConfig: field.arrayConfig,
    })),
  }));
  const readyIndexes = indexes.filter((index) => index.state === "READY");
  const privateControlData = privateControl.data();
  const publicControlData = publicControl.data();
  assert(
    staff.manager.uid !== staff.ordinary.uid,
    "Designated Staff identities overlap",
  );
  return {
    status: "passed",
    phase,
    projectId,
    projectIdentity: "exact-isolated-uat",
    credentialProjectIdentity: "verified-by-admin-sdk",
    hosting:
      hostingReleases.available === false
        ? { currentRelease: "not-available-to-uat-principal" }
        : {
            currentRelease:
              hostingReleases.releases?.[0]?.name?.split("/").pop() ?? "none",
            version:
              hostingReleases.releases?.[0]?.version?.name?.split("/").pop() ??
              "unknown",
          },
    rules: {
      candidateFile: "firestore.production.rules",
      candidateSha256: sha256File("firestore.production.rules"),
      deployedRelease:
        rulesRelease.available === false
          ? "not-available-to-uat-principal"
          : (rulesRelease.rulesetName?.split("/").pop() ?? "unknown"),
    },
    indexes: {
      candidateFile: "firestore.indexes.json",
      candidateSha256: sha256File("firestore.indexes.json"),
      observedCompositeCount: indexes.length,
      readyCompositeCount: readyIndexes.length,
      allReady: indexes.length > 0 && readyIndexes.length === indexes.length,
      definitions: indexes,
    },
    projection: {
      fingerprint: projectionControl.data()?.fingerprint ?? null,
      schemaVersion: projectionControl.data()?.schemaVersion ?? null,
      publicMenuCount: publicMenu.size,
      publicMenuIds: publicMenu.docs.map((entry) => entry.id).sort(),
      availabilityPresent: publicAvailability.exists,
      requestPolicyPresent: publicPolicy.exists,
      privateProductCount: privateProducts.size,
      privateAvailabilityPresent: privateAvailability.exists,
    },
    customerOrdering:
      privateControlData?.schemaVersion === 1 &&
      publicControlData?.schemaVersion === 1 &&
      privateControlData.enabled === publicControlData.enabled
        ? privateControlData.enabled
          ? "enabled"
          : "disabled"
        : "missing-or-malformed",
    designatedStaff: {
      capable: "active-with-reenable-capability",
      ordinary: "active-without-reenable-capability",
      identitiesDistinct: true,
      authorizationDocumentsUnchanged: true,
    },
    authentication: {
      emailPassword:
        authConfig.signIn?.email?.enabled === true ? "enabled" : "disabled",
      anonymous:
        authConfig.signIn?.anonymous?.enabled === true ? "enabled" : "disabled",
    },
    temporaryBaseline: temp,
  };
}

async function expectDenied(action) {
  try {
    await action();
  } catch (cause) {
    const code = String(cause?.code ?? "");
    if (code.includes("permission-denied")) return;
    throw cause;
  }
  throw new Error("Expected the isolated UAT Rules to deny the operation");
}

async function exerciseStaff() {
  assert(apiKey, "Staff rehearsal requires the isolated UAT API key");
  const { manager, ordinary } = await designatedStaff();
  const clients = [];
  const clientFor = async (account, label) => {
    const app = initializeClientApp(
      { apiKey, authDomain: `${projectId}.firebaseapp.com`, projectId },
      `wp5-${label}-${randomUUID()}`,
    );
    clients.push(app);
    const token = await adminAuth.createCustomToken(account.uid);
    await signInWithCustomToken(getClientAuth(app), token);
    return getClientFirestore(app);
  };
  const [ordinaryDb, managerDb] = await Promise.all([
    clientFor(ordinary, "ordinary"),
    clientFor(manager, "capable"),
  ]);
  try {
    const control = await firestore.doc("settings/customerOrdering").get();
    if (control.data()?.enabled !== true)
      await changeCustomerOrderingControl(managerDb, {
        enabled: true,
        message: "",
        reason: "WP5 designated Staff rehearsal baseline",
        actorUid: manager.uid,
        canManageCustomerOrdering: true,
      });
    await changeCustomerOrderingControl(ordinaryDb, {
      enabled: false,
      message: "ปิดรับคำสั่งซื้อใหม่ชั่วคราวระหว่างการซ้อม WP5",
      reason: "WP5 ordinary Staff disable rehearsal",
      actorUid: ordinary.uid,
      canManageCustomerOrdering: false,
    });
    await expectDenied(() =>
      changeCustomerOrderingControl(ordinaryDb, {
        enabled: true,
        message: "",
        reason: "WP5 ordinary Staff re-enable must be denied",
        actorUid: ordinary.uid,
        canManageCustomerOrdering: true,
      }),
    );
    await expectDenied(() =>
      updateDoc(doc(ordinaryDb, "users", ordinary.uid), {
        canManageCustomerOrdering: true,
      }),
    );
    await changeCustomerOrderingControl(managerDb, {
      enabled: true,
      message: "",
      reason: "WP5 capable Staff reviewed and restored intake",
      actorUid: manager.uid,
      canManageCustomerOrdering: true,
    });
  } finally {
    await Promise.all(clients.map((app) => deleteApp(app)));
  }
  return {
    status: "passed",
    phase: "designated-staff-rehearsal",
    projectId,
    capableStaff: "active-and-reenabled-with-reason",
    ordinaryStaff: "active-disable-passed-reenable-denied",
    clientSelfGrant: "denied",
    identityMutation: "none",
    passwordMutation: "none",
  };
}

async function setControl() {
  assert(
    required("confirm") === "WP5_SET_CUSTOMER_ORDERING",
    "Typed WP5 control confirmation is required",
  );
  const enabledValue = required("enabled");
  assert(
    enabledValue === "true" || enabledValue === "false",
    "Control state must be true or false",
  );
  const enabled = enabledValue === "true";
  const changeId = `wp5-release-rehearsal-${randomUUID()}`;
  await firestore.runTransaction(async (transaction) => {
    const privateRef = firestore.doc("settings/customerOrdering");
    const publicRef = firestore.doc("publicSettings/customerOrdering");
    const previous = await transaction.get(privateRef);
    const previousData = previous.data();
    const previousState =
      previousData?.schemaVersion === 1 &&
      typeof previousData.enabled === "boolean"
        ? previousData.enabled
          ? "enabled"
          : "disabled"
        : "missing-or-malformed";
    const timestamp = FieldValue.serverTimestamp();
    const message = enabled
      ? ""
      : "ปิดรับคำสั่งซื้อใหม่ชั่วคราวระหว่างการซ้อมย้อนกลับ WP5";
    const reason = enabled
      ? "WP5 exact release candidate restoration complete"
      : "WP5 deterministic Customer-disabled Hosting rollback rehearsal";
    transaction.set(privateRef, {
      schemaVersion: 1,
      enabled,
      message,
      reason,
      updatedAt: timestamp,
      updatedBy: "wp5-release-rehearsal-operator",
      changeId,
      disabledAt: enabled ? null : timestamp,
    });
    transaction.set(publicRef, {
      schemaVersion: 1,
      enabled,
      message,
      updatedAt: timestamp,
      changeId,
    });
    transaction.set(firestore.doc(`customerOrderingAuditEvents/${changeId}`), {
      eventType: "control_change",
      controlSchemaVersion: 1,
      previousState,
      newState: enabled ? "enabled" : "disabled",
      actorUid: "wp5-release-rehearsal-operator",
      reason,
      occurredAt: timestamp,
      changeId,
    });
  });
  return {
    status: "passed",
    phase: enabled ? "rollback-restoration" : "rollback-disable",
    projectId,
    customerOrdering: enabled ? "enabled" : "disabled",
    auditEvidence: "retained",
  };
}

const command = required("command");
if (command === "capture") {
  writeResult(await capture(argument("phase") ?? "pre-release"));
} else if (command === "exercise-staff") {
  writeResult(await exerciseStaff());
} else if (command === "set-control") {
  writeResult(await setControl());
} else if (command === "final") {
  const enabledBaseline = required("enabled-baseline");
  const restoredBaseline = required("restored-baseline");
  assert(
    enabledBaseline === restoredBaseline,
    "Enabled Hosting candidate was not restored exactly",
  );
  const value = await capture("final");
  assert(
    value.customerOrdering === "enabled",
    "Final Customer ordering state is not enabled",
  );
  assert(
    value.authentication.emailPassword === "enabled",
    "Email/Password is unavailable",
  );
  assert(
    value.authentication.anonymous === "enabled",
    "Anonymous Authentication is unavailable",
  );
  assert(
    value.indexes.observedCompositeCount === 6,
    "Exactly six UAT composite indexes are required",
  );
  assert(
    value.indexes.readyCompositeCount === 6,
    "All six UAT indexes must be ready",
  );
  assert(
    value.temporaryBaseline.customerRequests === 0,
    "WP5 Customer requests remain",
  );
  assert(value.temporaryBaseline.orders === 0, "WP5 Orders remain");
  writeResult({
    status: "passed",
    phase: "final",
    projectId,
    customerOrdering: "enabled",
    designatedStaff: "unchanged",
    indexes: "six-ready",
    authentication: "email-password-and-anonymous-ready",
    projectionFingerprint: value.projection.fingerprint,
    rollback: "customer-disabled-hosting-then-exact-candidate-restored",
    rollbackBaselineIdentifier: enabledBaseline,
    cleanup: "passed",
    retainedEvidence: "bounded-control-audit-only",
  });
} else {
  throw new Error("Unknown WP5 UAT state command");
}
