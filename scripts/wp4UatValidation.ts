import { randomBytes, randomUUID } from "node:crypto";
import {
  applicationDefault,
  getApps,
  initializeApp as initializeAdminApp,
} from "firebase-admin/app";
import {
  FieldValue,
  getFirestore as getAdminFirestore,
} from "firebase-admin/firestore";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  signInAnonymously,
  type User,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { changeCustomerOrderingControl } from "../src/customerOrderingControl";
import {
  createCustomerRequest,
  customerOptionLabels,
  customerPublicProductToProduct,
} from "../src/customerOrder";
import { splitCustomerRequestForWrite } from "../src/customerRequestChunks";
import { rejectCustomerRequestTransaction } from "../src/customerRequestActions";
import { toFirestoreData } from "../src/firestoreData";
import type {
  CartItem,
  PublicCustomerProduct,
  ToppingAvailability,
} from "../src/types";

const projectId = process.env.CUSTOMER_UAT_FIREBASE_PROJECT_ID;
const apiKey = process.env.CUSTOMER_UAT_FIREBASE_API_KEY;
if (projectId !== "greek-yogert-customer-uat-2026")
  throw new Error("WP4 UAT requires the exact isolated UAT project");
if (!apiKey) throw new Error("Missing isolated UAT Firebase API key");
if (!getApps().length)
  initializeAdminApp({ credential: applicationDefault(), projectId });

const admin = getAdminFirestore();
const marker = `WP4-AUTO-${Date.now()}`;
const apps: FirebaseApp[] = [];
const users: User[] = [];
const authorizationPaths: string[] = [];
const requestIds: string[] = [];
let validationFailure: unknown;
let result: Record<string, unknown> | undefined;
const cleanupFailures: unknown[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function clientApp(label: string) {
  const value = initializeApp(
    { apiKey, authDomain: `${projectId}.firebaseapp.com`, projectId },
    `${marker}-${label}`,
  );
  apps.push(value);
  return value;
}

async function emailIdentity(label: string) {
  const value = clientApp(label);
  const credential = await createUserWithEmailAndPassword(
    getAuth(value),
    `${marker.toLowerCase()}-${label}@example.com`,
    `Wp4!${randomBytes(18).toString("base64url")}`,
  );
  users.push(credential.user);
  return { user: credential.user, firestore: getFirestore(value) };
}

async function anonymousIdentity(label: string) {
  const value = clientApp(label);
  const credential = await signInAnonymously(getAuth(value));
  users.push(credential.user);
  return { user: credential.user, firestore: getFirestore(value) };
}

async function authorize(user: User, capable: boolean) {
  await admin.doc(`users/${user.uid}`).set({
    role: "staff",
    active: true,
    ...(capable ? { canManageCustomerOrdering: true } : {}),
  });
  authorizationPaths.push(`users/${user.uid}`);
  await user.getIdToken(true);
}

async function expectDenied(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (cause) {
    const code = String((cause as { code?: unknown }).code ?? "");
    if (code.includes("permission-denied")) return;
    throw cause;
  }
  throw new Error("Expected isolated UAT Rules to deny the operation");
}

async function adminControl(enabled: boolean, reason: string) {
  const changeId = `wp4-admin-${randomUUID()}`;
  await admin.runTransaction(async (transaction) => {
    const privateRef = admin.doc("settings/customerOrdering");
    const publicRef = admin.doc("publicSettings/customerOrdering");
    const previous = await transaction.get(privateRef);
    const data = previous.data();
    const previousState = !previous.exists
      ? "missing"
      : data?.schemaVersion === 1 && typeof data.enabled === "boolean"
        ? data.enabled
          ? "enabled"
          : "disabled"
        : "malformed";
    const timestamp = FieldValue.serverTimestamp();
    const actorUid = "wp4-uat-recovery";
    transaction.set(privateRef, {
      schemaVersion: 1,
      enabled,
      message: enabled ? "" : "ปิดรับคำสั่งซื้อใหม่ชั่วคราวระหว่าง UAT",
      reason,
      updatedAt: timestamp,
      updatedBy: actorUid,
      changeId,
      disabledAt: enabled ? null : timestamp,
    });
    transaction.set(publicRef, {
      schemaVersion: 1,
      enabled,
      message: enabled ? "" : "ปิดรับคำสั่งซื้อใหม่ชั่วคราวระหว่าง UAT",
      updatedAt: timestamp,
      changeId,
    });
    transaction.set(admin.doc(`customerOrderingAuditEvents/${changeId}`), {
      eventType: "control_change",
      controlSchemaVersion: 1,
      previousState,
      newState: enabled ? "enabled" : "disabled",
      actorUid,
      reason,
      occurredAt: timestamp,
      changeId,
    });
  });
}

function item(product: PublicCustomerProduct, id: string): CartItem {
  const selectedOptionIds =
    product.optionMode === "granola" ? [product.granolaOptions[0]] : [];
  const selectedOptions = customerOptionLabels(
    customerPublicProductToProduct(product),
    selectedOptionIds,
  );
  return {
    id,
    productId: product.id,
    productName: product.name,
    basePrice: product.storefrontPrice,
    selectedOptions,
    selectedOptionIds,
    quantity: 1,
    unitPrice: product.storefrontPrice,
    selectedChannel: "หน้าร้าน",
    priceBreakdown: {
      basePrice: product.storefrontPrice,
      premiumIncludedSurcharge: 0,
      extraToppingCharges: 0,
      unitPrice: product.storefrontPrice,
    },
    lineTotal: product.storefrontPrice,
    toppingPackaging: "included",
    toppingPackagingLabel: "ใส่ท็อปปิ้งเลย",
    packagingSurchargePerUnit: 0,
    packagingSurchargeTotal: 0,
  };
}

async function submit(
  firestore: Firestore,
  ownerUid: string,
  id: string,
  product: PublicCustomerProduct,
  products: ReturnType<typeof customerPublicProductToProduct>[],
  availability: ToppingAvailability,
) {
  const value = createCustomerRequest(
    id,
    ownerUid,
    [item(product, `${id}-line`)],
    products,
    availability,
    { customerName: marker, customerNote: "WP4 isolated UAT" },
  );
  const parts = splitCustomerRequestForWrite(value);
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, "customerOrderRequests", id), {
    ...toFirestoreData(parts.parent),
    submittedAt: serverTimestamp(),
  });
  parts.itemDocuments.forEach((entry) =>
    batch.set(
      doc(firestore, "customerOrderRequests", id, "items", entry.id),
      toFirestoreData(entry.value),
    ),
  );
  parts.groups.forEach((entry) =>
    batch.set(
      doc(firestore, "customerOrderRequests", id, "itemGroups", entry.id),
      toFirestoreData(entry.value),
    ),
  );
  await batch.commit();
  requestIds.push(id);
  return parts;
}

async function removeRequest(id: string) {
  const parent = await admin.doc(`customerOrderRequests/${id}`).get();
  if (!parent.exists) return;
  const data = parent.data() ?? {};
  const batch = admin.batch();
  for (const itemId of (data.itemIds as string[] | undefined) ?? [])
    batch.delete(admin.doc(`customerOrderRequests/${id}/items/${itemId}`));
  for (const groupId of (data.itemGroupIds as string[] | undefined) ?? [])
    batch.delete(
      admin.doc(`customerOrderRequests/${id}/itemGroups/${groupId}`),
    );
  batch.delete(parent.ref);
  await batch.commit();
}

try {
  const ordinary = await emailIdentity("ordinary");
  const capable = await emailIdentity("capable");
  const unauthorized = await emailIdentity("unauthorized");
  const customer = await anonymousIdentity("customer");
  const other = await anonymousIdentity("other");
  await authorize(ordinary.user, false);
  await authorize(capable.user, true);

  const [menu, availabilityRow, projectionControl, requestPolicy] =
    await Promise.all([
      getDocs(query(collection(customer.firestore, "publicMenu"), limit(100))),
      getDoc(doc(customer.firestore, "publicSettings", "toppingAvailability")),
      getDoc(doc(capable.firestore, "publicProjectionControl", "current")),
      getDoc(
        doc(customer.firestore, "publicSettings", "customerRequestPolicy"),
      ),
    ]);
  assert(menu.size > 0, "Public Projection V2 menu is empty");
  assert(
    projectionControl.data()?.schemaVersion === 2,
    "Projection control is not V2",
  );
  assert(requestPolicy.data()?.schemaVersion === 2, "Request policy is not V2");
  assert(
    projectionControl.data()?.fingerprint === requestPolicy.data()?.fingerprint,
    "Projection and request-policy fingerprints differ",
  );
  const publicProducts = menu.docs.map(
    (entry) => entry.data() as PublicCustomerProduct,
  );
  const selected = publicProducts.find(
    (entry) => entry.active && entry.optionMode !== "toppings",
  );
  assert(selected, "No simple active UAT product is available");
  const products = publicProducts.map(customerPublicProductToProduct);
  const availability =
    (availabilityRow.data()?.availability as ToppingAvailability | undefined) ??
    {};

  await expectDenied(() =>
    getDocs(query(collection(unauthorized.firestore, "orders"), limit(1))),
  );
  await expectDenied(() =>
    updateDoc(doc(ordinary.firestore, "users", ordinary.user.uid), {
      canManageCustomerOrdering: true,
    }),
  );

  const baseline = await admin.doc("settings/customerOrdering").get();
  if (
    !baseline.exists ||
    baseline.data()?.schemaVersion !== 1 ||
    typeof baseline.data()?.enabled !== "boolean"
  )
    await adminControl(false, "Repair WP4 UAT baseline before rehearsal");
  if ((await admin.doc("settings/customerOrdering").get()).data()?.enabled)
    await changeCustomerOrderingControl(ordinary.firestore, {
      enabled: false,
      message: "ปิดชั่วคราวสำหรับ WP4 UAT",
      reason: "เตรียมทดสอบ WP4",
      actorUid: ordinary.user.uid,
      canManageCustomerOrdering: false,
    });

  await changeCustomerOrderingControl(capable.firestore, {
    enabled: true,
    message: "",
    reason: "เริ่มทดสอบ WP4",
    actorUid: capable.user.uid,
    canManageCustomerOrdering: true,
  });
  await changeCustomerOrderingControl(ordinary.firestore, {
    enabled: false,
    message: "ปิดฉุกเฉินระหว่าง WP4 UAT",
    reason: "ซ้อมปิดฉุกเฉิน",
    actorUid: ordinary.user.uid,
    canManageCustomerOrdering: false,
  });
  await expectDenied(() =>
    changeCustomerOrderingControl(ordinary.firestore, {
      enabled: true,
      message: "",
      reason: "ต้องถูกปฏิเสธ",
      actorUid: ordinary.user.uid,
      canManageCustomerOrdering: true,
    }),
  );
  await changeCustomerOrderingControl(capable.firestore, {
    enabled: true,
    message: "",
    reason: "ผ่านการทบทวนและเปิดรับอีกครั้ง",
    actorUid: capable.user.uid,
    canManageCustomerOrdering: true,
  });

  const statusRequestId = `${marker}-status`;
  const parts = await submit(
    customer.firestore,
    customer.user.uid,
    statusRequestId,
    selected,
    products,
    availability,
  );
  await getDoc(
    doc(
      customer.firestore,
      "customerOrderRequests",
      statusRequestId,
      "items",
      "00",
    ),
  );
  await expectDenied(() =>
    getDocs(
      query(
        collection(
          customer.firestore,
          "customerOrderRequests",
          statusRequestId,
          "items",
        ),
        limit(12),
      ),
    ),
  );
  await expectDenied(() =>
    getDoc(
      doc(
        other.firestore,
        "customerOrderRequests",
        statusRequestId,
        "items",
        "00",
      ),
    ),
  );
  assert(parts.itemDocuments.length === 1, "Unexpected normalized item count");

  await admin.doc("settings/customerOrdering").delete();
  await expectDenied(() =>
    submit(
      customer.firestore,
      customer.user.uid,
      `${marker}-missing-control`,
      selected,
      products,
      availability,
    ),
  );
  assert(
    (
      await getDoc(
        doc(customer.firestore, "customerOrderRequests", statusRequestId),
      )
    ).exists(),
    "Owned status became inaccessible while control was missing",
  );
  await rejectCustomerRequestTransaction(
    ordinary.firestore,
    statusRequestId,
    "WP4 missing-control processing rehearsal",
  );

  await admin.doc("settings/customerOrdering").set({
    schemaVersion: 1,
    enabled: true,
  });
  await expectDenied(() =>
    submit(
      customer.firestore,
      customer.user.uid,
      `${marker}-malformed-control`,
      selected,
      products,
      availability,
    ),
  );
  await adminControl(false, "Restore valid control after fail-closed probes");
  await changeCustomerOrderingControl(capable.firestore, {
    enabled: true,
    message: "",
    reason: "WP4 automated UAT passed; open for reduced Human UAT",
    actorUid: capable.user.uid,
    canManageCustomerOrdering: true,
  });

  result = {
    status: "passed",
    projectId,
    marker,
    projectionSchemaVersion: 2,
    projectionFingerprint: requestPolicy.data()?.fingerprint,
    ordinaryDisable: "passed",
    ordinaryReEnable: "denied",
    capableReEnable: "passed",
    capabilitySelfGrant: "denied",
    missingControl:
      "fail-closed-intake-status-readable-staff-processing-available",
    malformedControl: "fail-closed",
    normalizedOwnership: "exact-get-only-cross-owner-denied",
    finalRuntimeControl: "enabled-for-human-uat",
  };
} catch (cause) {
  validationFailure = cause;
} finally {
  if (validationFailure)
    await adminControl(false, "WP4 automated UAT failed; fail closed").catch(
      (cause) => cleanupFailures.push(cause),
    );
  for (const id of requestIds)
    await removeRequest(id).catch((cause) => cleanupFailures.push(cause));
  for (const path of authorizationPaths)
    await admin
      .doc(path)
      .delete()
      .catch((cause) => cleanupFailures.push(cause));
  for (const user of users)
    await deleteUser(user).catch((cause) => cleanupFailures.push(cause));
  for (const value of apps)
    await deleteApp(value).catch((cause) => cleanupFailures.push(cause));
}

if (validationFailure) throw validationFailure;
try {
  if (cleanupFailures.length)
    throw new Error(
      `WP4 UAT cleanup failed for ${cleanupFailures.length} temporary resources`,
    );
  for (const id of requestIds) {
    assert(
      !(await admin.doc(`customerOrderRequests/${id}`).get()).exists,
      `Temporary request ${id} remains after cleanup`,
    );
    assert(
      (await admin.collection(`customerOrderRequests/${id}/items`).get()).empty,
      `Temporary request ${id} has orphaned item documents`,
    );
    assert(
      (await admin.collection(`customerOrderRequests/${id}/itemGroups`).get())
        .empty,
      `Temporary request ${id} has orphaned summary documents`,
    );
  }
  for (const path of authorizationPaths)
    assert(
      !(await admin.doc(path).get()).exists,
      `${path} remains after cleanup`,
    );
} catch (cause) {
  await adminControl(false, "WP4 cleanup verification failed; fail closed");
  throw cause;
}
if (result)
  result.cleanup =
    "temporary requests, children, identities, and authorization removed";
console.log(JSON.stringify(result));
