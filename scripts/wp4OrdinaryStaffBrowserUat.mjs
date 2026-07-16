import { randomUUID } from "node:crypto";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { deleteApp, initializeApp as initializeClientApp } from "firebase/app";
import {
  getAuth as getClientAuth,
  signInWithCustomToken,
  signOut,
} from "firebase/auth";
import {
  doc,
  getFirestore as getClientFirestore,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { chromium } from "playwright";

const expectedProjectId = "greek-yogert-customer-uat-2026";
const expectedCapableEmail = "greekmore.uat@gmail.com";
const expectedOrdinaryEmail = "greekmore.staff.uat@gmail.com";
const projectId = process.env.CUSTOMER_UAT_FIREBASE_PROJECT_ID;
const apiKey = process.env.CUSTOMER_UAT_FIREBASE_API_KEY;
const capableEmail = process.env.CUSTOMER_UAT_MANAGER_EMAIL
  ?.trim()
  .toLowerCase();
const ordinaryEmail = process.env.CUSTOMER_UAT_ORDINARY_STAFF_EMAIL
  ?.trim()
  .toLowerCase();
const ordinaryPassword = process.env.CUSTOMER_UAT_ORDINARY_STAFF_PASSWORD;
const baseUrl = "https://greek-yogert-customer-uat-2026.web.app";

if (projectId !== expectedProjectId)
  throw new Error("Ordinary Staff browser UAT requires the exact isolated project");
if (projectId === "greek-yogert")
  throw new Error("Production browser UAT is prohibited");
if (!apiKey) throw new Error("Missing isolated UAT Firebase API key");
if (capableEmail !== expectedCapableEmail)
  throw new Error("The exact capable UAT Staff account is required");
if (ordinaryEmail !== expectedOrdinaryEmail)
  throw new Error("The exact ordinary UAT Staff account is required");
if (
  typeof ordinaryPassword !== "string" ||
  ordinaryPassword.length < 8 ||
  ordinaryPassword.length > 128
)
  throw new Error("The ephemeral ordinary Staff password is unavailable");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const adminApp = initializeApp({ credential: applicationDefault(), projectId });
const adminAuth = getAdminAuth(adminApp);
const adminFirestore = getAdminFirestore(adminApp);
const [capableAccount, ordinaryAccount] = await Promise.all([
  adminAuth.getUserByEmail(capableEmail),
  adminAuth.getUserByEmail(ordinaryEmail),
]);
const [capableAuthorization, ordinaryAuthorization] = await Promise.all([
  adminFirestore.doc(`users/${capableAccount.uid}`).get(),
  adminFirestore.doc(`users/${ordinaryAccount.uid}`).get(),
]);
const capableData = capableAuthorization.data();
const ordinaryData = ordinaryAuthorization.data();
assert(
  !capableAccount.disabled &&
    capableData?.role === "staff" &&
    capableData.active === true &&
    capableData.canManageCustomerOrdering === true,
  "The capable UAT Staff boundary is unavailable",
);
assert(
  !ordinaryAccount.disabled &&
    ordinaryData?.role === "staff" &&
    ordinaryData.active === true &&
    ordinaryData.canManageCustomerOrdering !== true,
  "The ordinary UAT Staff boundary is unavailable",
);

const originalPrivate = await adminFirestore.doc("settings/customerOrdering").get();
const originalPublic = await adminFirestore
  .doc("publicSettings/customerOrdering")
  .get();
assert(
  originalPrivate.data()?.schemaVersion === 1 &&
    originalPrivate.data()?.enabled === true &&
    originalPublic.data()?.schemaVersion === 1 &&
    originalPublic.data()?.enabled === true &&
    originalPrivate.data()?.changeId === originalPublic.data()?.changeId,
  "The isolated UAT ordering control must start enabled and consistent",
);

let browser;
let capableClientApp;
let capableClientAuth;
let capableClientFirestore;
let controlRestored = false;
let validationFailure;
const cleanupFailures = [];
const temporaryAnonymousUids = new Set();

async function restoreAsCapableStaff() {
  const customToken = await adminAuth.createCustomToken(capableAccount.uid);
  capableClientApp = initializeClientApp(
    {
      apiKey,
      authDomain: `${projectId}.firebaseapp.com`,
      projectId,
    },
    `wp4-capable-restore-${Date.now()}`,
  );
  capableClientAuth = getClientAuth(capableClientApp);
  capableClientFirestore = getClientFirestore(capableClientApp);
  await signInWithCustomToken(capableClientAuth, customToken);
  const changeId = randomUUID();
  const reason = "WP4 ordinary Staff reduced browser UAT completed";
  await runTransaction(capableClientFirestore, async (transaction) => {
    const privateRef = doc(
      capableClientFirestore,
      "settings",
      "customerOrdering",
    );
    const publicRef = doc(
      capableClientFirestore,
      "publicSettings",
      "customerOrdering",
    );
    const auditRef = doc(
      capableClientFirestore,
      "customerOrderingAuditEvents",
      changeId,
    );
    const previous = await transaction.get(privateRef);
    assert(
      previous.data()?.schemaVersion === 1 && previous.data()?.enabled === false,
      "Capable Staff restore requires a verified disabled control",
    );
    const timestamp = serverTimestamp();
    transaction.set(privateRef, {
      schemaVersion: 1,
      enabled: true,
      message: "",
      reason,
      updatedAt: timestamp,
      updatedBy: capableAccount.uid,
      changeId,
      disabledAt: null,
    });
    transaction.set(publicRef, {
      schemaVersion: 1,
      enabled: true,
      message: "",
      updatedAt: timestamp,
      changeId,
    });
    transaction.set(auditRef, {
      eventType: "control_change",
      controlSchemaVersion: 1,
      previousState: "disabled",
      newState: "enabled",
      actorUid: capableAccount.uid,
      reason,
      occurredAt: timestamp,
      changeId,
    });
  });
  controlRestored = true;
}

try {
  browser = await chromium.launch({ headless: true });
  const staffContext = await browser.newContext({
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
    viewport: { width: 1280, height: 900 },
  });
  const staffPage = await staffContext.newPage();
  await staffPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await staffPage.locator('input[type="email"]').fill(ordinaryEmail);
  await staffPage.locator('input[type="password"]').fill(ordinaryPassword);
  await staffPage.locator("form button.primary").click();
  await staffPage.locator("button.logout").waitFor();
  await staffPage.goto(`${baseUrl}/customer-requests`, {
    waitUntil: "domcontentloaded",
  });
  const panel = staffPage.locator(".customer-ordering-operations");
  await panel.waitFor();
  await panel
    .locator(".operations-capability")
    .getByText("ปิดรับคำสั่งซื้อได้ แต่ไม่มีสิทธิ์เปิดกลับ", { exact: true })
    .waitFor();

  const reason = `WP4 ordinary Staff emergency disable ${Date.now()}`;
  const message = "ปิดรับคำสั่งซื้อใหม่ชั่วคราวระหว่างการทดสอบ UAT";
  const textInputs = panel.locator(
    '.operations-action-form input:not([type="checkbox"])',
  );
  await textInputs.nth(0).fill(reason);
  await textInputs.nth(1).fill(message);
  await panel.locator("button.danger").click();

  let disabledPrivate;
  let disabledPublic;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    [disabledPrivate, disabledPublic] = await Promise.all([
      adminFirestore.doc("settings/customerOrdering").get(),
      adminFirestore.doc("publicSettings/customerOrdering").get(),
    ]);
    if (
      disabledPrivate.data()?.enabled === false &&
      disabledPublic.data()?.enabled === false
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const disabledData = disabledPrivate.data();
  const disabledPublicData = disabledPublic.data();
  assert(disabledData?.enabled === false, "Ordinary Staff disable did not apply");
  assert(
    disabledData.updatedBy === ordinaryAccount.uid &&
      disabledData.reason === reason &&
      disabledData.changeId === disabledPublicData?.changeId,
    "Ordinary Staff disable audit boundary is inconsistent",
  );
  const disableAudit = await adminFirestore
    .doc(`customerOrderingAuditEvents/${disabledData.changeId}`)
    .get();
  assert(
    disableAudit.data()?.previousState === "enabled" &&
      disableAudit.data()?.newState === "disabled" &&
      disableAudit.data()?.actorUid === ordinaryAccount.uid &&
      disableAudit.data()?.reason === reason &&
      disableAudit.data()?.controlSchemaVersion === 1 &&
      disableAudit.data()?.occurredAt,
    "Ordinary Staff disable audit evidence is incomplete",
  );

  await staffPage.reload({ waitUntil: "domcontentloaded" });
  const disabledPanel = staffPage.locator(".customer-ordering-operations");
  await disabledPanel.locator(".operations-state.disabled").waitFor();
  const enableButton = disabledPanel.locator("button.primary");
  await enableButton.waitFor();
  await disabledPanel
    .locator('.operations-action-form input:not([type="checkbox"])')
    .first()
    .fill("Ordinary Staff must not restore Customer ordering");
  await disabledPanel.locator('input[type="checkbox"]').first().check();
  assert(
    !(await enableButton.isEnabled()),
    "Ordinary Staff was offered an enabled re-enable action",
  );
  await enableButton.evaluate((button) => button.click());
  await new Promise((resolve) => setTimeout(resolve, 750));
  assert(
    (await adminFirestore.doc("settings/customerOrdering").get()).data()
      ?.enabled === false,
    "Ordinary Staff changed the disabled control through the UI",
  );

  const customerContext = await browser.newContext({
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
    viewport: { width: 390, height: 844 },
  });
  const customerPage = await customerContext.newPage();
  customerPage.on("response", async (response) => {
    if (
      response.ok() &&
      response.url().includes("identitytoolkit.googleapis.com") &&
      response.url().includes("accounts:signUp")
    ) {
      const body = await response.json().catch(() => null);
      if (body?.localId) temporaryAnonymousUids.add(body.localId);
    }
  });
  await customerPage.goto(`${baseUrl}/order`, {
    waitUntil: "domcontentloaded",
  });
  await customerPage
    .getByText("ปิดรับคำสั่งซื้อใหม่ชั่วคราว", { exact: true })
    .waitFor();
  await customerPage.locator(".product-grid button").first().waitFor();
  assert(
    (await customerPage.locator(".product-grid button:enabled").count()) === 0,
    "Customer intake remained actionable while disabled",
  );

  await restoreAsCapableStaff();
  await customerPage.reload({ waitUntil: "domcontentloaded" });
  await customerPage.getByRole("heading", { name: "สั่ง Greek & More" }).waitFor();
  await customerPage.waitForFunction(
    () =>
      ![...document.querySelectorAll('[role="status"]')].some((entry) =>
        entry.textContent?.includes("ปิดรับคำสั่งซื้อใหม่ชั่วคราว"),
      ),
  );
  assert(
    (await customerPage.locator(".product-grid button:enabled").count()) > 0,
    "Customer intake did not resume after the capable Staff restore",
  );

  const [finalPrivate, finalPublic, capableAuthorizationAfter, ordinaryAuthorizationAfter] =
    await Promise.all([
      adminFirestore.doc("settings/customerOrdering").get(),
      adminFirestore.doc("publicSettings/customerOrdering").get(),
      adminFirestore.doc(`users/${capableAccount.uid}`).get(),
      adminFirestore.doc(`users/${ordinaryAccount.uid}`).get(),
    ]);
  assert(
    finalPrivate.data()?.enabled === true &&
      finalPublic.data()?.enabled === true &&
      finalPrivate.data()?.changeId === finalPublic.data()?.changeId,
    "The capable UAT Staff restore did not finish consistently",
  );
  assert(
    capableAuthorizationAfter.data()?.canManageCustomerOrdering === true &&
      ordinaryAuthorizationAfter.data()?.canManageCustomerOrdering !== true,
    "The capable/ordinary Staff configuration changed",
  );

  console.log(
    JSON.stringify({
      status: "passed",
      projectId,
      ordinaryExistingAccountLogin: "passed",
      ordinaryEmergencyDisable: "passed",
      ordinaryReenableUi: "blocked",
      disabledCustomerIntake: "passed",
      capableAuthorizedRestore: "passed",
      finalCustomerOrderingEnabled: true,
      capableOrdinaryConfigurationPreserved: true,
      productionTouched: false,
      uidExposed: false,
      passwordExposed: false,
    }),
  );
} catch (cause) {
  validationFailure = cause;
} finally {
  if (!controlRestored) {
    const current = await adminFirestore
      .doc("settings/customerOrdering")
      .get()
      .catch((cause) => {
        cleanupFailures.push(cause);
        return null;
      });
    if (current?.data()?.enabled === false)
      await restoreAsCapableStaff().catch((cause) => cleanupFailures.push(cause));
  }
  if (capableClientAuth)
    await signOut(capableClientAuth).catch((cause) => cleanupFailures.push(cause));
  if (capableClientApp)
    await deleteApp(capableClientApp).catch((cause) => cleanupFailures.push(cause));
  if (browser)
    await browser.close().catch((cause) => cleanupFailures.push(cause));
  for (const uid of temporaryAnonymousUids)
    await adminAuth.deleteUser(uid).catch((cause) => cleanupFailures.push(cause));
}

if (cleanupFailures.length)
  throw new Error(
    `Ordinary Staff browser UAT cleanup failed for ${cleanupFailures.length} resources`,
    { cause: validationFailure },
  );
if (validationFailure) throw validationFailure;
