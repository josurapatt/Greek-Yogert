import { randomBytes } from "node:crypto";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { chromium } from "playwright";
import XLSX from "xlsx";

const projectId = process.env.CUSTOMER_UAT_FIREBASE_PROJECT_ID;
const apiKey = process.env.CUSTOMER_UAT_FIREBASE_API_KEY;
const baseUrl = "https://greek-yogert-customer-uat-2026.web.app";
if (projectId !== "greek-yogert-customer-uat-2026")
  throw new Error(
    "Customer browser UAT requires the exact isolated UAT project",
  );
if (!apiKey) throw new Error("Missing isolated UAT Firebase API key");
if (!getApps().length)
  initializeApp({ credential: applicationDefault(), projectId });
const firestore = getFirestore();

const marker = `WP4-AUTO-UI-${Date.now()}`;
const staffEmail = `${marker.toLowerCase()}@example.com`;
const staffPassword = `Wp3!${randomBytes(18).toString("base64url")}`;
const paymentRequired = "กรุณาเลือกวิธีการชำระเงินก่อนยืนยันคำสั่งซื้อ";
const mismatchMessage =
  "คำขอไม่ตรงกับเมนูหรือการตั้งค่าปัจจุบัน กรุณาให้ลูกค้าแก้ไขหรือสร้างคำขอใหม่";
const negativeRequestId = `${marker}-FORGED-PRODUCT-NAME`;
const humanUatMarker = "WP4-HUMAN-UAT-DUPLICATE";
const cleanupFailures = [];
let staffIdentity;
let customerIdentity;
const customerIdentities = new Map();
let browser;
let requestId;
let orderId;
let queueNumber;
let validationFailure;
let humanUatEvidence = null;
const paginationOrderIds = [];
const temporaryRequestIds = new Set();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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

async function createStaffIdentity() {
  const identity = await identityRequest("signUp", {
    email: staffEmail,
    password: staffPassword,
    returnSecureToken: true,
  });
  assert(
    identity.localId && identity.idToken,
    "Temporary Staff identity is incomplete",
  );
  await firestore.doc(`users/${identity.localId}`).set({
    role: "staff",
    active: true,
    canManageCustomerOrdering: true,
  });
  return identity;
}

async function deleteIdentity(identity) {
  if (!identity?.idToken) return;
  await identityRequest("delete", { idToken: identity.idToken });
}

async function deleteNormalizedRequest(id) {
  const parent = await firestore.doc(`customerOrderRequests/${id}`).get();
  if (!parent.exists) return;
  const value = parent.data() ?? {};
  const batch = firestore.batch();
  for (const itemId of value.itemIds ?? [])
    batch.delete(firestore.doc(`customerOrderRequests/${id}/items/${itemId}`));
  for (const groupId of value.itemGroupIds ?? [])
    batch.delete(
      firestore.doc(`customerOrderRequests/${id}/itemGroups/${groupId}`),
    );
  batch.delete(parent.ref);
  await batch.commit();
}

async function deleteTemporaryOperationalAudit(id) {
  const rows = await firestore
    .collection("customerOrderingAuditEvents")
    .where("requestId", "==", id)
    .get();
  if (rows.empty) return;
  const batch = firestore.batch();
  rows.docs.forEach((entry) => batch.delete(entry.ref));
  await batch.commit();
}

async function unique(locator, description) {
  await locator.waitFor({ state: "visible" });
  const count = await locator.count();
  assert(count === 1, `Expected one ${description}, found ${count}`);
  return locator;
}

async function invokeReactClick(locator, description, startAt = 0) {
  await locator.evaluate(
    async (button, input) => {
      if (input.startAt > Date.now())
        await new Promise((resolve) =>
          window.setTimeout(resolve, input.startAt - Date.now()),
        );
      const propsKey = Object.keys(button).find((key) =>
        key.startsWith("__reactProps$"),
      );
      if (!propsKey || typeof button[propsKey]?.onClick !== "function")
        throw new Error(`${input.description} handler is unavailable`);
      button[propsKey].onClick();
    },
    { description, startAt },
  );
}

async function convergeCustomerPageToStatus(page) {
  await page.waitForFunction(() => {
    if (window.location.pathname.includes("/order/status/")) return true;
    return [...document.querySelectorAll("a")].some((entry) =>
      entry.textContent?.includes("กลับไปดูสถานะคำขอเดิม"),
    );
  });
  if (!new URL(page.url()).pathname.includes("/order/status/"))
    await page.getByRole("link", { name: "กลับไปดูสถานะคำขอเดิม" }).click();
  await page.waitForURL(/\/order\/status\//);
}

function businessDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

async function counterSequence(date) {
  return (
    (await firestore.doc(`counters/${date}`).get()).data()?.lastSequence ?? 0
  );
}

function safeRequestState(value) {
  return {
    status: value.status,
    confirmedOrderId: value.confirmedOrderId ?? null,
    queueNumber: value.queueNumber ?? null,
    updatedAt: value.updatedAt,
  };
}

async function attachConsoleCapture(page, allowedErrors = []) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror:${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console:${message.text()}`);
  });
  return () =>
    errors.filter(
      (entry) => !allowedErrors.some((allowed) => entry.includes(allowed)),
    );
}

try {
  let humanRequests = await firestore
    .collection("customerOrderRequests")
    .where("customerName", "==", humanUatMarker)
    .get();
  if (humanRequests.empty)
    humanRequests = await firestore
      .collection("customerOrderRequests")
      .where("customerNote", "==", humanUatMarker)
      .get();
  if (!humanRequests.empty) {
    const humanRequest = humanRequests.docs[0];
    const data = humanRequest.data();
    const [items, groups] = await Promise.all([
      humanRequest.ref.collection("items").get(),
      humanRequest.ref.collection("itemGroups").get(),
    ]);
    humanUatEvidence = {
      requestId: humanRequest.id,
      status: data.status ?? null,
      ownerPresent: typeof data.ownerUid === "string",
      normalizedItemDocuments: items.size,
      normalizedSummaryDocuments: groups.size,
      statusUrl: `${baseUrl}/order/status/${humanRequest.id}`,
      preserved: true,
    };
  }
  staffIdentity = await createStaffIdentity();
  browser = await chromium.launch({ headless: true });

  const customerContext = await browser.newContext({
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
    viewport: { width: 390, height: 844 },
  });
  const customerPage = await customerContext.newPage();
  const secondCustomerPage = await customerContext.newPage();
  const customerErrors = await attachConsoleCapture(customerPage);
  const secondCustomerErrors = await attachConsoleCapture(secondCustomerPage);
  const captureCustomerIdentity = (page) =>
    page.on("response", async (response) => {
      if (
        response.url().includes("identitytoolkit.googleapis.com") &&
        response.url().includes("accounts:signUp") &&
        response.ok()
      ) {
        const value = await response.json();
        if (value.localId && value.idToken) {
          customerIdentities.set(value.localId, value);
          customerIdentity ??= value;
        }
      }
    });
  captureCustomerIdentity(customerPage);
  captureCustomerIdentity(secondCustomerPage);

  await Promise.all([
    customerPage.goto(`${baseUrl}/order`, { waitUntil: "domcontentloaded" }),
    secondCustomerPage.goto(`${baseUrl}/order`, {
      waitUntil: "domcontentloaded",
    }),
  ]);
  await Promise.all([
    customerPage
      .getByRole("button")
      .filter({ hasText: "Apple Ohlala" })
      .waitFor(),
    secondCustomerPage
      .getByRole("button")
      .filter({ hasText: "Apple Ohlala" })
      .waitFor(),
  ]);
  await (
    await unique(
      customerPage.getByRole("button").filter({ hasText: "Size S" }),
      "Size S Customer product",
    )
  ).click();
  await customerPage.getByText(/เมนูนี้เลือกได้สูงสุด 10 อย่าง/).waitFor();
  const toppingIncrease = customerPage
    .locator(".topping-row")
    .first()
    .locator("button")
    .last();
  for (let count = 0; count < 10; count += 1) await toppingIncrease.click();
  assert(
    (await customerPage.locator(".modal-card .validation").count()) === 0,
    "Exactly ten topping selections were treated as an error",
  );
  await toppingIncrease.click();
  await customerPage.getByText(/เลือกแล้ว 10 อย่าง.*สูงสุด 10 อย่าง/).waitFor();
  await customerPage
    .locator(".topping-row")
    .first()
    .locator("button")
    .first()
    .click();
  assert(
    (await customerPage
      .getByText(/เลือกแล้ว 10 อย่าง.*สูงสุด 10 อย่าง/)
      .count()) === 0,
    "Topping limit message did not clear after correction",
  );
  await customerPage.getByRole("button", { name: "ปิด" }).click();
  await (
    await unique(
      customerPage.getByRole("button").filter({ hasText: "Apple Ohlala" }),
      "Apple Ohlala Customer product",
    )
  ).click();
  const modalQuantityIncrease = customerPage
    .locator(".modal-card .quantity button")
    .last();
  for (let count = 1; count < 10; count += 1)
    await modalQuantityIncrease.click();
  assert(
    (await customerPage.locator(".modal-card .quantity b").textContent()) ===
      "10",
    "Quantity boundary ten was not accepted",
  );
  await modalQuantityIncrease.click();
  await customerPage.getByText(/สูงสุด 10 ถ้วยต่อรายการ/).waitFor();
  const modalQuantityDecrease = customerPage
    .locator(".modal-card .quantity button")
    .first();
  for (let count = 1; count < 10; count += 1)
    await modalQuantityDecrease.click();
  assert(
    (await customerPage.getByText(/สูงสุด 10 ถ้วยต่อรายการ/).count()) === 0,
    "Quantity limit message did not clear after correction",
  );
  await (
    await unique(
      customerPage.getByRole("button", { name: "ช็อกโกแลต", exact: true }),
      "granola flavor option",
    )
  ).click();
  await (
    await unique(
      customerPage.getByRole("button").filter({ hasText: "เพิ่มลงตะกร้า" }),
      "add-to-cart action",
    )
  ).click();
  for (const quantity of [10, 10, 9]) {
    await (
      await unique(
        customerPage.getByRole("button").filter({ hasText: "Plain Greek" }),
        "Plain Greek Customer product",
      )
    ).click();
    const increase = customerPage
      .locator(".modal-card .quantity button")
      .last();
    for (let count = 1; count < quantity; count += 1) await increase.click();
    await customerPage
      .locator(".modal-card .primary")
      .filter({ hasText: "เพิ่มลงตะกร้า" })
      .click();
  }
  assert(
    (await customerPage.locator(".customer-cart h2").textContent())?.includes(
      "30",
    ),
    "Total quantity boundary thirty was not accepted",
  );
  const firstCartLine = customerPage.locator(".customer-cart-line").first();
  await firstCartLine.locator(".customer-cart-quantity button").last().click();
  await firstCartLine
    .getByText(/สั่งได้สูงสุด 30 ถ้วย.*ติดต่อร้าน.*จำนวนมาก/)
    .waitFor();
  for (let count = 0; count < 3; count += 1)
    await customerPage
      .locator(".customer-cart-line")
      .last()
      .getByRole("button", { name: /ลบ/ })
      .click();
  await firstCartLine.locator(".customer-cart-quantity button").last().click();
  assert(
    (await firstCartLine.getByText(/สั่งได้สูงสุด 30 ถ้วย/).count()) === 0,
    "Total quantity limit feedback did not clear after correction",
  );
  await firstCartLine.locator(".customer-cart-quantity button").first().click();
  const nameField = customerPage.getByPlaceholder("ชื่อเล่น (ไม่บังคับ)");
  const noteField = customerPage.getByPlaceholder(
    "หมายเหตุถึงร้าน (ไม่บังคับ)",
  );
  await nameField.fill("ก".repeat(41));
  await noteField.fill("ข".repeat(201));
  await customerPage.getByText("ชื่อเล่น 41/40 ตัวอักษร").waitFor();
  await customerPage.getByText("หมายเหตุ 201/200 ตัวอักษร").waitFor();
  await customerPage.getByText(/ชื่อเล่นยาวเกิน 40/).waitFor();
  await customerPage.getByText(/หมายเหตุยาวเกิน 200/).waitFor();
  await nameField.fill("ก".repeat(40));
  await noteField.fill("ข".repeat(200));
  assert(
    (await customerPage.getByText(/ยาวเกิน/).count()) === 0,
    "Character limit feedback did not clear at the exact boundary",
  );
  await nameField.fill(marker);
  await noteField.fill("isolated browser UAT");

  await (
    await unique(
      secondCustomerPage
        .getByRole("button")
        .filter({ hasText: "Apple Ohlala" }),
      "second-tab Apple Ohlala Customer product",
    )
  ).click();
  await (
    await unique(
      secondCustomerPage.getByRole("button", {
        name: "ช็อกโกแลต",
        exact: true,
      }),
      "second-tab granola flavor option",
    )
  ).click();
  await (
    await unique(
      secondCustomerPage
        .getByRole("button")
        .filter({ hasText: "เพิ่มลงตะกร้า" }),
      "second-tab add-to-cart action",
    )
  ).click();
  await secondCustomerPage
    .getByPlaceholder("ชื่อเล่น (ไม่บังคับ)")
    .fill(marker);
  await secondCustomerPage
    .getByPlaceholder("หมายเหตุถึงร้าน (ไม่บังคับ)")
    .fill("isolated browser UAT");

  const firstSubmit = await unique(
    customerPage.getByRole("button", { name: "ส่งคำขอให้ร้านยืนยัน" }),
    "first-tab Customer submit action",
  );
  const secondSubmit = await unique(
    secondCustomerPage.getByRole("button", {
      name: "ส่งคำขอให้ร้านยืนยัน",
    }),
    "second-tab Customer submit action",
  );
  assert(
    (await firstSubmit.isEnabled()) && (await secondSubmit.isEnabled()),
    "Both Customer tabs were not ready before the shared-boundary race",
  );
  const synchronizedClickAt = Date.now() + 750;
  await Promise.all([
    invokeReactClick(
      firstSubmit,
      "first-tab Customer submit",
      synchronizedClickAt,
    ),
    invokeReactClick(
      secondSubmit,
      "second-tab Customer submit",
      synchronizedClickAt,
    ),
  ]);
  try {
    await Promise.all([
      convergeCustomerPageToStatus(customerPage),
      convergeCustomerPageToStatus(secondCustomerPage),
    ]);
  } catch (cause) {
    const [persisted, privateControl, publicControl, policy, projection] =
      await Promise.all([
        firestore
          .collection("customerOrderRequests")
          .where("customerName", "==", marker)
          .get(),
        firestore.doc("settings/customerOrdering").get(),
        firestore.doc("publicSettings/customerOrdering").get(),
        firestore.doc("publicSettings/customerRequestPolicy").get(),
        firestore.doc("publicProjectionControl/current").get(),
      ]);
    const retainedEnvelope = await customerPage.evaluate(() => {
      const entry = Object.entries(localStorage).find(([key]) =>
        key.startsWith("greek-more-customer-submit-v2:"),
      );
      if (!entry) return null;
      const value = JSON.parse(entry[1]);
      return {
        envelopeVersion: value.envelopeVersion,
        itemCount: value.items?.length,
        items: value.items?.map((item) => ({
          keys: Object.keys(item).sort(),
          productId: item.productId,
          productName: item.productName,
          selectedOptions: item.selectedOptions,
          selectedOptionIds: item.selectedOptionIds,
          quantity: item.quantity,
          basePrice: item.basePrice,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          selectedChannel: item.selectedChannel,
          priceBreakdown: item.priceBreakdown,
          toppingPackaging: item.toppingPackaging,
          toppingPackagingLabel: item.toppingPackagingLabel,
          packagingSurchargePerUnit: item.packagingSurchargePerUnit,
          packagingSurchargeTotal: item.packagingSurchargeTotal,
        })),
      };
    });
    persisted.docs.forEach((entry) => temporaryRequestIds.add(entry.id));
    throw new Error(
      `Customer submit did not navigate: ${JSON.stringify({
        url: customerPage.url(),
        secondTabUrl: secondCustomerPage.url(),
        validationMessages: await customerPage
          .locator(".validation")
          .allTextContents(),
        statusMessages: await customerPage
          .locator('[role="status"]')
          .allTextContents(),
        consoleErrors: customerErrors(),
        secondTabConsoleErrors: secondCustomerErrors(),
        persistedRequestIds: persisted.docs.map((entry) => entry.id),
        retainedEnvelope,
        privateControl: {
          keys: Object.keys(privateControl.data() ?? {}).sort(),
          schemaVersion: privateControl.data()?.schemaVersion,
          enabled: privateControl.data()?.enabled,
        },
        publicControl: {
          keys: Object.keys(publicControl.data() ?? {}).sort(),
          schemaVersion: publicControl.data()?.schemaVersion,
          enabled: publicControl.data()?.enabled,
        },
        requestPolicy: {
          schemaVersion: policy.data()?.schemaVersion,
          fingerprint: policy.data()?.fingerprint,
          productLimit: policy.data()?.productLimits?.["apple-ohlala"],
        },
        projection: {
          schemaVersion: projection.data()?.schemaVersion,
          fingerprint: projection.data()?.fingerprint,
        },
      })}`,
      { cause },
    );
  }
  requestId = new URL(customerPage.url()).pathname.split("/").at(-1);
  temporaryRequestIds.add(requestId);
  const secondTabRequestId = new URL(secondCustomerPage.url()).pathname
    .split("/")
    .at(-1);
  assert(requestId, "Customer UI did not expose the created request ID");
  assert(
    secondTabRequestId === requestId,
    "The two Customer tabs did not converge on the same request ID",
  );
  assert(
    customerIdentity?.localId,
    "Customer Anonymous identity was not captured",
  );
  assert(
    customerIdentities.size === 1,
    "The shared browser context created more than one Anonymous identity",
  );
  await customerPage.getByRole("heading", { name: "รอร้านยืนยัน" }).waitFor();
  await secondCustomerPage
    .getByRole("heading", { name: "รอร้านยืนยัน" })
    .waitFor();
  await Promise.all([
    customerPage.reload({ waitUntil: "domcontentloaded" }),
    secondCustomerPage.reload({ waitUntil: "domcontentloaded" }),
  ]);
  await Promise.all([
    convergeCustomerPageToStatus(customerPage),
    convergeCustomerPageToStatus(secondCustomerPage),
  ]);
  await Promise.all([
    customerPage.getByRole("heading", { name: "รอร้านยืนยัน" }).waitFor(),
    secondCustomerPage.getByRole("heading", { name: "รอร้านยืนยัน" }).waitFor(),
  ]);
  const ownerRequestsBefore = await firestore
    .collection("customerOrderRequests")
    .where("ownerUid", "==", customerIdentity.localId)
    .get();
  const markerRequestsBefore = await firestore
    .collection("customerOrderRequests")
    .where("customerName", "==", marker)
    .get();
  assert(
    ownerRequestsBefore.size === 1 &&
      markerRequestsBefore.size === 1 &&
      markerRequestsBefore.docs[0].id === requestId,
    "The two-tab race created more than one parent Customer request",
  );
  const normalizedParent = markerRequestsBefore.docs[0].data();
  const [normalizedItems, normalizedGroups] = await Promise.all([
    firestore.collection(`customerOrderRequests/${requestId}/items`).get(),
    firestore.collection(`customerOrderRequests/${requestId}/itemGroups`).get(),
  ]);
  assert(
    normalizedItems.size === normalizedParent.itemIds?.length &&
      normalizedGroups.size === normalizedParent.itemGroupIds?.length &&
      normalizedItems.docs.every(
        (entry) =>
          entry.data().ownerUid === customerIdentity.localId &&
          entry.data().requestId === requestId,
      ) &&
      normalizedGroups.docs.every(
        (entry) =>
          entry.data().ownerUid === customerIdentity.localId &&
          entry.data().requestId === requestId,
      ),
    "The converged request did not contain one exact normalized child/group set",
  );

  await secondCustomerPage.goto(`${baseUrl}/order`, {
    waitUntil: "domcontentloaded",
  });
  const existingStatusLink = secondCustomerPage.getByRole("link", {
    name: "กลับไปดูสถานะคำขอเดิม",
  });
  await existingStatusLink.waitFor();
  await secondCustomerPage.waitForTimeout(5_200);
  await secondCustomerPage.reload({ waitUntil: "domcontentloaded" });
  await secondCustomerPage
    .getByText(/ระบบจะไม่สร้างคำขอใหม่จากแท็บนี้/)
    .waitFor();
  assert(
    (await secondCustomerPage.locator(".product-card:enabled").count()) === 0,
    "Cooldown expiry enabled a second normal-UI submission",
  );

  const blockedProduct = secondCustomerPage
    .getByRole("button")
    .filter({ hasText: "Apple Ohlala" });
  await invokeReactClick(blockedProduct, "blocked product");
  await secondCustomerPage
    .getByRole("button", { name: "ช็อกโกแลต", exact: true })
    .click();
  await secondCustomerPage
    .getByRole("button")
    .filter({ hasText: "เพิ่มลงตะกร้า" })
    .click();
  await secondCustomerPage
    .getByPlaceholder("ชื่อเล่น (ไม่บังคับ)")
    .fill(marker);
  const blockedSubmit = secondCustomerPage.getByRole("button", {
    name: "ส่งคำขอให้ร้านยืนยัน",
  });
  await invokeReactClick(blockedSubmit, "blocked submit");
  await secondCustomerPage.locator(".customer-cart .validation").waitFor();

  const [ownerRequestsAfter, markerRequestsAfter] = await Promise.all([
    firestore
      .collection("customerOrderRequests")
      .where("ownerUid", "==", customerIdentity.localId)
      .get(),
    firestore
      .collection("customerOrderRequests")
      .where("customerName", "==", marker)
      .get(),
  ]);
  assert(
    ownerRequestsAfter.size === ownerRequestsBefore.size &&
      markerRequestsAfter.size === markerRequestsBefore.size &&
      ownerRequestsAfter.docs.some((entry) => entry.id === requestId) &&
      markerRequestsAfter.docs.some((entry) => entry.id === requestId),
    "The post-cooldown actual submit handler created another request",
  );
  await existingStatusLink.click();
  await secondCustomerPage.waitForURL(`${baseUrl}/order/status/${requestId}`);
  await secondCustomerPage
    .getByRole("heading", { name: "รอร้านยืนยัน" })
    .waitFor();
  assert(
    customerErrors().length === 0,
    `Customer UI console errors: ${customerErrors().join(" | ")}`,
  );
  assert(
    secondCustomerErrors().length === 0,
    `Second Customer tab console errors: ${secondCustomerErrors().join(" | ")}`,
  );

  const date = businessDate();
  const counterBefore = await counterSequence(date);
  const staffContext = await browser.newContext({
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 },
  });
  const staffPage = await staffContext.newPage();
  const staffUnexpectedErrors = await attachConsoleCapture(staffPage, [
    "Customer request confirmation failed",
    "Could not reach Cloud Firestore backend. Connection failed 1 times.",
  ]);
  await staffPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await staffPage.getByLabel("อีเมล").fill(staffEmail);
  await staffPage.getByLabel("รหัสผ่าน").fill(staffPassword);
  await staffPage.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await staffPage
    .getByRole("link", { name: /คำขอลูกค้า/ })
    .waitFor({ state: "visible" });

  const responsiveLayouts = [];
  const customerRequestSearchLayouts = [];
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "tablet", width: 820, height: 1000 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    await staffPage.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await staffPage.goto(`${baseUrl}/customer-requests`, {
      waitUntil: "domcontentloaded",
    });
    const requestFilters = staffPage.locator(".customer-request-filters");
    await requestFilters.waitFor();
    const requestSearch = requestFilters.locator(".search");
    const requestSearchInput = requestSearch.locator("input");
    const requestFilterSelect = requestFilters.locator("select");
    const searchLayout = await requestSearch.evaluate((label) => {
      const input = label.querySelector("input");
      const icon = label.querySelector("svg");
      const filters = label.parentElement;
      const select = filters?.querySelector("select");
      if (!input || !icon || !filters || !select)
        throw new Error("Customer Requests search controls are incomplete");
      const labelRect = label.getBoundingClientRect();
      const inputRect = input.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      const selectRect = select.getBoundingClientRect();
      return {
        labelHeight: labelRect.height,
        inputHeight: inputRect.height,
        iconInsideInput:
          iconRect.left >= inputRect.left + 8 &&
          iconRect.right <= inputRect.right - 8 &&
          iconRect.top >= inputRect.top &&
          iconRect.bottom <= inputRect.bottom,
        verticalCenterDelta: Math.abs(
          iconRect.top +
            iconRect.height / 2 -
            (inputRect.top + inputRect.height / 2),
        ),
        paddingLeft: Number.parseFloat(getComputedStyle(input).paddingLeft),
        controlsAligned:
          Math.abs(
            inputRect.top +
              inputRect.height / 2 -
              (selectRect.top + selectRect.height / 2),
          ) <= 1 ||
          (selectRect.top >= inputRect.bottom &&
            Math.abs(inputRect.left - selectRect.left) <= 1 &&
            Math.abs(inputRect.width - selectRect.width) <= 1),
        overflow: filters.scrollWidth > filters.clientWidth + 1,
        accessibleName: input.getAttribute("aria-label"),
        iconHidden: icon.getAttribute("aria-hidden") === "true",
      };
    });
    assert(
      searchLayout.iconInsideInput &&
        searchLayout.verticalCenterDelta <= 1 &&
        searchLayout.labelHeight === searchLayout.inputHeight &&
        searchLayout.paddingLeft >= 40 &&
        searchLayout.controlsAligned &&
        !searchLayout.overflow &&
        Boolean(searchLayout.accessibleName) &&
        searchLayout.iconHidden,
      `Customer Requests search layout failed at ${viewport.name}: ${JSON.stringify(searchLayout)}`,
    );
    await requestSearchInput.hover();
    await requestSearchInput.focus();
    assert(
      await requestSearchInput.evaluate((input) => {
        const style = getComputedStyle(input);
        return (
          input === document.activeElement &&
          input.matches(":hover") &&
          style.boxShadow !== "none"
        );
      }),
      `Customer Requests search focus/hover failed at ${viewport.name}`,
    );
    await staffPage.keyboard.press("Tab");
    assert(
      await requestFilterSelect.evaluate(
        (select) => select === document.activeElement,
      ),
      `Customer Requests keyboard navigation failed at ${viewport.name}`,
    );
    customerRequestSearchLayouts.push({
      viewport: viewport.name,
      ...searchLayout,
    });
    await staffPage.goto(`${baseUrl}/settings`, {
      waitUntil: "domcontentloaded",
    });
    const settingsControl = staffPage.locator("#customer-ordering details");
    await settingsControl.waitFor();
    assert(
      !(await settingsControl.evaluate((details) => details.open)),
      `Customer QR Settings section was not collapsed by default at ${viewport.name}`,
    );
    assert(
      (await staffPage.locator(".global-packaging-control").count()) === 0,
      "Settings still contains a topping availability control",
    );
    await staffPage.goto(`${baseUrl}/settings#customer-ordering`, {
      waitUntil: "domcontentloaded",
    });
    const operations = staffPage.locator(".customer-ordering-operations");
    await operations.waitFor();
    await staffPage
      .getByText("มีสิทธิ์เปิดรับคำสั่งซื้อกลับ", { exact: true })
      .waitFor();
    const layout = await operations.evaluate((panel) => {
      const panelRect = panel.getBoundingClientRect();
      const children = [...panel.children].map((child) =>
        child.getBoundingClientRect(),
      );
      const indicators = [
        ...panel.querySelectorAll(".operations-indicators .indicator"),
      ].map((entry) => entry.getBoundingClientRect());
      const overlaps = indicators.some((left, index) =>
        indicators
          .slice(index + 1)
          .some(
            (right) =>
              left.left < right.right &&
              left.right > right.left &&
              left.top < right.bottom &&
              left.bottom > right.top,
          ),
      );
      return {
        panelWidth: panelRect.width,
        narrowestChild: Math.min(...children.map((entry) => entry.width)),
        overflow: panel.scrollWidth > panel.clientWidth + 1,
        overlaps,
      };
    });
    assert(
      layout.panelWidth >= Math.min(340, viewport.width - 32) &&
        layout.narrowestChild >= Math.min(300, layout.panelWidth - 48) &&
        !layout.overflow &&
        !layout.overlaps,
      `Operations layout failed at ${viewport.name}: ${JSON.stringify(layout)}`,
    );
    responsiveLayouts.push({ viewport: viewport.name, ...layout });
  }
  await staffPage.setViewportSize({ width: 1440, height: 1000 });
  await staffPage.goto(`${baseUrl}/customer-requests`, {
    waitUntil: "domcontentloaded",
  });
  assert(
    (await staffPage.locator(".customer-ordering-operations").count()) === 0 &&
      (await staffPage.locator("#customer-ordering").count()) === 0 &&
      (await staffPage.getByRole("button", { name: /Seed/ }).count()) === 0,
    "Customer Requests still contains Customer QR operations controls",
  );
  await staffPage.goto(`${baseUrl}/products`, {
    waitUntil: "domcontentloaded",
  });
  const productAvailabilityControl = staffPage.locator(
    ".global-packaging-control",
  );
  await productAvailabilityControl.waitFor();
  assert(
    (await productAvailabilityControl.count()) === 1,
    "Products is not the sole Staff-facing global topping packaging control",
  );
  await staffPage.goto(`${baseUrl}/settings#customer-ordering`, {
    waitUntil: "domcontentloaded",
  });
  const operationsPanel = staffPage.locator(".customer-ordering-operations");
  await operationsPanel.locator(".operations-state.enabled").waitFor();
  const disableInputs = operationsPanel.locator(
    '.operations-action-form input:not([type="checkbox"])',
  );
  await disableInputs.nth(0).fill("WP4 automated disable rehearsal");
  await disableInputs
    .nth(1)
    .fill("ร้านปิดรับคำสั่งซื้อใหม่ชั่วคราวระหว่างการทดสอบ WP4");
  await operationsPanel
    .getByRole("button", { name: "ปิดรับคำสั่งซื้อฉุกเฉิน" })
    .click();
  let disabledControl = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    disabledControl = (
      await firestore.doc("settings/customerOrdering").get()
    ).data();
    if (disabledControl?.enabled === false) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert(
    disabledControl?.enabled === false,
    "The capable Staff disable action did not reach the UAT write boundary",
  );
  await staffPage.reload({ waitUntil: "domcontentloaded" });
  const reloadedOperationsPanel = staffPage.locator(
    ".customer-ordering-operations",
  );
  await reloadedOperationsPanel
    .locator(".operations-state.disabled")
    .getByText("ปิดรับคำสั่งซื้อใหม่", { exact: true })
    .waitFor();
  await secondCustomerPage.goto(`${baseUrl}/order`, {
    waitUntil: "domcontentloaded",
  });
  await secondCustomerPage
    .getByText("ร้านปิดรับคำสั่งซื้อใหม่ชั่วคราวระหว่างการทดสอบ WP4", {
      exact: true,
    })
    .waitFor();
  await customerPage.reload({ waitUntil: "domcontentloaded" });
  await convergeCustomerPageToStatus(customerPage);
  await customerPage.getByRole("heading", { name: "รอร้านยืนยัน" }).waitFor();

  await staffPage.goto(`${baseUrl}/customer-requests/${requestId}`, {
    waitUntil: "domcontentloaded",
  });
  const confirmButton = await unique(
    staffPage.getByRole("button", { name: "ยืนยันและสร้างคิว" }),
    "Staff confirm action",
  );
  await confirmButton.click();
  await staffPage.getByText(paymentRequired, { exact: true }).waitFor();
  const payment = await unique(
    staffPage.getByRole("combobox", { name: "วิธีชำระเงิน Apple Ohlala" }),
    "Staff payment control",
  );
  assert(
    (await payment.getAttribute("aria-invalid")) === "true",
    "Missing payment was not marked invalid",
  );
  await payment.selectOption({ label: "สด" });
  assert(
    (await staffPage.getByText(paymentRequired, { exact: true }).count()) === 0,
    "Payment guidance did not clear",
  );
  await confirmButton.click();
  await staffPage.waitForURL(`${baseUrl}/queue`);
  await staffPage.getByText(marker, { exact: true }).waitFor();

  const confirmed = (
    await firestore.doc(`customerOrderRequests/${requestId}`).get()
  ).data();
  assert(confirmed?.confirmedOrderId, "Confirmed request has no Order link");
  assert(confirmed?.queueNumber, "Confirmed request has no queue number");
  orderId = confirmed.confirmedOrderId;
  queueNumber = confirmed.queueNumber;
  const matchingOrders = await firestore
    .collection("orders")
    .where("customerName", "==", marker)
    .get();
  assert(
    matchingOrders.size === 1,
    `Expected one created Order, found ${matchingOrders.size}`,
  );
  assert(
    matchingOrders.docs[0].id === orderId,
    "Request and Order IDs are not linked",
  );
  const counterAfter = await counterSequence(date);
  assert(
    counterAfter === counterBefore + 1,
    "Valid confirmation did not allocate exactly one queue number",
  );
  await customerPage.getByText(queueNumber, { exact: true }).waitFor();
  await customerPage.waitForFunction(
    () =>
      !Object.keys(localStorage).some(
        (key) =>
          key.startsWith("greek-more-customer-active-request-v2:") ||
          key === "greek-more-customer-active-request-profile-v1" ||
          key.startsWith("greek-more-customer-submit-v2:"),
      ),
  );

  await staffPage.goto(`${baseUrl}/settings#customer-ordering`, {
    waitUntil: "domcontentloaded",
  });
  const reenablePanel = staffPage.locator(".customer-ordering-operations");
  await reenablePanel.locator(".operations-state.disabled").waitFor();
  await reenablePanel
    .getByText("มีสิทธิ์เปิดรับคำสั่งซื้อกลับ", { exact: true })
    .waitFor();
  await reenablePanel
    .locator('input:not([type="checkbox"])')
    .first()
    .fill("WP4 automated re-enable after existing-request processing");
  await reenablePanel.locator('input[type="checkbox"]').first().check();
  await reenablePanel
    .getByRole("button", { name: "เปิดรับคำสั่งซื้ออีกครั้ง" })
    .click();
  await reenablePanel
    .locator(".operations-state.enabled")
    .getByText("เปิดรับคำสั่งซื้อใหม่", { exact: true })
    .waitFor();

  await staffPage.goto(`${baseUrl}/customer-requests/${requestId}`, {
    waitUntil: "domcontentloaded",
  });
  await staffPage.getByRole("heading", { name: marker }).waitFor();
  const duplicateButton = await unique(
    staffPage.getByRole("button", { name: "ยืนยันและสร้างคิว" }),
    "processed-request confirmation action",
  );
  assert(
    !(await duplicateButton.isEnabled()),
    "Processed request can still be confirmed",
  );
  assert(
    (await counterSequence(date)) === counterAfter,
    "Duplicate UI path changed the queue counter",
  );
  assert(
    (
      await firestore
        .collection("orders")
        .where("customerName", "==", marker)
        .get()
    ).size === 1,
    "Duplicate UI path created another Order",
  );

  const sourceItem = (
    await firestore.doc(`customerOrderRequests/${requestId}/items/00`).get()
  ).data()?.item;
  assert(sourceItem, "Valid request item is unavailable for negative control");
  const negativeRef = firestore.doc(
    `customerOrderRequests/${negativeRequestId}`,
  );
  const negativeTimestamp = new Date().toISOString();
  const forgedItem = {
    ...sourceItem,
    productName: `FORGED ${sourceItem.productName}`,
  };
  await negativeRef.set({
    id: negativeRequestId,
    ownerUid: "wp4-browser-negative-owner",
    status: "รอร้านยืนยัน",
    channel: "หน้าร้าน",
    customerName: `${marker}-NEGATIVE`,
    customerNote: "temporary trusted-confirmation mismatch",
    items: [forgedItem],
    subtotal: forgedItem.lineTotal,
    total: forgedItem.lineTotal,
    itemCount: forgedItem.quantity,
    createdAt: negativeTimestamp,
    updatedAt: negativeTimestamp,
  });
  const negativeBefore = (await negativeRef.get()).data();
  assert(
    negativeBefore?.status === "รอร้านยืนยัน",
    "Temporary negative-control request is not pending",
  );
  const negativeCounterBefore = await counterSequence(date);
  await staffPage.goto(`${baseUrl}/customer-requests/${negativeRequestId}`, {
    waitUntil: "domcontentloaded",
  });
  const negativePayment = await unique(
    staffPage.getByRole("combobox"),
    "negative-control payment control",
  );
  await negativePayment.selectOption({ label: "สด" });
  await (
    await unique(
      staffPage.getByRole("button", { name: "ยืนยันและสร้างคิว" }),
      "negative-control confirm action",
    )
  ).click();
  await staffPage.getByText(mismatchMessage, { exact: true }).waitFor();
  assert(
    staffPage.url().endsWith(`/customer-requests/${negativeRequestId}`),
    "Negative control navigated away",
  );
  const negativeAfter = (await negativeRef.get()).data();
  assert(
    JSON.stringify(safeRequestState(negativeAfter)) ===
      JSON.stringify(safeRequestState(negativeBefore)),
    "Negative-control request changed",
  );
  assert(
    (await counterSequence(date)) === negativeCounterBefore,
    "Negative control consumed a queue number",
  );

  await staffPage.goto(`${baseUrl}/queue`, { waitUntil: "domcontentloaded" });
  await (
    await unique(
      staffPage.getByRole("link").filter({ hasText: marker }),
      "valid Queue card",
    )
  ).click();
  await (
    await unique(
      staffPage.getByRole("button", { name: "พร้อมจัดส่ง" }),
      "complete Order action",
    )
  ).click();
  await staffPage.waitForURL(`${baseUrl}/queue`);
  await (
    await unique(
      staffPage.getByRole("link", { name: "ประวัติ", exact: true }),
      "History navigation",
    )
  ).click();
  await staffPage.waitForURL(`${baseUrl}/history`);
  await staffPage.getByText(marker, { exact: true }).waitFor();
  await (
    await unique(
      staffPage.getByRole("link", { name: "รายงาน", exact: true }),
      "Reports navigation",
    )
  ).click();
  await staffPage.waitForURL(`${baseUrl}/reports`);
  await staffPage.getByRole("heading", { name: "รายงานและยอดขาย" }).waitFor();
  const exportButton = await unique(
    staffPage.getByRole("button", { name: "ส่งออก Excel" }),
    "Excel export action",
  );
  const [download] = await Promise.all([
    staffPage.waitForEvent("download"),
    exportButton.click(),
  ]);
  const downloadPath = await download.path();
  assert(downloadPath, "Excel download did not produce a readable file");
  const workbook = XLSX.readFile(downloadPath);
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(firstSheet);
  assert(
    rows.some((row) => row["ชื่อลูกค้า"] === marker),
    "Excel output does not contain the valid browser Order",
  );

  const paginationSource = (
    await firestore.doc(`orders/${orderId}`).get()
  ).data();
  assert(paginationSource, "Pagination source Order is missing");
  const paginationBatch = firestore.batch();
  for (let index = 0; index < 51; index += 1) {
    const id = `${marker}-PAGE-${String(index).padStart(2, "0")}`;
    paginationOrderIds.push(id);
    paginationBatch.set(firestore.doc(`orders/${id}`), {
      ...paginationSource,
      id,
      customerName: `${marker}-PAGE-${String(index).padStart(2, "0")}`,
      status: "completed",
      createdAt: `2099-01-01T00:${String(59 - index).padStart(2, "0")}:00.000Z`,
      updatedAt: `2099-01-01T00:${String(59 - index).padStart(2, "0")}:00.000Z`,
      completedAt: `2099-01-01T00:${String(59 - index).padStart(2, "0")}:00.000Z`,
    });
  }
  await paginationBatch.commit();
  await staffPage.goto(`${baseUrl}/history`, { waitUntil: "domcontentloaded" });
  await staffPage.getByText(`${marker}-PAGE-00`, { exact: true }).waitFor();
  assert(
    (await staffPage
      .getByText(`${marker}-PAGE-50`, { exact: true })
      .count()) === 0,
    "History rendered beyond the first 50-row page",
  );
  await staffPage.getByRole("button", { name: "โหลดเพิ่ม 50 รายการ" }).click();
  await staffPage.getByText(`${marker}-PAGE-50`, { exact: true }).waitFor();
  assert(
    staffUnexpectedErrors().length === 0,
    `Unexpected Staff UI console errors: ${staffUnexpectedErrors().join(" | ")}`,
  );

  console.log(
    JSON.stringify({
      status: "passed",
      projectId,
      marker,
      requestId,
      orderId,
      queueNumber,
      humanUatEvidence,
      limitFeedback: {
        quantityBoundaryAndBlockedEleventh: "passed",
        totalQuantityBoundaryAndBulkOrderMessage: "passed",
        toppingBoundaryAndBlockedEleventh: "passed",
        nicknameAndNoteBoundaryPlusOne: "passed",
        feedbackClearsWhenCorrected: true,
      },
      statusRecovery: {
        submittedRoute: `${baseUrl}/order/status/${requestId}`,
        refresh: "passed",
        sameProfileSecondTab: "passed",
        exactNormalizedHydration: "passed",
      },
      twoTabConvergence: {
        requestId,
        tabsOpenedBeforeAuthentication: true,
        simultaneousWriteBoundaryAttempt: true,
        anonymousIdentityCount: customerIdentities.size,
        cooldownExpired: true,
        postCooldownSubmitHandlerAttempt: true,
        ownerRequestCountBefore: ownerRequestsBefore.size,
        ownerRequestCountAfter: ownerRequestsAfter.size,
        markerRequestCountAfter: markerRequestsAfter.size,
        normalizedItemDocumentCount: normalizedItems.size,
        normalizedSummaryDocumentCount: normalizedGroups.size,
        secondSubmissionEnabled: false,
      },
      runtimeControl: {
        capableStaffLabel: "visible",
        maintenanceMessage: "visible",
        existingStatusWhileDisabled: "passed",
        staffConfirmationWhileDisabled: "passed",
        capableReenable: "passed",
      },
      responsiveOperationsLayout: responsiveLayouts,
      customerRequestSearchLayout: customerRequestSearchLayouts,
      paymentValidation: "visible-and-cleared",
      customerStatus: "updated",
      duplicateConfirmation: "blocked-without-write",
      negativeControl: {
        requestId: negativeRequestId,
        visibleMessage: mismatchMessage,
        remainedPending: negativeAfter.status === "รอร้านยืนยัน",
        orderLink: negativeAfter.confirmedOrderId ?? null,
        queueNumber: negativeAfter.queueNumber ?? null,
        counterUnchanged: true,
      },
      queue: "passed",
      history: "passed",
      reports: "passed",
      excel: "passed",
      pagination: "51 records crossed the 50-row cursor boundary",
      browserConsole: "no-unexpected-errors",
    }),
  );
} catch (cause) {
  validationFailure = cause;
} finally {
  if (browser)
    await browser.close().catch((cause) => cleanupFailures.push(cause));
  if (orderId)
    await firestore
      .doc(`orders/${orderId}`)
      .delete()
      .catch((cause) => cleanupFailures.push(cause));
  if (paginationOrderIds.length) {
    const batch = firestore.batch();
    paginationOrderIds.forEach((id) =>
      batch.delete(firestore.doc(`orders/${id}`)),
    );
    await batch.commit().catch((cause) => cleanupFailures.push(cause));
  }
  await firestore
    .collection("customerOrderRequests")
    .where("customerName", "==", marker)
    .get()
    .then((snapshot) =>
      snapshot.docs.forEach((entry) => temporaryRequestIds.add(entry.id)),
    )
    .catch((cause) => cleanupFailures.push(cause));
  for (const id of temporaryRequestIds) {
    await deleteTemporaryOperationalAudit(id).catch((cause) =>
      cleanupFailures.push(cause),
    );
    await deleteNormalizedRequest(id).catch((cause) =>
      cleanupFailures.push(cause),
    );
  }
  await deleteTemporaryOperationalAudit(negativeRequestId).catch((cause) =>
    cleanupFailures.push(cause),
  );
  await firestore
    .doc(`customerOrderRequests/${negativeRequestId}`)
    .delete()
    .catch((cause) => cleanupFailures.push(cause));
  if (staffIdentity?.localId)
    await firestore
      .doc(`users/${staffIdentity.localId}`)
      .delete()
      .catch((cause) => cleanupFailures.push(cause));
  await deleteIdentity(staffIdentity).catch((cause) =>
    cleanupFailures.push(cause),
  );
  for (const identity of customerIdentities.values())
    await deleteIdentity(identity).catch((cause) =>
      cleanupFailures.push(cause),
    );
  for (const id of temporaryRequestIds) {
    const [parent, items, groups, audits] = await Promise.all([
      firestore.doc(`customerOrderRequests/${id}`).get(),
      firestore.collection(`customerOrderRequests/${id}/items`).get(),
      firestore.collection(`customerOrderRequests/${id}/itemGroups`).get(),
      firestore
        .collection("customerOrderingAuditEvents")
        .where("requestId", "==", id)
        .get(),
    ]).catch((cause) => {
      cleanupFailures.push(cause);
      return [];
    });
    if (parent?.exists || !items?.empty || !groups?.empty || !audits?.empty)
      cleanupFailures.push(
        new Error("Normalized browser request cleanup verification failed"),
      );
  }
  if (paginationOrderIds.length) {
    const remaining = await Promise.all(
      paginationOrderIds.map((id) => firestore.doc(`orders/${id}`).get()),
    ).catch((cause) => {
      cleanupFailures.push(cause);
      return [];
    });
    if (remaining.some((entry) => entry.exists))
      cleanupFailures.push(new Error("Pagination cleanup verification failed"));
  }
  const [negativeRemaining, negativeAuditsRemaining] = await Promise.all([
    firestore.doc(`customerOrderRequests/${negativeRequestId}`).get(),
    firestore
      .collection("customerOrderingAuditEvents")
      .where("requestId", "==", negativeRequestId)
      .get(),
  ]).catch((cause) => {
    cleanupFailures.push(cause);
    return [];
  });
  if (negativeRemaining?.exists || !negativeAuditsRemaining?.empty)
    cleanupFailures.push(
      new Error("Temporary negative-control cleanup verification failed"),
    );
}

if (cleanupFailures.length)
  throw new Error(
    `Customer browser UAT cleanup failed for ${cleanupFailures.length} temporary resources`,
    { cause: validationFailure },
  );
if (validationFailure) throw validationFailure;
