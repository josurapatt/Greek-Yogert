import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCustomerRequest } from "./customerOrder";
import { defaultProducts } from "./data";
import { businessDate } from "./lib";
import type { CartItem } from "./types";

const firestoreMocks = vi.hoisted(() => ({
  collection: vi.fn((_firestore: unknown, ...segments: string[]) =>
    segments.join("/"),
  ),
  doc: vi.fn((reference: unknown, ...segments: string[]) =>
    segments.length ? segments.join("/") : `${String(reference)}/audit-id`,
  ),
  getDoc: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
  setDoc: vi.fn(),
}));

vi.mock("firebase/firestore", () => firestoreMocks);

import { confirmCustomerRequestTransaction } from "./customerRequestActions";

const apple = defaultProducts.find((product) => product.id === "apple-ohlala")!;

function appleItem(): CartItem {
  return {
    id: "cart-1",
    productId: apple.id,
    productName: apple.name,
    basePrice: 69,
    selectedOptions: ["กราโนล่ารสกล้วย"],
    selectedOptionIds: ["กล้วย"],
    selectedChannel: "หน้าร้าน",
    quantity: 1,
    unitPrice: 69,
    lineTotal: 69,
  };
}

function request() {
  return createCustomerRequest(
    "WP3-AUTO-request-1",
    "WP3-AUTO-anonymous-uid",
    [appleItem()],
    defaultProducts,
    {},
  );
}

function snapshot(value: unknown) {
  return {
    exists: () => value !== undefined,
    data: () => value,
  };
}

describe("trusted Customer confirmation Firestore transaction", () => {
  const firestore = {} as never;
  const set = vi.fn();
  let documents: Map<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    documents = new Map<string, unknown>([
      ["counters/" + businessDate(), { lastSequence: 0 }],
      ["settings/toppingAvailability", { availability: {} }],
      ["products/" + apple.id, apple],
    ]);
    firestoreMocks.runTransaction.mockImplementation(
      async (_firestore: unknown, action: (transaction: unknown) => unknown) =>
        action({
          get: async (path: string) => snapshot(documents.get(path)),
          set,
        }),
    );
  });

  it("writes the counter, trusted order, and request linkage in one transaction", async () => {
    documents.set("customerOrderRequests/WP3-AUTO-request-1", request());

    await confirmCustomerRequestTransaction(
      firestore,
      "WP3-AUTO-request-1",
      "สด",
      "WP3-AUTO-staff-uid",
    );

    expect(firestoreMocks.runTransaction).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledTimes(4);
    expect(set.mock.calls.map(([path]) => path)).toEqual([
      "counters/" + businessDate(),
      expect.stringMatching(/^orders\//),
      "customerOrderRequests/WP3-AUTO-request-1",
      expect.stringMatching(/^customerOrderingAuditEvents\//),
    ]);
    const order = set.mock.calls[1][1];
    const linkedRequest = set.mock.calls[2][1];
    expect(order.items[0].productName).toBe(apple.name);
    expect(order.items[0].unitPrice).toBe(69);
    expect(linkedRequest.status).toBe("ร้านรับออเดอร์แล้ว");
    expect(linkedRequest.confirmedOrderId).toBe(order.id);
    expect(linkedRequest.queueNumber).toBe(order.queueNumber);
  });

  it("returns a safe mismatch and schedules no queue, order, or request write", async () => {
    const forged = request();
    forged.items[0].unitPrice = 1;
    documents.set("customerOrderRequests/WP3-AUTO-request-1", forged);

    await expect(
      confirmCustomerRequestTransaction(
        firestore,
        "WP3-AUTO-request-1",
        "สด",
        "WP3-AUTO-staff-uid",
      ),
    ).rejects.toThrow("คำขอไม่ตรงกับเมนูปัจจุบัน");

    expect(firestoreMocks.runTransaction).toHaveBeenCalledOnce();
    expect(set).not.toHaveBeenCalled();
    expect(firestoreMocks.setDoc).toHaveBeenCalledOnce();
    expect(forged.status).toBe("รอร้านยืนยัน");
    expect(forged.confirmedOrderId).toBeUndefined();
    expect(forged.queueNumber).toBeUndefined();
  });
});
