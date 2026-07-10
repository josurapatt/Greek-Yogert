import { describe, expect, it } from "vitest";
import {
  defaultProducts,
  mergeProducts,
  normalizeProduct,
  toppings,
} from "./data";
import {
  calculateUnitPrice,
  createOrder,
  getChannelRules,
  getProductPrice,
  nextLocalQueue,
  orderTotals,
  prepareOrderItems,
  priceCartItem,
  repriceCartItems,
  validateSelection,
} from "./lib";
import type { CartItem, OrderChannel, Product } from "./types";
import { buildOrderExportRows, completedSalesSummary } from "./reporting";

const product = (id: string) =>
  defaultProducts.find((entry) => entry.id === id)!;
const sizeS = product("size-s");
const plainGranola = product("plain-granola");
const expectedStorefront: Record<string, number> = {
  "apple-ohlala": 69,
  "healthy-banana": 79,
  "plain-greek": 59,
  "size-s": 89,
  "size-m": 99,
  "plain-granola": 10,
};
const expectedPlatform: Record<string, number> = {
  "apple-ohlala": 89,
  "healthy-banana": 99,
  "plain-greek": 79,
  "size-s": 109,
  "size-m": 119,
  "plain-granola": 10,
};

const cartItem = (
  selectedOptionIds: string[],
  channel: OrderChannel = "หน้าร้าน",
): CartItem =>
  priceCartItem(
    {
      id: "item-1",
      productId: sizeS.id,
      productName: sizeS.name,
      basePrice: sizeS.price,
      selectedOptionIds,
      selectedOptions: selectedOptionIds,
      quantity: 1,
      unitPrice: sizeS.price,
    },
    sizeS,
    channel,
    toppings,
  );

describe("channel prices", () => {
  it("uses storefront prices for every product", () => {
    Object.entries(expectedStorefront).forEach(([id, price]) =>
      expect(getProductPrice(product(id), "หน้าร้าน")).toBe(price),
    );
  });
  it("keeps Openchat prices equal to storefront", () => {
    defaultProducts.forEach((entry) =>
      expect(getProductPrice(entry, "Openchat")).toBe(
        getProductPrice(entry, "หน้าร้าน"),
      ),
    );
  });
  it("uses LINE MAN prices for every product", () => {
    Object.entries(expectedPlatform).forEach(([id, price]) =>
      expect(getProductPrice(product(id), "Lineman")).toBe(price),
    );
  });
  it("keeps Grab prices equal to LINE MAN", () => {
    defaultProducts.forEach((entry) =>
      expect(getProductPrice(entry, "Grab")).toBe(
        getProductPrice(entry, "Lineman"),
      ),
    );
  });
  it("keeps Plain Granola at 10 THB on every channel", () => {
    (["หน้าร้าน", "Openchat", "Lineman", "Grab"] as OrderChannel[]).forEach(
      (channel) => expect(getProductPrice(plainGranola, channel)).toBe(10),
    );
  });
});

describe("product option rules", () => {
  it("requires exactly one Plain Granola flavor", () => {
    expect(validateSelection(plainGranola, [], "หน้าร้าน")).toBeTruthy();
    expect(validateSelection(plainGranola, ["กล้วย"], "Grab")).toBeNull();
    expect(
      validateSelection(plainGranola, ["กล้วย", "น้ำผึ้ง"], "Lineman"),
    ).toBeTruthy();
  });
  it("charges +5 for a storefront premium topping inside quota", () => {
    expect(
      calculateUnitPrice(
        sizeS,
        ["banana", "orange", "strawberry"],
        toppings,
        "หน้าร้าน",
      ),
    ).toBe(94);
  });
  it("charges +10 for a platform premium topping inside quota", () => {
    expect(
      calculateUnitPrice(
        sizeS,
        ["banana", "orange", "strawberry"],
        toppings,
        "Lineman",
      ),
    ).toBe(119);
  });
  it("allows storefront duplicate toppings", () => {
    expect(
      validateSelection(sizeS, ["banana", "banana", "apple"], "หน้าร้าน"),
    ).toBeNull();
  });
  it("rejects platform duplicate toppings", () => {
    expect(
      validateSelection(sizeS, ["banana", "banana", "apple"], "Grab"),
    ).toContain("ซ้ำ");
  });
  it("rejects platform normal extra toppings", () => {
    expect(
      validateSelection(
        sizeS,
        ["banana", "orange", "apple", "grape"],
        "Lineman",
      ),
    ).toContain("กราโนล่า");
  });
  it("allows platform extra granola at +10", () => {
    const selected = ["banana", "orange", "apple", "granola-honey"];
    expect(validateSelection(sizeS, selected, "Lineman")).toBeNull();
    expect(calculateUnitPrice(sizeS, selected, toppings, "Lineman")).toBe(119);
  });
  it("allows platform extra Biscoff at +10", () => {
    const selected = ["banana", "orange", "apple", "biscoff"];
    expect(validateSelection(sizeS, selected, "Grab")).toBeNull();
    expect(calculateUnitPrice(sizeS, selected, toppings, "Grab")).toBe(119);
  });
  it("keeps storefront extra normal and premium prices unchanged", () => {
    expect(
      calculateUnitPrice(
        sizeS,
        ["banana", "orange", "apple", "banana", "strawberry"],
        toppings,
        "หน้าร้าน",
      ),
    ).toBe(114);
  });
  it("uses platform rules with no duplicates and only approved extras", () => {
    const rules = getChannelRules(sizeS, "Lineman");
    expect(rules.allowDuplicateToppings).toBe(false);
    expect(rules.allowedExtraToppingIds).toContain("biscoff");
    expect(rules.allowedExtraToppingIds).not.toContain("grape");
  });
});

describe("cart conversion and snapshots", () => {
  it("recalculates storefront price when changing to LINE MAN", () => {
    const initial = cartItem(["banana", "orange", "apple"]);
    const converted = repriceCartItems(
      [initial],
      defaultProducts,
      "Lineman",
      toppings,
    )[0];
    expect(initial.unitPrice).toBe(89);
    expect(converted.unitPrice).toBe(109);
    expect(converted.selectedChannel).toBe("Lineman");
  });
  it("detects duplicates when changing to LINE MAN", () => {
    const converted = repriceCartItems(
      [cartItem(["banana", "banana", "apple"])],
      defaultProducts,
      "Lineman",
      toppings,
    )[0];
    expect(converted.validationError).toContain("ซ้ำ");
  });
  it("blocks order preparation when a cart item is invalid", () => {
    const invalid = cartItem(["banana", "banana", "apple"]);
    expect(() =>
      prepareOrderItems([invalid], defaultProducts, "Lineman", toppings),
    ).toThrow("ซ้ำ");
  });
  it("stores complete stable price snapshots on new order items", () => {
    const prepared = prepareOrderItems(
      [cartItem(["banana", "orange", "strawberry"], "Lineman")],
      defaultProducts,
      "Lineman",
      toppings,
    );
    const order = createOrder(
      {
        customerName: "",
        channel: "Lineman",
        paymentMethod: "Platform",
        items: prepared,
      },
      "20260710-001",
      "Q001",
    );
    expect(order.items[0].priceBreakdown).toEqual({
      basePrice: 109,
      premiumIncludedSurcharge: 10,
      extraToppingCharges: 0,
      unitPrice: 119,
    });
    expect(order.items[0].lineTotal).toBe(119);
    expect(order.items[0].selectedChannel).toBe("Lineman");
    const changedProduct = {
      ...sizeS,
      channelPrices: { ...sizeS.channelPrices, Lineman: 999 },
    };
    expect(getProductPrice(changedProduct, "Lineman")).toBe(999);
    expect(order.items[0].unitPrice).toBe(119);
  });
  it("keeps legacy order totals based on stored unit prices", () => {
    const legacy = {
      ...cartItem(["banana", "orange", "apple"]),
      unitPrice: 77,
      quantity: 2,
      priceBreakdown: undefined,
      lineTotal: undefined,
    };
    expect(orderTotals([legacy])).toEqual({
      subtotal: 154,
      discount: 0,
      total: 154,
    });
  });
});

describe("backward compatibility and queue behavior", () => {
  it("normalizes legacy known products with safe channel defaults", () => {
    const legacy = {
      ...sizeS,
      name: "Size S เดิม",
      premiumIncludedSurcharge: 7,
      extraNormalPrice: 12,
      extraPremiumPrice: 18,
      channelPrices: undefined,
      channelRules: undefined,
    } as Product;
    const normalized = normalizeProduct(legacy);
    expect(normalized.name).toBe("Size S เดิม");
    expect(getProductPrice(normalized, "หน้าร้าน")).toBe(89);
    expect(getProductPrice(normalized, "Lineman")).toBe(109);
    expect(
      getChannelRules(normalized, "หน้าร้าน").premiumIncludedSurcharge,
    ).toBe(7);
    expect(getChannelRules(normalized, "หน้าร้าน").extraNormalPrice).toBe(12);
  });
  it("keeps unknown legacy products at their stored price", () => {
    const legacy = normalizeProduct({
      ...product("plain-greek"),
      id: "legacy-custom",
      name: "Legacy",
      price: 42,
      channelPrices: undefined,
      channelRules: undefined,
    });
    expect(getProductPrice(legacy, "หน้าร้าน")).toBe(42);
    expect(getProductPrice(legacy, "Grab")).toBe(42);
  });
  it("merges the Plain Granola default without duplicating Healthy Banana", () => {
    const merged = mergeProducts(
      defaultProducts.filter((entry) => entry.id !== "plain-granola"),
    );
    expect(merged.filter((entry) => entry.id === "plain-granola")).toHaveLength(
      1,
    );
    expect(
      merged.filter((entry) => entry.id === "healthy-banana"),
    ).toHaveLength(1);
  });
  it("generates next daily queue and transforms a draft", () => {
    const first = createOrder(
      { customerName: "", channel: "หน้าร้าน", paymentMethod: "สด", items: [] },
      "20260710-001",
      "Q001",
    );
    expect(
      nextLocalQueue([{ ...first, businessDate: "2026-07-10" }], "2026-07-10"),
    ).toEqual({ sequence: 2, id: "20260710-002", queue: "Q002" });
    expect(first.customerName).toBe("ลูกค้าทั่วไป");
  });
});

describe("reports and export snapshots", () => {
  const orderWithStatus = (
    status: "pending" | "completed" | "cancelled",
    total: number,
  ) => ({
    ...createOrder(
      {
        customerName: "ลูกค้า",
        channel: "Lineman" as const,
        paymentMethod: "Platform" as const,
        items: [
          {
            ...cartItem(["banana", "orange", "apple"]),
            unitPrice: total,
            quantity: 2,
            lineTotal: undefined,
            priceBreakdown: undefined,
          },
        ],
      },
      `order-${status}`,
      "Q001",
    ),
    status,
    total,
  });

  it("keeps cancelled orders out of sales while retaining completed snapshots", () => {
    const completed = orderWithStatus("completed", 200);
    const cancelled = orderWithStatus("cancelled", 300);
    const summary = completedSalesSummary([completed, cancelled]);
    expect(summary.sales).toBe(200);
    expect(summary.cups).toBe(2);
  });

  it("exports completed and cancelled legacy snapshots without recalculating them", () => {
    const completed = orderWithStatus("completed", 200);
    const cancelled = orderWithStatus("cancelled", 300);
    const pending = orderWithStatus("pending", 400);
    const rows = buildOrderExportRows([completed, cancelled, pending]);
    expect(rows).toHaveLength(2);
    expect(rows[0]["ราคาต่อชิ้น"]).toBe(200);
    expect(rows[0]["ยอดรวมรายการ"]).toBe(400);
    expect(rows[0]["ช่องทางการขาย"]).toBe("LINE MAN");
    expect(rows[1]["สถานะ"]).toBe("ยกเลิก");
  });
});
