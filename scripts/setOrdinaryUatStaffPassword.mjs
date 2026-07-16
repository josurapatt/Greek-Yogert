import { isDeepStrictEqual } from "node:util";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const expectedProjectId = "greek-yogert-customer-uat-2026";
const expectedCapableEmail = "greekmore.uat@gmail.com";
const expectedOrdinaryEmail = "greekmore.staff.uat@gmail.com";
const projectId = process.env.CUSTOMER_UAT_FIREBASE_PROJECT_ID;
const capableEmail =
  process.env.CUSTOMER_UAT_MANAGER_EMAIL?.trim().toLowerCase();
const ordinaryEmail =
  process.env.CUSTOMER_UAT_ORDINARY_STAFF_EMAIL?.trim().toLowerCase();
const password = process.env.CUSTOMER_UAT_ORDINARY_STAFF_PASSWORD;

if (projectId !== expectedProjectId)
  throw new Error("Password update requires the exact isolated UAT project");
if (projectId === "greek-yogert")
  throw new Error("Production password updates are prohibited");
if (capableEmail !== expectedCapableEmail)
  throw new Error("The exact capable UAT Staff account is required");
if (ordinaryEmail !== expectedOrdinaryEmail)
  throw new Error("The exact ordinary UAT Staff account is required");
if (
  typeof password !== "string" ||
  password.length < 8 ||
  password.length > 128
)
  throw new Error("The hidden UAT password must contain 8 to 128 characters");

const app = initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth(app);
const firestore = getFirestore(app);

const [capableBefore, ordinaryBefore] = await Promise.all([
  auth.getUserByEmail(capableEmail),
  auth.getUserByEmail(ordinaryEmail),
]);
if (capableBefore.disabled || ordinaryBefore.disabled)
  throw new Error(
    "Both approved UAT Staff Authentication users must be active",
  );
if (
  capableBefore.email?.toLowerCase() !== capableEmail ||
  ordinaryBefore.email?.toLowerCase() !== ordinaryEmail
)
  throw new Error(
    "An approved UAT Authentication email does not match exactly",
  );

const [capableAuthorizationBefore, ordinaryAuthorizationBefore] =
  await Promise.all([
    firestore.doc(`users/${capableBefore.uid}`).get(),
    firestore.doc(`users/${ordinaryBefore.uid}`).get(),
  ]);
const capableDataBefore = capableAuthorizationBefore.data();
const ordinaryDataBefore = ordinaryAuthorizationBefore.data();
if (
  !capableAuthorizationBefore.exists ||
  capableDataBefore?.role !== "staff" ||
  capableDataBefore.active !== true ||
  capableDataBefore.canManageCustomerOrdering !== true
)
  throw new Error("The capable UAT Staff authorization is not configured");
if (
  !ordinaryAuthorizationBefore.exists ||
  ordinaryDataBefore?.role !== "staff" ||
  ordinaryDataBefore.active !== true ||
  ordinaryDataBefore.canManageCustomerOrdering === true
)
  throw new Error("The ordinary UAT Staff authorization is not configured");

const ordinaryAuthBoundaryBefore = {
  uid: ordinaryBefore.uid,
  email: ordinaryBefore.email,
  disabled: ordinaryBefore.disabled,
  tenantId: ordinaryBefore.tenantId ?? null,
  customClaims: ordinaryBefore.customClaims ?? {},
  providerData: ordinaryBefore.providerData.map((provider) => ({
    uid: provider.uid,
    email: provider.email ?? null,
    providerId: provider.providerId,
  })),
};
const capableAuthBoundaryBefore = {
  uid: capableBefore.uid,
  email: capableBefore.email,
  disabled: capableBefore.disabled,
  tenantId: capableBefore.tenantId ?? null,
  customClaims: capableBefore.customClaims ?? {},
  providerData: capableBefore.providerData.map((provider) => ({
    uid: provider.uid,
    email: provider.email ?? null,
    providerId: provider.providerId,
  })),
};

await auth.updateUser(ordinaryBefore.uid, { password });

const [
  capableAfter,
  ordinaryAfter,
  capableAuthorizationAfter,
  ordinaryAuthorizationAfter,
] = await Promise.all([
  auth.getUser(capableBefore.uid),
  auth.getUser(ordinaryBefore.uid),
  firestore.doc(`users/${capableBefore.uid}`).get(),
  firestore.doc(`users/${ordinaryBefore.uid}`).get(),
]);
const ordinaryAuthBoundaryAfter = {
  uid: ordinaryAfter.uid,
  email: ordinaryAfter.email,
  disabled: ordinaryAfter.disabled,
  tenantId: ordinaryAfter.tenantId ?? null,
  customClaims: ordinaryAfter.customClaims ?? {},
  providerData: ordinaryAfter.providerData.map((provider) => ({
    uid: provider.uid,
    email: provider.email ?? null,
    providerId: provider.providerId,
  })),
};
const capableAuthBoundaryAfter = {
  uid: capableAfter.uid,
  email: capableAfter.email,
  disabled: capableAfter.disabled,
  tenantId: capableAfter.tenantId ?? null,
  customClaims: capableAfter.customClaims ?? {},
  providerData: capableAfter.providerData.map((provider) => ({
    uid: provider.uid,
    email: provider.email ?? null,
    providerId: provider.providerId,
  })),
};

if (!isDeepStrictEqual(ordinaryAuthBoundaryAfter, ordinaryAuthBoundaryBefore))
  throw new Error("The ordinary UAT Authentication identity boundary changed");
if (!isDeepStrictEqual(capableAuthBoundaryAfter, capableAuthBoundaryBefore))
  throw new Error("The capable UAT Authentication identity changed");
if (
  !isDeepStrictEqual(
    ordinaryAuthorizationAfter.data(),
    ordinaryAuthorizationBefore.data(),
  ) ||
  !isDeepStrictEqual(
    capableAuthorizationAfter.data(),
    capableAuthorizationBefore.data(),
  )
)
  throw new Error("A UAT Staff authorization document changed");

console.log(
  JSON.stringify({
    status: "updated",
    projectId,
    existingUserUpdated: true,
    uidPreserved: true,
    emailPreserved: true,
    ordinaryAuthorizationPreserved: true,
    capableAuthorizationPreserved: true,
    productionTouched: false,
    uidExposed: false,
    passwordExposed: false,
  }),
);
