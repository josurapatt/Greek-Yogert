import { describe, expect, it } from "vitest";
import { defaultProducts } from "./data";
import {
  confirmCustomerRequest,
  createCustomerRequest,
  rejectCustomerRequest,
  waitingForShop,
} from "./customerOrder";
import type { CartItem } from "./types";

const apple = defaultProducts.find((product) => product.id === "apple-ohlala")!;
const cartItem = (): CartItem => ({
  id: "cart-1",
  productId: apple.id,
  productName: apple.name,
  basePrice: 69,
  selectedOptions: ["กล้วย"],
  selectedOptionIds: ["กล้วย"],
  selectedChannel: "หน้าร้าน",
  quantity: 1,
  unitPrice: 69,
  lineTotal: 69,
});

describe("customer QR request lifecycle", () => {
  it("always creates a storefront request without payment or queue number", () => {
    const request = createCustomerRequest(
      "request-1",
      "anonymous-uid",
      [cartItem()],
      defaultProducts,
      {},
    );
    expect(request.channel).toBe("หน้าร้าน");
    expect(request.status).toBe(waitingForShop);
    expect(request.queueNumber).toBeUndefined();
    expect(request.paymentMethod).toBeUndefined();
    expect(request.total).toBe(69);
  });
  it("blocks stale sold-out selections before request submission", () => {
    expect(() =>
      createCustomerRequest(
        "request-1",
        "anonymous-uid",
        [cartItem()],
        defaultProducts,
        { "granola-banana": false },
      ),
    ).toThrow("หมด");
  });
  it("uses storefront duplicate topping rules and snapshots line totals", () => {
    const sizeS = defaultProducts.find((product) => product.id === "size-s")!;
    const item: CartItem = {
      ...cartItem(),
      productId: sizeS.id,
      productName: sizeS.name,
      selectedOptions: ["กล้วย", "กล้วย", "แอปเปิ้ล"],
      selectedOptionIds: ["banana", "banana", "apple"],
      unitPrice: 89,
      lineTotal: 89,
    };
    const request = createCustomerRequest(
      "request-1",
      "anonymous-uid",
      [item],
      defaultProducts,
      {},
    );
    expect(request.items[0].selectedOptionIds).toEqual([
      "banana",
      "banana",
      "apple",
    ]);
    expect(request.total).toBe(89);
  });
  it("confirms exactly once with a non-platform payment and one queue number", () => {
    const request = createCustomerRequest(
      "request-1",
      "anonymous-uid",
      [cartItem()],
      defaultProducts,
      {},
    );
    const result = confirmCustomerRequest(
      request,
      "โอน",
      7,
      "staff-uid",
      "2026-07-11T10:00:00.000Z",
    );
    expect(result.order.queueNumber).toBe("Q007");
    expect(result.order.channel).toBe("หน้าร้าน");
    expect(result.request.confirmedOrderId).toBe(result.order.id);
    expect(() => confirmCustomerRequest(result.request, "โอน", 8)).toThrow(
      "ดำเนินการแล้ว",
    );
    expect(() => confirmCustomerRequest(request, "Platform" as never, 7)).toThrow(
      "ไม่ถูกต้อง",
    );
  });
  it("quick confirmation applies one payment method to every line", () => {
    const request = createCustomerRequest("request-1", "anonymous-uid", [cartItem(), { ...cartItem(), id: "cart-2" }], defaultProducts, {});
    const result = confirmCustomerRequest(request, "สด", 1);
    expect(result.order.items.map((item) => item.paymentMethod)).toEqual(["สด", "สด"]);
    expect(result.order.paymentMethods).toEqual(["สด"]);
  });
  it("detail confirmation supports different payment methods per line", () => {
    const request = createCustomerRequest("request-1", "anonymous-uid", [cartItem(), { ...cartItem(), id: "cart-2" }], defaultProducts, {});
    const result = confirmCustomerRequest(request, { "cart-1": "สด", "cart-2": "โอน" }, 1);
    expect(result.order.items.map((item) => item.paymentMethod)).toEqual(["สด", "โอน"]);
    expect(result.order.paymentMethods).toEqual(["สด", "โอน"]);
    expect(result.request.paymentMethods).toEqual(["สด", "โอน"]);
  });
  it("blocks confirmation when any line has no valid staff payment method", () => {
    const request = createCustomerRequest("request-1", "anonymous-uid", [cartItem(), { ...cartItem(), id: "cart-2" }], defaultProducts, {});
    expect(() => confirmCustomerRequest(request, { "cart-1": "สด" }, 1)).toThrow("กรุณาเลือกวิธีชำระเงิน");
    expect(() => confirmCustomerRequest(request, { "cart-1": "Platform" as never, "cart-2": "สด" }, 1)).toThrow("กรุณาเลือกวิธีชำระเงิน");
  });
  it("rejects without creating a queue reference", () => {
    const request = createCustomerRequest(
      "request-1",
      "anonymous-uid",
      [cartItem()],
      defaultProducts,
      {},
    );
    const rejected = rejectCustomerRequest(request, "สินค้าหมด");
    expect(rejected.status).toBe("ปฏิเสธ");
    expect(rejected.queueNumber).toBeUndefined();
    expect(rejected.rejectionReason).toBe("สินค้าหมด");
  });
});
