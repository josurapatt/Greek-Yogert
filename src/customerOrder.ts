import {
  businessDate,
  createOrder,
  orderTotals,
  prepareOrderItems,
} from "./lib";
import { toppings } from "./data";
import {
  assertCustomerRequestPolicy,
  customerRequestSchemaVersion,
  productSelectedOptionLimits,
} from "./customerRequestPolicy";
import type {
  CartItem,
  CustomerOrderRequest,
  CustomerRequestStatus,
  PublicCustomerProduct,
  Product,
  ShopOrder,
  StaffPaymentMethod,
  ToppingAvailability,
} from "./types";

export const customerStorefrontChannel = "หน้าร้าน" as const;
export const waitingForShop = "รอร้านยืนยัน" as const;
export const customerPaymentMethods: StaffPaymentMethod[] = [
  "สด",
  "โอน",
  "โครงการ",
];

export type StaffPaymentAllocation =
  | StaffPaymentMethod
  | Record<string, StaffPaymentMethod | undefined>;

export function applyCustomerLinePayments(
  items: CartItem[],
  allocation: StaffPaymentAllocation,
): CartItem[] {
  if (
    typeof allocation === "string" &&
    !customerPaymentMethods.includes(allocation)
  )
    throw new Error("วิธีชำระเงินไม่ถูกต้อง");
  return items.map((item) => {
    const paymentMethod =
      typeof allocation === "string" ? allocation : allocation[item.id];
    if (!customerPaymentMethods.includes(paymentMethod as StaffPaymentMethod))
      throw new Error(`กรุณาเลือกวิธีชำระเงินสำหรับ ${item.productName}`);
    return { ...item, paymentMethod: paymentMethod as StaffPaymentMethod };
  });
}

export function uniqueLinePaymentMethods(
  items: CartItem[],
): StaffPaymentMethod[] {
  return [
    ...new Set(
      items.flatMap((item) => (item.paymentMethod ? [item.paymentMethod] : [])),
    ),
  ];
}

export function customerOptionLabels(
  product: Product,
  selectedOptionIds: string[],
): string[] {
  if (product.optionMode === "granola")
    return selectedOptionIds.map((name) => `กราโนล่ารส${name}`);
  if (product.optionMode === "toppings")
    return selectedOptionIds.map(
      (id) => toppings.find((entry) => entry.id === id)?.name ?? id,
    );
  return [];
}

export function toCustomerPublicProduct(
  product: Product,
): PublicCustomerProduct {
  const price =
    product.channelPrices?.[customerStorefrontChannel] ?? product.price;
  return {
    id: product.id,
    name: product.name,
    emoji: product.emoji,
    description: product.description,
    active: product.active,
    storefrontPrice: price,
    optionMode: product.optionMode,
    includedToppings: product.includedToppings,
    maxSelectedOptions: productSelectedOptionLimits(product).maximum,
    granolaOptions: product.granolaOptions,
    availableToppingIds: product.availableToppingIds,
    ...(product.premiumToppingIds
      ? { premiumToppingIds: product.premiumToppingIds }
      : {}),
    premiumIncludedSurcharge: product.premiumIncludedSurcharge,
    extraNormalPrice: product.extraNormalPrice,
    extraPremiumPrice: product.extraPremiumPrice,
    supportsSeparatedToppingPackaging:
      product.supportsSeparatedToppingPackaging !== false,
  };
}

/** Converts the public whitelist back into the storefront-only view used by the Customer UI. */
export function customerPublicProductToProduct(
  product: PublicCustomerProduct,
): Product {
  return {
    id: product.id,
    name: product.name,
    price: product.storefrontPrice,
    emoji: product.emoji,
    description: product.description,
    active: product.active,
    optionMode: product.optionMode,
    includedToppings: product.includedToppings,
    maxSelectedOptions: product.maxSelectedOptions,
    granolaOptions: product.granolaOptions,
    availableToppingIds: product.availableToppingIds,
    ...(product.premiumToppingIds
      ? { premiumToppingIds: product.premiumToppingIds }
      : {}),
    premiumIncludedSurcharge: product.premiumIncludedSurcharge,
    extraNormalPrice: product.extraNormalPrice,
    extraPremiumPrice: product.extraPremiumPrice,
    supportsSeparatedToppingPackaging:
      product.supportsSeparatedToppingPackaging,
    channelPrices: { [customerStorefrontChannel]: product.storefrontPrice },
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
  const request: CustomerOrderRequest = {
    schemaVersion: customerRequestSchemaVersion,
    id,
    retryId: id,
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
  assertCustomerRequestPolicy(request, products);
  return request;
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
  paymentAllocation: StaffPaymentAllocation,
  sequence: number,
  staffUid?: string,
  now = new Date().toISOString(),
  trustedItems: CartItem[] = request.items,
): { request: CustomerOrderRequest; order: ShopOrder } {
  if (request.status !== waitingForShop || request.confirmedOrderId)
    throw new Error("คำขอนี้ได้รับการดำเนินการแล้ว");
  const paidItems = applyCustomerLinePayments(trustedItems, paymentAllocation);
  const paymentMethods = uniqueLinePaymentMethods(paidItems);
  const paymentMethod = paymentMethods[0];
  const padded = String(sequence).padStart(3, "0");
  const id = `${businessDate(new Date(now)).replaceAll("-", "")}-${padded}`;
  const order = createOrder(
    {
      customerName: request.customerName ?? "ลูกค้าทั่วไป",
      channel: customerStorefrontChannel,
      paymentMethod,
      items: paidItems,
    },
    id,
    `Q${padded}`,
    staffUid,
  );
  order.items = paidItems;
  order.paymentMethods = paymentMethods;
  const updated: CustomerOrderRequest = {
    ...request,
    status: "ร้านรับออเดอร์แล้ว",
    confirmedOrderId: order.id,
    queueNumber: order.queueNumber,
    paymentMethod,
    paymentMethods,
    linePaymentMethods: Object.fromEntries(
      paidItems.map((item) => [
        item.id,
        item.paymentMethod as StaffPaymentMethod,
      ]),
    ),
    confirmedAt: now,
    updatedAt: now,
  };
  return { request: updated, order };
}
