import {
  businessDate,
  createOrder,
  orderTotals,
  prepareOrderItems,
} from "./lib";
import { toppings } from "./data";
import type {
  CartItem,
  CustomerOrderRequest,
  CustomerRequestStatus,
  PaymentMethod,
  Product,
  ShopOrder,
  ToppingAvailability,
} from "./types";

export const customerStorefrontChannel = "หน้าร้าน" as const;
export const waitingForShop = "รอร้านยืนยัน" as const;
export const customerPaymentMethods: Exclude<PaymentMethod, "Platform">[] = [
  "สด",
  "โอน",
  "โครงการ",
];

export function toCustomerPublicProduct(product: Product): Product {
  const price =
    product.channelPrices?.[customerStorefrontChannel] ?? product.price;
  return {
    id: product.id,
    name: product.name,
    price,
    emoji: product.emoji,
    description: product.description,
    optionMode: product.optionMode,
    includedToppings: product.includedToppings,
    granolaOptions: product.granolaOptions,
    availableToppingIds: product.availableToppingIds,
    premiumToppingIds: product.premiumToppingIds,
    premiumIncludedSurcharge: product.premiumIncludedSurcharge,
    extraNormalPrice: product.extraNormalPrice,
    extraPremiumPrice: product.extraPremiumPrice,
    active: product.active,
    channelPrices: { [customerStorefrontChannel]: price },
  };
}

export function createCustomerRequest(
  id: string,
  ownerUid: string,
  items: CartItem[],
  products: Product[],
  availability: ToppingAvailability,
  input: { customerName?: string; customerNote?: string } = {},
  now = new Date().toISOString(),
): CustomerOrderRequest {
  if (!ownerUid) throw new Error("ไม่พบตัวตนลูกค้า");
  const prepared = prepareOrderItems(
    items,
    products,
    customerStorefrontChannel,
    toppings,
    availability,
  );
  if (!prepared.length) throw new Error("ตะกร้าว่าง");
  const totals = orderTotals(prepared);
  return {
    id,
    ownerUid,
    status: waitingForShop,
    channel: customerStorefrontChannel,
    ...(input.customerName?.trim()
      ? { customerName: input.customerName.trim() }
      : {}),
    ...(input.customerNote?.trim()
      ? { customerNote: input.customerNote.trim() }
      : {}),
    items: prepared,
    subtotal: totals.subtotal,
    total: totals.total,
    itemCount: prepared.reduce((sum, item) => sum + item.quantity, 0),
    createdAt: now,
    updatedAt: now,
  };
}

export function customerStatusLabel(status: CustomerRequestStatus): string {
  return status;
}

export function rejectCustomerRequest(
  request: CustomerOrderRequest,
  reason?: string,
  now = new Date().toISOString(),
): CustomerOrderRequest {
  if (request.status !== waitingForShop)
    throw new Error("คำขอนี้ไม่รอการยืนยันแล้ว");
  return {
    ...request,
    status: "ปฏิเสธ",
    ...(reason?.trim() ? { rejectionReason: reason.trim() } : {}),
    rejectedAt: now,
    updatedAt: now,
  };
}

export function confirmCustomerRequest(
  request: CustomerOrderRequest,
  paymentMethod: PaymentMethod,
  sequence: number,
  staffUid?: string,
  now = new Date().toISOString(),
): { request: CustomerOrderRequest; order: ShopOrder } {
  if (request.status !== waitingForShop || request.confirmedOrderId)
    throw new Error("คำขอนี้ได้รับการดำเนินการแล้ว");
  if (
    !customerPaymentMethods.includes(
      paymentMethod as Exclude<PaymentMethod, "Platform">,
    )
  )
    throw new Error("วิธีชำระเงินไม่ถูกต้องสำหรับออเดอร์ QR");
  const padded = String(sequence).padStart(3, "0");
  const id = `${businessDate(new Date(now)).replaceAll("-", "")}-${padded}`;
  const order = createOrder(
    {
      customerName: request.customerName ?? "ลูกค้าทั่วไป",
      channel: customerStorefrontChannel,
      paymentMethod,
      items: request.items,
    },
    id,
    `Q${padded}`,
    staffUid,
  );
  const updated: CustomerOrderRequest = {
    ...request,
    status: "ร้านรับออเดอร์แล้ว",
    confirmedOrderId: order.id,
    queueNumber: order.queueNumber,
    paymentMethod: paymentMethod as Exclude<PaymentMethod, "Platform">,
    confirmedAt: now,
    updatedAt: now,
  };
  return { request: updated, order };
}
