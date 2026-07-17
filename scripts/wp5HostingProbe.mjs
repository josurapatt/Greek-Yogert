import { chromium } from "playwright";

const projectId = process.env.CUSTOMER_UAT_FIREBASE_PROJECT_ID;
const expectedProjectId = "greek-yogert-customer-uat-2026";
const modeIndex = process.argv.indexOf("--mode");
const mode = modeIndex >= 0 ? process.argv[modeIndex + 1] : undefined;
const baseUrl = `https://${expectedProjectId}.web.app`;

if (projectId !== expectedProjectId)
  throw new Error("WP5 Hosting probe requires the exact isolated UAT project");
if (projectId === "greek-yogert")
  throw new Error("Production Hosting probes are prohibited");
if (mode !== "enabled" && mode !== "disabled")
  throw new Error("WP5 Hosting probe mode must be enabled or disabled");

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`${baseUrl}/order`, { waitUntil: "domcontentloaded" });
  if (mode === "enabled") {
    if (
      (await page.locator("html").getAttribute("data-app-environment")) !==
      "release-rehearsal"
    )
      throw new Error("Hosting artifact lacks the release-rehearsal identity");
    await page.locator(".product-card").first().waitFor();
    if ((await page.getByText(/Demo\/UAT|โหมดทดลอง|Seed/).count()) !== 0)
      throw new Error(
        "Production-like rehearsal exposed UAT-only display content",
      );
    if ((await page.getByRole("button", { name: /ส่งคำขอ/ }).count()) !== 1)
      throw new Error("Customer release entry point is unavailable");
  } else {
    await page
      .getByRole("heading", { name: "ยังไม่เปิดรับคำสั่งซื้อออนไลน์" })
      .waitFor();
    if ((await page.locator(".product-card").count()) !== 0)
      throw new Error("Customer menu remained exposed during Hosting rollback");
    await page.goto(`${baseUrl}/order/status/wp5-rollback-boundary`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("heading", { name: "ยังไม่เปิดรับคำสั่งซื้อออนไลน์" })
      .waitFor();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "เข้าสู่ระบบร้าน" }).waitFor();
  }
  if (errors.length)
    throw new Error(`Unexpected Hosting browser errors: ${errors.join(" | ")}`);
  console.log(
    JSON.stringify({
      status: "passed",
      projectId,
      mode,
      productionLikeDisplay: mode === "enabled" ? "passed" : "not-applicable",
      customerEntryPoint:
        mode === "enabled" ? "available" : "customer-disabled",
      staffEntryPoint: mode === "disabled" ? "available" : "not-probed",
      existingCustomerStatusBoundary:
        mode === "disabled"
          ? "unavailable-with-customer-disabled-build"
          : "available",
    }),
  );
} finally {
  await browser.close();
}
