import { randomBytes } from "node:crypto";
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
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import {
  createCustomerRequest,
  customerPublicProductToProduct,
  waitingForShop,
} from "../src/customerOrder";
import {
  confirmCustomerRequestTransaction,
  rejectCustomerRequestTransaction,
} from "../src/customerRequestActions";
import { toFirestoreData } from "../src/firestoreData";
import {
  projectionFingerprint,
  publicProjectionSchemaVersion,
} from "../src/publicProjection";
import type {
  CartItem,
  CustomerOrderRequest,
  PublicCustomerProduct,
  ShopOrder,
  ToppingAvailability,
} from "../src/types";

const projectId = "greek-yogert-customer-uat-2026";
const apiKey = process.env.CUSTOMER_UAT_FIREBASE_API_KEY;
const adminAccessToken = process.env.CUSTOMER_UAT_ADMIN_ACCESS_TOKEN;
if (!apiKey) throw new Error("Missing CUSTOMER_UAT_FIREBASE_API_KEY");
if (!adminAccessToken)
  throw new Error("Missing CUSTOMER_UAT_ADMIN_ACCESS_TOKEN");

const marker = `WP3-AUTO-${Date.now()}`;
const approvedPublicProductFields = new Set([
  "id",
  "name",
  "emoji",
  "description",
  "active",
  "storefrontPrice",
  "optionMode",
  "includedToppings",
  "granolaOptions",
  "availableToppingIds",
  "premiumToppingIds",
  "premiumIncludedSurcharge",
  "extraNormalPrice",
  "extraPremiumPrice",
  "supportsSeparatedToppingPackaging",
]);
const forbiddenPublicProductFields = [
  "price",
  "channelPrices",
  "channelRules",
  "paymentMethod",
  "authorization",
  "staffUid",
  "internal",
];

const apps: FirebaseApp[] = [];
const users: User[] = [];
const authorizationPaths: string[] = [];
let validationResult: Record<string, unknown> | undefined;
let validationFailure: unknown;
let removedIdentities = 0;
let removedAuthorizationDocuments = 0;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function app(name: string): FirebaseApp {
  const created = initializeApp(
    {
      apiKey,
      authDomain: `${projectId}.firebaseapp.com`,
      projectId,
    },
    name,
  );
  apps.push(created);
  return created;
}

async function adminDocument(
  path: string,
  method: "GET" | "PATCH" | "DELETE",
  fields?: Record<string, unknown>,
): Promise<Record<string, unknown> | undefined> {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${adminAccessToken}`,
        ...(fields ? { "Content-Type": "application/json" } : {}),
      },
      ...(fields ? { body: JSON.stringify({ fields }) } : {}),
    },
  );
  if (method === "DELETE" && response.status === 404) return undefined;
  if (!response.ok)
    throw new Error(`UAT admin ${method} ${path} failed: ${response.status}`);
  if (method === "DELETE") return undefined;
  return (await response.json()) as Record<string, unknown>;
}

async function setAuthorization(
  uid: string,
  role: string,
  active: boolean | string,
): Promise<void> {
  const path = `users/${uid}`;
  await adminDocument(path, "PATCH", {
    role: { stringValue: role },
    active:
      typeof active === "boolean"
        ? { booleanValue: active }
        : { stringValue: active },
  });
  if (!authorizationPaths.includes(path)) authorizationPaths.push(path);
}

async function expectDenied(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch (cause) {
    const code = (cause as { code?: string }).code ?? "";
    if (code.includes("permission-denied")) return;
    throw cause;
  }
  throw new Error("Expected the UAT security rules to deny the operation");
}

async function createEmailIdentity(label: string): Promise<{
  user: User;
  firestore: Firestore;
}> {
  const createdApp = app(`${label}-${marker}`);
  const credential = await createUserWithEmailAndPassword(
    getAuth(createdApp),
    `${marker.toLowerCase()}-${label}@example.com`,
    `Wp3!${randomBytes(18).toString("base64url")}`,
  );
  users.push(credential.user);
  return { user: credential.user, firestore: getFirestore(createdApp) };
}

async function createAnonymousIdentity(label: string): Promise<{
  user: User;
  firestore: Firestore;
}> {
  const createdApp = app(`${label}-${marker}`);
  const credential = await signInAnonymously(getAuth(createdApp));
  users.push(credential.user);
  return { user: credential.user, firestore: getFirestore(createdApp) };
}

function cartItem(product: PublicCustomerProduct, id: string): CartItem {
  const selectedOptionIds =
    product.optionMode === "granola" ? [product.granolaOptions[0]] : [];
  return {
    id,
    productId: product.id,
    productName: product.name,
    basePrice: product.storefrontPrice,
    selectedOptions: [...selectedOptionIds],
    selectedOptionIds,
    quantity: 1,
    unitPrice: product.storefrontPrice,
    lineTotal: product.storefrontPrice,
  };
}

async function request(
  firestore: Firestore,
  ownerUid: string,
  id: string,
  product: PublicCustomerProduct,
  products: ReturnType<typeof customerPublicProductToProduct>[],
  availability: ToppingAvailability,
): Promise<CustomerOrderRequest> {
  const created = createCustomerRequest(
    id,
    ownerUid,
    [cartItem(product, `${id}-line-1`)],
    products,
    availability,
    { customerName: marker, customerNote: "isolated UAT automation" },
  );
  await setDoc(
    doc(firestore, "customerOrderRequests", id),
    toFirestoreData(created),
  );
  return created;
}

try {
  const staff = await createEmailIdentity("staff");
  await setAuthorization(staff.user.uid, "staff", true);
  await staff.user.getIdToken(true);

  const unauthorized = await createEmailIdentity("unauthorized");
  await expectDenied(() =>
    getDocs(collection(unauthorized.firestore, "products")),
  );
  await expectDenied(() =>
    getDocs(collection(unauthorized.firestore, "publicMenu")),
  );
  await setAuthorization(unauthorized.user.uid, "staff", false);
  await expectDenied(() =>
    getDocs(collection(unauthorized.firestore, "customerOrderRequests")),
  );
  await setAuthorization(unauthorized.user.uid, "staff", "true");
  await expectDenied(() =>
    getDocs(collection(unauthorized.firestore, "customerOrderRequests")),
  );

  const customer = await createAnonymousIdentity("customer");
  const otherCustomer = await createAnonymousIdentity("other-customer");
  const publicMenuSnapshot = await getDocs(
    collection(customer.firestore, "publicMenu"),
  );
  const publicProducts = publicMenuSnapshot.docs.map(
    (snapshot) => snapshot.data() as PublicCustomerProduct,
  );
  assert(publicProducts.length === 6, "Expected all 6 projected UAT products");
  publicProducts.forEach((product) => {
    Object.keys(product).forEach((field) =>
      assert(
        approvedPublicProductFields.has(field),
        `Unexpected public product field: ${field}`,
      ),
    );
    forbiddenPublicProductFields.forEach((field) =>
      assert(!(field in product), `Forbidden public product field: ${field}`),
    );
  });
  const publicAvailabilitySnapshot = await getDoc(
    doc(customer.firestore, "publicSettings", "toppingAvailability"),
  );
  assert(publicAvailabilitySnapshot.exists(), "Public availability is missing");
  const availability = (publicAvailabilitySnapshot.data().availability ??
    {}) as ToppingAvailability;
  await expectDenied(() => getDocs(collection(customer.firestore, "products")));
  await expectDenied(() =>
    getDoc(doc(customer.firestore, "settings", "toppingAvailability")),
  );
  await expectDenied(() => getDocs(collection(customer.firestore, "orders")));
  await expectDenied(() => getDocs(collection(customer.firestore, "users")));

  const menu = Object.fromEntries(
    publicProducts.map((product) => [product.id, product]),
  );
  const fingerprint = projectionFingerprint({
    schemaVersion: publicProjectionSchemaVersion,
    menu,
    availability,
  });
  const controlDocument = await adminDocument(
    "publicProjectionControl/current",
    "GET",
  );
  const appliedFingerprint = (
    controlDocument?.fields as {
      fingerprint?: { stringValue?: string };
    }
  )?.fingerprint?.stringValue;
  assert(
    fingerprint === appliedFingerprint,
    "Applied projection fingerprint does not match public content",
  );

  const products = publicProducts.map(customerPublicProductToProduct);
  const product = publicProducts.find(
    (entry) =>
      entry.active && entry.optionMode === "granola" && entry.granolaOptions[0],
  );
  assert(product, "No active projected granola product is available for UAT");

  const validRequestId = `${marker}-valid`;
  await request(
    customer.firestore,
    customer.user.uid,
    validRequestId,
    product,
    products,
    availability,
  );
  await confirmCustomerRequestTransaction(
    staff.firestore,
    validRequestId,
    "สด",
    staff.user.uid,
  );
  const confirmedSnapshot = await getDoc(
    doc(staff.firestore, "customerOrderRequests", validRequestId),
  );
  const confirmed = confirmedSnapshot.data() as CustomerOrderRequest;
  assert(
    confirmed.confirmedOrderId,
    "Valid request was not linked to an order",
  );
  assert(confirmed.queueNumber, "Valid request did not receive a queue");
  const orderSnapshot = await getDoc(
    doc(staff.firestore, "orders", confirmed.confirmedOrderId),
  );
  const order = orderSnapshot.data() as ShopOrder;
  assert(
    order.items[0].productName === product.name,
    "Order name is not canonical",
  );
  assert(
    order.items[0].unitPrice === product.storefrontPrice,
    "Order price is not canonical",
  );
  assert(order.paymentMethod === "สด", "Payment allocation changed");
  try {
    await confirmCustomerRequestTransaction(
      staff.firestore,
      validRequestId,
      "สด",
      staff.user.uid,
    );
    throw new Error("Duplicate confirmation unexpectedly succeeded");
  } catch (cause) {
    assert(
      cause instanceof Error && cause.message.includes("ดำเนินการแล้ว"),
      "Duplicate confirmation was not blocked safely",
    );
  }

  await getDoc(
    doc(customer.firestore, "customerOrderRequests", validRequestId),
  );
  await expectDenied(() =>
    getDoc(
      doc(otherCustomer.firestore, "customerOrderRequests", validRequestId),
    ),
  );
  await expectDenied(() =>
    updateDoc(
      doc(customer.firestore, "customerOrderRequests", validRequestId),
      { customerNote: "forbidden update" },
    ),
  );

  const orderCountAfterValid = (
    await getDocs(collection(staff.firestore, "orders"))
  ).size;
  const counterPath = order.businessDate;
  const counterAfterValid = (
    await getDoc(doc(staff.firestore, "counters", counterPath))
  ).data()?.lastSequence;
  const forgedRequestId = `${marker}-forged-unit-price`;
  const forged = createCustomerRequest(
    forgedRequestId,
    customer.user.uid,
    [cartItem(product, `${forgedRequestId}-line-1`)],
    products,
    availability,
    { customerName: marker, customerNote: "isolated UAT automation" },
  );
  forged.items[0].unitPrice = 1;
  await setDoc(
    doc(customer.firestore, "customerOrderRequests", forgedRequestId),
    toFirestoreData(forged),
  );
  try {
    await confirmCustomerRequestTransaction(
      staff.firestore,
      forgedRequestId,
      "สด",
      staff.user.uid,
    );
    throw new Error("Forged request unexpectedly confirmed");
  } catch (cause) {
    assert(
      cause instanceof Error &&
        cause.message.includes("คำขอไม่ตรงกับเมนูปัจจุบัน"),
      "Staff did not receive the safe mismatch result",
    );
  }
  const forgedAfter = (
    await getDoc(doc(staff.firestore, "customerOrderRequests", forgedRequestId))
  ).data() as CustomerOrderRequest;
  assert(
    forgedAfter.status === waitingForShop,
    "Forged request did not remain pending",
  );
  assert(!forgedAfter.confirmedOrderId, "Forged request created an order link");
  assert(!forgedAfter.queueNumber, "Forged request received a queue");
  assert(
    (await getDocs(collection(staff.firestore, "orders"))).size ===
      orderCountAfterValid,
    "Forged request created an order",
  );
  assert(
    (await getDoc(doc(staff.firestore, "counters", counterPath))).data()
      ?.lastSequence === counterAfterValid,
    "Forged request changed the queue counter",
  );

  const rejectedRequestId = `${marker}-rejected`;
  await request(
    customer.firestore,
    customer.user.uid,
    rejectedRequestId,
    product,
    products,
    availability,
  );
  await rejectCustomerRequestTransaction(
    staff.firestore,
    rejectedRequestId,
    "WP3 automated UAT rejection",
  );
  const rejected = (
    await getDoc(
      doc(staff.firestore, "customerOrderRequests", rejectedRequestId),
    )
  ).data() as CustomerOrderRequest;
  assert(rejected.status === "ปฏิเสธ", "Staff rejection did not persist");
  assert(!rejected.confirmedOrderId, "Rejected request created an order link");
  assert(
    (await getDocs(collection(staff.firestore, "orders"))).size ===
      orderCountAfterValid,
    "Rejected request created an order",
  );

  validationResult = {
    status: "passed",
    projectId,
    marker,
    publicProducts: publicProducts.length,
    fingerprint,
    publicBoundary: "passed",
    validConfirmation: "passed",
    duplicateConfirmation: "blocked",
    forgedConfirmation: "blocked-without-writes",
    staffRejection: "passed-without-order",
    ownStatusRead: "passed",
    crossCustomerStatusRead: "denied",
    customerRequestUpdate: "denied",
    unauthorizedInactiveMalformedStaff: "denied",
  };
} catch (cause) {
  validationFailure = cause;
} finally {
  const authorizationCleanup = await Promise.allSettled(
    authorizationPaths.map((path) => adminDocument(path, "DELETE")),
  );
  const identityCleanup = await Promise.allSettled(
    users.map((user) => deleteUser(user)),
  );
  await Promise.allSettled(apps.map((firebaseApp) => deleteApp(firebaseApp)));
  removedAuthorizationDocuments = authorizationCleanup.filter(
    (entry) => entry.status === "fulfilled",
  ).length;
  removedIdentities = identityCleanup.filter(
    (entry) => entry.status === "fulfilled",
  ).length;
  const cleanupFailures = [...authorizationCleanup, ...identityCleanup].filter(
    (entry) => entry.status === "rejected",
  );
  if (cleanupFailures.length)
    throw new Error(
      `UAT validation cleanup failed for ${cleanupFailures.length} temporary identities or authorization documents`,
      { cause: validationFailure },
    );
}

if (validationFailure) throw validationFailure;
console.log(
  JSON.stringify({
    ...validationResult,
    temporaryIdentitiesRemoved: removedIdentities,
    temporaryAuthorizationDocumentsRemoved: removedAuthorizationDocuments,
  }),
);
