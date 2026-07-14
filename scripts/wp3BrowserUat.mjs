import { randomBytes } from "node:crypto";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { chromium } from "playwright";
import * as XLSX from "xlsx";

const projectId = process.env.CUSTOMER_UAT_FIREBASE_PROJECT_ID;
const apiKey = process.env.CUSTOMER_UAT_FIREBASE_API_KEY;
const baseUrl = "https://greek-yogert-customer-uat-2026.web.app";
if (projectId !== "greek-yogert-customer-uat-2026")
  throw new Error("WP3 browser UAT requires the exact isolated UAT project");
if (!apiKey) throw new Error("Missing isolated UAT Firebase API key");
if (!getApps().length)
  initializeApp({ credential: applicationDefault(), projectId });
const firestore = getFirestore();

const marker = `WP3-AUTO-UI-VALID-RETEST-${Date.now()}`;
const staffEmail = `${marker.toLowerCase()}@example.com`;
const staffPassword = `Wp3!${randomBytes(18).toString("base64url")}`;
const paymentRequired = "กรุณาเลือกวิธีการชำระเงินก่อนยืนยันคำสั่งซื้อ";
const mismatchMessage =
  "คำขอไม่ตรงกับเมนูหรือการตั้งค่าปัจจุบัน กรุณาให้ลูกค้าแก้ไขหรือสร้างคำขอใหม่";
const negativeRequestId = "WP3-AUTO-1783938043929-forged-unit-price";
const cleanupFailures = [];
let staffIdentity;
let customerIdentity;
let browser;
let requestId;
let orderId;
let queueNumber;
let validationFailure;

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
  });
  return identity;
}

async function deleteIdentity(identity) {
  if (!identity?.idToken) return;
  await identityRequest("delete", { idToken: identity.idToken });
}

async function unique(locator, description) {
  await locator.waitFor({ state: "visible" });
  const count = await locator.count();
  assert(count === 1, `Expected one ${description}, found ${count}`);
  return locator;
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
  staffIdentity = await createStaffIdentity();
  browser = await chromium.launch({ headless: true });

  const customerContext = await browser.newContext({
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
    viewport: { width: 390, height: 844 },
  });
  const customerPage = await customerContext.newPage();
  const customerErrors = await attachConsoleCapture(customerPage);
  customerPage.on("response", async (response) => {
    if (
      !customerIdentity &&
      response.url().includes("identitytoolkit.googleapis.com") &&
      response.url().includes("accounts:signUp") &&
      response.ok()
    ) {
      const value = await response.json();
      if (value.localId && value.idToken) customerIdentity = value;
    }
  });

  await customerPage.goto(`${baseUrl}/order`, {
    waitUntil: "domcontentloaded",
  });
  await (
    await unique(
      customerPage.getByRole("button").filter({ hasText: "Apple Ohlala" }),
      "Apple Ohlala Customer product",
    )
  ).click();
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
  await customerPage.getByPlaceholder("ชื่อเล่น (ไม่บังคับ)").fill(marker);
  await customerPage
    .getByPlaceholder("หมายเหตุถึงร้าน (ไม่บังคับ)")
    .fill("isolated browser UAT");
  await (
    await unique(
      customerPage.getByRole("button", { name: "ส่งคำขอให้ร้านยืนยัน" }),
      "Customer submit action",
    )
  ).click();
  await customerPage.waitForURL(/\/order\/status\//);
  requestId = new URL(customerPage.url()).pathname.split("/").at(-1);
  assert(requestId, "Customer UI did not expose the created request ID");
  assert(
    customerIdentity?.localId,
    "Customer Anonymous identity was not captured",
  );
  await customerPage.getByRole("heading", { name: "รอร้านยืนยัน" }).waitFor();
  assert(
    customerErrors().length === 0,
    `Customer UI console errors: ${customerErrors().join(" | ")}`,
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
  ]);
  await staffPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await staffPage.getByLabel("อีเมล").fill(staffEmail);
  await staffPage.getByLabel("รหัสผ่าน").fill(staffPassword);
  await staffPage.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await staffPage
    .getByRole("link", { name: /คำขอลูกค้า/ })
    .waitFor({ state: "visible" });

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

  const negativeRef = firestore.doc(
    `customerOrderRequests/${negativeRequestId}`,
  );
  const negativeBefore = (await negativeRef.get()).data();
  assert(negativeBefore, "Preserved negative-control request is missing");
  const negativeCounterBefore = await counterSequence(date);
  await staffPage.goto(`${baseUrl}/customer-requests/${negativeRequestId}`, {
    waitUntil: "domcontentloaded",
  });
  const negativePayment = await unique(
    staffPage.getByRole("combobox", { name: "วิธีชำระเงิน Apple Ohlala" }),
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
  assert(await exportButton.isEnabled(), "Reports Excel export is disabled");
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
  if (requestId)
    await firestore
      .doc(`customerOrderRequests/${requestId}`)
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
  await deleteIdentity(customerIdentity).catch((cause) =>
    cleanupFailures.push(cause),
  );
}

if (cleanupFailures.length)
  throw new Error(
    `WP3 browser UAT cleanup failed for ${cleanupFailures.length} temporary resources`,
    { cause: validationFailure },
  );
if (validationFailure) throw validationFailure;
