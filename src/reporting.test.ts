import { describe, expect, it } from "vitest";
import {
  aggregateSalesChannels,
  bangkokHour,
  normalizeSalesChannel,
} from "./reporting";
import type { CartItem, OrderChannel, PaymentMethod, ShopOrder } from "./types";

const item = (paymentMethod: CartItem["paymentMethod"] = "สด"): CartItem => ({
  id: crypto.randomUUID(),
  productId: "plain-greek",
  productName: "Plain Greek",
  basePrice: 59,
  selectedOptions: [],
  selectedOptionIds: [],
  quantity: 1,
  unitPrice: 59,
  lineTotal: 59,
  paymentMethod,
});

const order = (
  id: string,
  channel: OrderChannel,
  total: number,
  createdAt = "2026-07-12T01:30:00.000Z",
  status: ShopOrder["status"] = "completed",
): ShopOrder => ({
  id,
  queueNumber: `Q${id}`,
  businessDate: "2026-07-12",
  customerName: "ลูกค้า",
  channel,
  paymentMethod: "สด",
  status,
  items: [item()],
  subtotal: total,
  discount: 0,
  total,
  createdAt,
  updatedAt: createdAt,
});

describe("sales-channel reporting", () => {
  it("groups completed sales amount and order count by channel", () => {
    const report = aggregateSalesChannels([
      order("1", "หน้าร้าน", 100),
      order("2", "หน้าร้าน", 50),
      order("3", "Lineman", 200),
      order("4", "Grab", 300),
      order("5", "Openchat", 400),
      order("6", "Grab", 999, undefined, "cancelled"),
    ]);
    expect(report.channels).toEqual([
      { channel: "หน้าร้าน", sales: 150, orderCount: 2 },
      { channel: "Lineman", sales: 200, orderCount: 1 },
      { channel: "Grab", sales: 300, orderCount: 1 },
      { channel: "Openchat", sales: 400, orderCount: 1 },
    ]);
  });

  it("counts a mixed-payment order once under its sales channel", () => {
    const mixed = {
      ...order("mixed", "หน้าร้าน", 118),
      paymentMethod: "สด" as PaymentMethod,
      paymentMethods: ["สด", "โอน"] as const,
      items: [item("สด"), item("โอน")],
    } as ShopOrder;
    const storefront = aggregateSalesChannels([mixed]).channels[0];
    expect(storefront).toEqual({
      channel: "หน้าร้าน",
      sales: 118,
      orderCount: 1,
    });
  });

  it("normalizes readable legacy channel spellings", () => {
    expect(normalizeSalesChannel("LINE MAN")).toBe("Lineman");
    expect(normalizeSalesChannel("OpenChat")).toBe("Openchat");
    expect(normalizeSalesChannel("storefront")).toBe("หน้าร้าน");
  });

  it("separates missing and unknown legacy channels from known totals", () => {
    const missing = { ...order("missing", "Grab", 75), channel: undefined };
    const unknown = { ...order("unknown", "Grab", 25), channel: "Telephone" };
    const report = aggregateSalesChannels([
      missing as unknown as ShopOrder,
      unknown as unknown as ShopOrder,
    ]);
    expect(report.channels.every((entry) => entry.sales === 0)).toBe(true);
    expect(report.unknown).toEqual({ sales: 100, orderCount: 2 });
  });

  it("applies the supplied filtered order set", () => {
    const all = [
      order("in-range", "Grab", 120),
      order("outside-range", "Grab", 500),
    ];
    const filtered = aggregateSalesChannels(
      all.filter((entry) => entry.id === "in-range"),
    );
    expect(filtered.channels.find((entry) => entry.channel === "Grab")).toEqual(
      { channel: "Grab", sales: 120, orderCount: 1 },
    );
  });
});

describe("hourly stacked sales aggregation", () => {
  it("uses the local Thailand hour instead of UTC", () => {
    expect(bangkokHour("2026-07-12T01:30:00.000Z")).toBe(8);
    expect(
      aggregateSalesChannels([order("1", "Grab", 100)]).hourly[0].hour,
    ).toBe(8);
  });

  it("builds separate channel segments whose sum equals the hourly total", () => {
    const hour = aggregateSalesChannels([
      order("1", "หน้าร้าน", 400),
      order("2", "Lineman", 300),
      order("3", "Grab", 200),
      order("4", "Openchat", 100),
    ]).hourly[0];
    expect(hour.channels).toEqual({
      หน้าร้าน: 400,
      Lineman: 300,
      Grab: 200,
      Openchat: 100,
    });
    expect(hour.total).toBe(1000);
    expect(
      Object.values(hour.channels).reduce((sum, value) => sum + value, 0),
    ).toBe(hour.total);
  });

  it("sorts multiple local-hour buckets chronologically", () => {
    const report = aggregateSalesChannels([
      order("late", "Grab", 100, "2026-07-12T04:00:00.000Z"),
      order("early", "Grab", 100, "2026-07-12T01:00:00.000Z"),
      order("middle", "Grab", 100, "2026-07-12T02:00:00.000Z"),
    ]);
    expect(report.hourly.map((entry) => entry.hour)).toEqual([8, 9, 11]);
  });

  it("returns a valid empty chart state", () => {
    expect(aggregateSalesChannels([]).hourly).toEqual([]);
  });
});
