import type { CartItem, CustomerOrderRequest, Product } from "./types";

export const customerRequestSchemaVersion = 2;
export const customerRequestLimits = {
  maxProductLines: 12,
  maxQuantityPerLine: 10,
  maxTotalUnits: 30,
  maxSelectedOptionsPerLine: 10,
  maxCustomerNameLength: 40,
  maxCustomerNoteLength: 200,
  maxRequestTotal: 5_000,
} as const;

const itemKeys = [
  "id",
  "productId",
  "productName",
  "basePrice",
  "selectedOptions",
  "selectedOptionIds",
  "quantity",
  "unitPrice",
  "selectedChannel",
  "priceBreakdown",
  "lineTotal",
  "toppingPackaging",
  "toppingPackagingLabel",
  "packagingSurchargePerUnit",
  "packagingSurchargeTotal",
] as const;
const priceBreakdownKeys = [
  "basePrice",
  "premiumIncludedSurcharge",
  "extraToppingCharges",
  "unitPrice",
] as const;
const v2RequestKeys = [
  "schemaVersion",
  "id",
  "retryId",
  "ownerUid",
  "status",
  "channel",
  "customerName",
  "customerNote",
  "items",
  "subtotal",
  "total",
  "itemCount",
  "createdAt",
  "updatedAt",
  "submittedAt",
] as const;
const legacyPendingKeys = v2RequestKeys.filter(
  (key) => !["schemaVersion", "retryId", "submittedAt"].includes(key),
);

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function hasAllKeys(
  value: Record<string, unknown>,
  required: readonly string[],
) {
  return required.every((key) => Object.hasOwn(value, key));
}

function assertString(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || value.length > maxLength)
    fail(`${label} ไม่ถูกต้อง`);
}

function assertMoney(value: unknown, label: string) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > customerRequestLimits.maxRequestTotal
  )
    fail(`${label} ไม่ถูกต้อง`);
}

export function productSelectedOptionLimits(product: Product): {
  minimum: number;
  maximum: number;
} {
  if (product.optionMode === "none") return { minimum: 0, maximum: 0 };
  if (product.optionMode === "granola") return { minimum: 1, maximum: 1 };
  const minimum = product.includedToppings;
  const maximum = product.maxSelectedOptions ?? 10;
  if (
    !Number.isInteger(minimum) ||
    minimum < 0 ||
    minimum > customerRequestLimits.maxSelectedOptionsPerLine ||
    !Number.isInteger(maximum) ||
    maximum < minimum ||
    maximum > customerRequestLimits.maxSelectedOptionsPerLine
  )
    fail("การตั้งค่าจำนวนตัวเลือกของสินค้าไม่ถูกต้อง");
  return { minimum, maximum };
}

export function assertCustomerRequestPolicy(
  request: CustomerOrderRequest,
  products: Product[],
  options: {
    allowLegacyPending?: boolean;
    requireSubmittedAt?: boolean;
    skipProductLimits?: boolean;
  } = {},
): void {
  if (!isRecord(request)) fail("รูปแบบคำขอไม่ถูกต้อง");
  const isV2 = request.schemaVersion === customerRequestSchemaVersion;
  if (!isV2 && !options.allowLegacyPending) fail("เวอร์ชันคำขอไม่รองรับ");
  const allowed = isV2 ? v2RequestKeys : legacyPendingKeys;
  const required = allowed.filter(
    (key) =>
      key !== "customerName" &&
      key !== "customerNote" &&
      (!isV2 || key !== "submittedAt" || options.requireSubmittedAt),
  );
  if (!hasOnlyKeys(request, allowed) || !hasAllKeys(request, required))
    fail("คำขอมีข้อมูลที่ไม่รองรับหรือข้อมูลไม่ครบ");
  assertString(request.id, "รหัสคำขอ", 128);
  assertString(request.ownerUid, "เจ้าของคำขอ", 128);
  assertString(request.createdAt, "เวลาสร้างคำขอ", 40);
  assertString(request.updatedAt, "เวลาอัปเดตคำขอ", 40);
  if (isV2) {
    assertString(request.retryId, "รหัสส่งซ้ำ", 128);
    if (request.retryId !== request.id) fail("รหัสส่งซ้ำไม่ตรงกับคำขอ");
    if (options.requireSubmittedAt && !request.submittedAt)
      fail("ไม่พบเวลาส่งคำขอจากเซิร์ฟเวอร์");
  }
  if (request.customerName !== undefined)
    assertString(
      request.customerName,
      "ชื่อเล่น",
      customerRequestLimits.maxCustomerNameLength,
    );
  if (request.customerNote !== undefined)
    assertString(
      request.customerNote,
      "หมายเหตุ",
      customerRequestLimits.maxCustomerNoteLength,
    );
  if (
    !Array.isArray(request.items) ||
    request.items.length < 1 ||
    request.items.length > customerRequestLimits.maxProductLines
  )
    fail(
      `คำขอต้องมีสินค้าไม่เกิน ${customerRequestLimits.maxProductLines} รายการ`,
    );

  const productMap = new Map(products.map((product) => [product.id, product]));
  const lineIds = new Set<string>();
  let units = 0;
  let subtotal = 0;
  request.items.forEach((item, index) => {
    if (!isRecord(item)) fail(`สินค้าแถวที่ ${index + 1} ไม่ถูกต้อง`);
    if (!hasOnlyKeys(item, itemKeys) || !hasAllKeys(item, itemKeys))
      fail(`สินค้าแถวที่ ${index + 1} มีข้อมูลที่ไม่รองรับหรือข้อมูลไม่ครบ`);
    assertString(item.id, "รหัสรายการ", 128);
    assertString(item.productId, "รหัสสินค้า", 128);
    assertString(item.productName, "ชื่อสินค้า", 120);
    if (lineIds.has(item.id)) fail("รหัสรายการสินค้าซ้ำกัน");
    lineIds.add(item.id);
    if (
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > customerRequestLimits.maxQuantityPerLine
    )
      fail(
        `จำนวนต่อรายการต้องอยู่ระหว่าง 1-${customerRequestLimits.maxQuantityPerLine}`,
      );
    units += item.quantity;
    if (
      !Array.isArray(item.selectedOptionIds) ||
      !Array.isArray(item.selectedOptions) ||
      item.selectedOptionIds.length !== item.selectedOptions.length ||
      item.selectedOptionIds.length >
        customerRequestLimits.maxSelectedOptionsPerLine
    )
      fail("จำนวนตัวเลือกสินค้าไม่ถูกต้อง");
    item.selectedOptionIds.forEach((value) =>
      assertString(value, "รหัสตัวเลือก", 120),
    );
    item.selectedOptions.forEach((value) =>
      assertString(value, "ชื่อตัวเลือก", 120),
    );
    const product = productMap.get(item.productId);
    if (!options.skipProductLimits) {
      if (!product) fail("ไม่พบสินค้าในเมนูปัจจุบัน");
      const { minimum, maximum } = productSelectedOptionLimits(product);
      if (
        item.selectedOptionIds.length < minimum ||
        item.selectedOptionIds.length > maximum
      )
        fail(
          `จำนวนตัวเลือกของ ${product.name} ต้องอยู่ระหว่าง ${minimum}-${maximum}`,
        );
    }
    if (item.selectedChannel !== "หน้าร้าน") fail("ช่องทางสินค้าไม่ถูกต้อง");
    if (
      item.toppingPackaging !== "included" &&
      item.toppingPackaging !== "separated"
    )
      fail("รูปแบบบรรจุภัณฑ์ไม่ถูกต้อง");
    assertString(item.toppingPackagingLabel, "ชื่อรูปแบบบรรจุภัณฑ์", 80);
    [
      [item.basePrice, "ราคาหลัก"],
      [item.unitPrice, "ราคาต่อหน่วย"],
      [item.lineTotal, "ยอดรวมรายการ"],
      [item.packagingSurchargePerUnit, "ค่าบรรจุภัณฑ์ต่อหน่วย"],
      [item.packagingSurchargeTotal, "ค่าบรรจุภัณฑ์รวม"],
    ].forEach(([value, label]) => assertMoney(value, label as string));
    if (!isRecord(item.priceBreakdown)) fail("รายละเอียดราคาไม่ถูกต้อง");
    if (
      !hasOnlyKeys(item.priceBreakdown, priceBreakdownKeys) ||
      !hasAllKeys(item.priceBreakdown, priceBreakdownKeys)
    )
      fail("รายละเอียดราคามีข้อมูลที่ไม่รองรับหรือข้อมูลไม่ครบ");
    priceBreakdownKeys.forEach((key) =>
      assertMoney(item.priceBreakdown?.[key], `รายละเอียดราคา ${key}`),
    );
    if (item.lineTotal !== item.unitPrice * item.quantity)
      fail("ยอดรวมรายการไม่ตรงกับราคาและจำนวน");
    const packagingSurchargePerUnit = item.packagingSurchargePerUnit as number;
    const packagingSurchargeTotal = item.packagingSurchargeTotal as number;
    if (packagingSurchargeTotal !== packagingSurchargePerUnit * item.quantity)
      fail("ค่าบรรจุภัณฑ์รวมไม่ถูกต้อง");
    if (
      item.unitPrice !==
      item.priceBreakdown.unitPrice + packagingSurchargePerUnit
    )
      fail("ราคาต่อหน่วยไม่ตรงกับรายละเอียดราคา");
    subtotal += item.lineTotal;
  });
  if (units > customerRequestLimits.maxTotalUnits)
    fail(
      `คำขอหนึ่งครั้งสั่งได้ไม่เกิน ${customerRequestLimits.maxTotalUnits} ถ้วย`,
    );
  if (!Number.isInteger(request.itemCount) || request.itemCount !== units)
    fail("จำนวนสินค้ารวมไม่ถูกต้อง");
  assertMoney(request.subtotal, "ยอดรวมก่อนส่วนลด");
  assertMoney(request.total, "ยอดรวมคำขอ");
  if (request.subtotal !== subtotal || request.total !== subtotal)
    fail("ยอดรวมคำขอไม่ตรงกับรายการสินค้า");
}

export function assertCustomerRequestStructuralPolicy(
  request: CustomerOrderRequest,
): void {
  assertCustomerRequestPolicy(request, [], {
    allowLegacyPending: true,
    requireSubmittedAt:
      request.schemaVersion === customerRequestSchemaVersion &&
      Object.hasOwn(request, "submittedAt"),
    skipProductLimits: true,
  });
}

export function requestPolicyMessage(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "คำขอไม่เป็นไปตามข้อจำกัดของร้าน";
}

export type CustomerRequestPolicyItem = CartItem;
