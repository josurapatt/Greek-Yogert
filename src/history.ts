import { orderPaymentMethods } from "./lib";
import type { PaymentMethod, ShopOrder } from "./types";

export type HistoryPaymentFilter = "all" | "missing" | PaymentMethod;

export interface HistoryFilters {
  query: string;
  date: string;
  status: "all" | ShopOrder["status"];
  paymentMethod: HistoryPaymentFilter;
}

export function filterHistoryOrders(
  orders: ShopOrder[],
  filters: HistoryFilters,
): ShopOrder[] {
  const query = filters.query.trim().toLowerCase();
  return orders
    .filter((order) => order.status !== "pending")
    .filter((order) => !filters.date || order.businessDate === filters.date)
    .filter(
      (order) => filters.status === "all" || order.status === filters.status,
    )
    .filter(
      (order) =>
        filters.paymentMethod === "all" ||
        (filters.paymentMethod === "missing"
          ? orderPaymentMethods(order).length === 0
          : orderPaymentMethods(order).includes(filters.paymentMethod)),
    )
    .filter(
      (order) =>
        !query ||
        `${order.queueNumber} ${order.customerName} ${order.id}`
          .toLowerCase()
          .includes(query),
    );
}
