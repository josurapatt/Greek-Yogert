import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { normalizeProduct } from "../src/data";
import { rebuildTrustedCustomerConfirmation } from "../src/trustedCustomerConfirmation";
import type {
  CustomerOrderRequest,
  Product,
  ShopOrder,
  ToppingAvailability,
} from "../src/types";

const projectId = process.env.CUSTOMER_UAT_FIREBASE_PROJECT_ID;
if (projectId !== "greek-yogert-customer-uat-2026")
  throw new Error(
    "WP3 Human UAT diagnostics require the exact isolated UAT project",
  );

if (!getApps().length)
  initializeApp({ credential: applicationDefault(), projectId });
const firestore = getFirestore();

const safeItem = (item: CustomerOrderRequest["items"][number]) => ({
  id: item.id,
  productId: item.productId,
  productName: item.productName,
  selectedOptions: item.selectedOptions,
  selectedOptionIds: item.selectedOptionIds,
  quantity: item.quantity,
  selectedChannel: item.selectedChannel,
  basePrice: item.basePrice,
  priceBreakdown: item.priceBreakdown,
  unitPrice: item.unitPrice,
  lineTotal: item.lineTotal,
  toppingPackaging: item.toppingPackaging,
  toppingPackagingLabel: item.toppingPackagingLabel,
  packagingSurchargePerUnit: item.packagingSurchargePerUnit,
  packagingSurchargeTotal: item.packagingSurchargeTotal,
});

async function inspect(label: string) {
  const requestRows = await firestore
    .collection("customerOrderRequests")
    .where("customerName", "==", label)
    .get();
  if (requestRows.empty) return { label, found: false };
  if (requestRows.size !== 1)
    throw new Error(`Expected exactly one preserved ${label} request`);

  const request = requestRows.docs[0].data() as CustomerOrderRequest;
  const productIds = [...new Set(request.items.map((item) => item.productId))];
  const productRows = await Promise.all(
    productIds.map((id) => firestore.doc(`products/${id}`).get()),
  );
  const privateProducts = productRows.flatMap((row) =>
    row.exists ? [normalizeProduct(row.data() as Product)] : [],
  );
  const availabilityRow = await firestore
    .doc("settings/toppingAvailability")
    .get();
  const availability = (availabilityRow.data()?.availability ??
    {}) as ToppingAvailability;

  let trustedComparison: { status: "accepted" | "rejected"; message?: string };
  try {
    rebuildTrustedCustomerConfirmation(request, privateProducts, availability);
    trustedComparison = { status: "accepted" };
  } catch (cause) {
    trustedComparison = {
      status: "rejected",
      message: cause instanceof Error ? cause.message : "unknown safe mismatch",
    };
  }

  const matchingOrders = await firestore
    .collection("orders")
    .where("customerName", "==", label)
    .get();
  const orders = matchingOrders.docs.map((row) => {
    const order = row.data() as ShopOrder;
    return {
      id: order.id,
      queueNumber: order.queueNumber,
      status: order.status,
      createdAt: order.createdAt,
    };
  });

  return {
    label,
    found: true,
    request: {
      id: request.id,
      status: request.status,
      channel: request.channel,
      itemCount: request.itemCount,
      subtotal: request.subtotal,
      total: request.total,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      confirmedOrderId: request.confirmedOrderId ?? null,
      queueNumber: request.queueNumber ?? null,
      paymentMethod: request.paymentMethod ?? null,
      paymentMethods: request.paymentMethods ?? [],
      linePaymentMethods: request.linePaymentMethods ?? {},
      items: request.items.map(safeItem),
    },
    trustedComparison,
    matchingOrders: orders,
    matchingOrderCount: orders.length,
    diagnosticWrites: 0,
  };
}

console.log(
  JSON.stringify({
    projectId,
    mode: "read-only",
    human: await inspect("WP3-HUMAN-UAT"),
    negativeControl: await inspect("WP3-AUTO-1783938043929"),
  }),
);
