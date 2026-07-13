import { toppings } from "./data";
import { customerStorefrontChannel } from "./customerOrder";
import { orderTotals, prepareOrderItems } from "./lib";
import type {
  CartItem,
  CustomerOrderRequest,
  Product,
  ToppingAvailability,
} from "./types";

const mismatchPrefix = "คำขอไม่ตรงกับเมนูปัจจุบัน";

function mismatch(reason: string): never {
  throw new Error(`${mismatchPrefix}: ${reason}`);
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function canonicalOptionLabels(product: Product, ids: string[]): string[] {
  if (product.optionMode === "toppings") {
    return ids.map((id) => {
      const topping = toppings.find((entry) => entry.id === id);
      if (!topping) mismatch("พบรหัสท็อปปิ้งที่ไม่รู้จัก");
      if (!product.availableToppingIds.includes(id))
        mismatch("ท็อปปิ้งนี้ไม่รองรับสำหรับสินค้า");
      return topping.name;
    });
  }
  if (product.optionMode === "granola") {
    return ids.map((id) => {
      if (!product.granolaOptions.includes(id))
        mismatch("ตัวเลือกกราโนล่าไม่อยู่ในเมนูปัจจุบัน");
      return id;
    });
  }
  if (ids.length) mismatch("สินค้านี้ไม่มีตัวเลือกเพิ่มเติม");
  return [];
}

function assertSnapshotMatches(submitted: CartItem, canonical: CartItem): void {
  const exactFields: Array<keyof CartItem> = [
    "productId",
    "productName",
    "basePrice",
    "selectedOptions",
    "selectedOptionIds",
    "quantity",
    "selectedChannel",
    "priceBreakdown",
    "unitPrice",
    "lineTotal",
    "toppingPackaging",
    "toppingPackagingLabel",
    "packagingSurchargePerUnit",
    "packagingSurchargeTotal",
  ];
  const different = exactFields.find(
    (field) => !sameValue(submitted[field], canonical[field]),
  );
  if (different)
    mismatch(`ข้อมูลรายการ ${different} ไม่ตรงกับข้อมูลที่เชื่อถือได้`);
}

export interface TrustedCustomerConfirmation {
  items: CartItem[];
  subtotal: number;
  total: number;
  itemCount: number;
}

/**
 * Rebuilds a pending Customer request exclusively from current private
 * configuration. The request snapshot is accepted only when it exactly equals
 * the trusted reconstruction; callers must run this inside their transaction.
 */
export function rebuildTrustedCustomerConfirmation(
  request: CustomerOrderRequest,
  privateProducts: Product[],
  availability: ToppingAvailability,
): TrustedCustomerConfirmation {
  if (request.channel !== customerStorefrontChannel)
    mismatch("ช่องทางการสั่งซื้อไม่ใช่หน้าร้าน");
  if (!Array.isArray(request.items) || !request.items.length)
    mismatch("ไม่มีรายการสินค้า");

  const products = new Map(
    privateProducts.map((product) => [product.id, product]),
  );
  const ids = new Set<string>();
  const items = request.items.map((submitted) => {
    if (!submitted.id || ids.has(submitted.id))
      mismatch("รหัสรายการไม่ถูกต้อง");
    ids.add(submitted.id);
    if (!submitted.productId) mismatch("รหัสสินค้าไม่ถูกต้อง");
    if (!Number.isInteger(submitted.quantity) || submitted.quantity <= 0)
      mismatch("จำนวนสินค้าต้องเป็นจำนวนเต็มบวก");
    if (!Array.isArray(submitted.selectedOptionIds))
      mismatch("รูปแบบตัวเลือกสินค้าไม่ถูกต้อง");

    const product = products.get(submitted.productId);
    if (!product) mismatch("ไม่พบสินค้าในเมนูปัจจุบัน");
    if (!product.active) mismatch("สินค้านี้ปิดการขายแล้ว");
    const selectedOptions = canonicalOptionLabels(
      product,
      submitted.selectedOptionIds,
    );
    let canonical: CartItem;
    try {
      [canonical] = prepareOrderItems(
        [
          {
            id: submitted.id,
            productId: product.id,
            productName: product.name,
            basePrice: product.price,
            selectedOptions,
            selectedOptionIds: submitted.selectedOptionIds,
            quantity: submitted.quantity,
            unitPrice: 0,
            selectedChannel: customerStorefrontChannel,
            toppingPackaging: submitted.toppingPackaging,
          },
        ],
        [product],
        customerStorefrontChannel,
        toppings,
        availability,
      );
    } catch (cause) {
      mismatch(
        cause instanceof Error ? cause.message : "ตัวเลือกสินค้าไม่ถูกต้อง",
      );
    }
    if (canonical.packagingSurchargePerUnit !== 0)
      mismatch("คำขอลูกค้าต้องไม่มีค่าบริการแยกท็อปปิ้ง");
    assertSnapshotMatches(submitted, canonical);
    return canonical;
  });

  const totals = orderTotals(items);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  if (request.subtotal !== totals.subtotal)
    mismatch("ยอดรวมก่อนส่วนลดไม่ตรงกัน");
  if (request.total !== totals.total) mismatch("ยอดรวมไม่ตรงกัน");
  if (request.itemCount !== itemCount) mismatch("จำนวนรายการไม่ตรงกัน");
  return { items, subtotal: totals.subtotal, total: totals.total, itemCount };
}
