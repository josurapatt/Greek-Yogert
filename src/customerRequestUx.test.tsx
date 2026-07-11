import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import PendingBadge from "./components/PendingBadge";
import QueueOrderCard from "./components/QueueOrderCard";
import {
  pendingCustomerRequests,
  removeCustomerRequest,
} from "./customerRequests";
import { isCustomerRoute, orderDetailBackPath } from "./routes";
import type { CartItem, CustomerOrderRequest, ShopOrder } from "./types";

afterEach(cleanup);
const line: CartItem = {
  id: "line-1",
  productId: "plain-greek",
  productName: "Plain Greek",
  basePrice: 59,
  selectedOptions: [],
  selectedOptionIds: [],
  quantity: 1,
  unitPrice: 59,
  lineTotal: 59,
};
const order: ShopOrder = {
  id: "20260711-001",
  queueNumber: "Q001",
  businessDate: "2026-07-11",
  customerName: "ลูกค้า",
  channel: "หน้าร้าน",
  paymentMethod: "สด",
  status: "pending",
  items: [line],
  subtotal: 59,
  discount: 0,
  total: 59,
  createdAt: "2026-07-11T00:00:00.000Z",
  updatedAt: "2026-07-11T00:00:00.000Z",
};
const request = (
  id: string,
  status: CustomerOrderRequest["status"],
): CustomerOrderRequest => ({
  id,
  ownerUid: "customer",
  status,
  channel: "หน้าร้าน",
  items: [line],
  subtotal: 59,
  total: 59,
  itemCount: 1,
  createdAt: "2026-07-11T00:00:00.000Z",
  updatedAt: "2026-07-11T00:00:00.000Z",
});

describe("staff route boundaries", () => {
  it("opens a queue card on the staff detail route, never the customer order route", () => {
    render(
      <MemoryRouter>
        <QueueOrderCard order={order} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link").getAttribute("href")).toBe(
      "/orders/20260711-001",
    );
    expect(isCustomerRoute("/orders/20260711-001")).toBe(false);
    expect(isCustomerRoute("/order")).toBe(true);
  });
  it("returns pending order details to Queue", () => {
    expect(orderDetailBackPath("pending")).toBe("/queue");
    expect(orderDetailBackPath("completed")).toBe("/history");
  });
});

describe("pending customer-request indicator", () => {
  it("shows the pending count and hides the zero state", () => {
    const { rerender } = render(<PendingBadge count={2} />);
    expect(screen.getByText("2")).toBeTruthy();
    rerender(<PendingBadge count={0} />);
    expect(screen.queryByText("0")).toBeNull();
  });
  it("counts only waiting requests and removes confirmed/rejected cards immediately", () => {
    const rows = [
      request("pending", "รอร้านยืนยัน"),
      request("confirmed", "ร้านรับออเดอร์แล้ว"),
      request("rejected", "ปฏิเสธ"),
    ];
    expect(pendingCustomerRequests(rows).map((entry) => entry.id)).toEqual([
      "pending",
    ]);
    expect(
      removeCustomerRequest(rows, "pending").map((entry) => entry.id),
    ).toEqual(["confirmed", "rejected"]);
  });
});
