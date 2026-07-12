import { describe, expect, it } from "vitest";
import {
  confirmCustomerRequest,
  createCustomerRequest,
  toCustomerPublicProduct,
} from "./customerOrder";
import { defaultProducts, normalizeProduct, toppings } from "./data";
import {
  applyCartItemUpdate,
  createOrder,
  normalizeToppingPackaging,
  packagingSurchargePerUnit,
  prepareOrderItems,
  priceCartItem,
  productSupportsSeparatedPackaging,
  separatedPackagingAvailabilityId,
  toppingPackagingLabel,
} from "./lib";
import { buildOrderExportRows } from "./reporting";
import type { CartItem, OrderChannel, Product } from "./types";

const product = defaultProducts.find((entry) => entry.id === "plain-greek")!;
const line = (
  packaging: CartItem["toppingPackaging"] = "included",
): CartItem => ({
  id: crypto.randomUUID(),
  productId: product.id,
  productName: product.name,
  basePrice: product.price,
  selectedOptions: [],
  selectedOptionIds: [],
  quantity: 1,
  unitPrice: product.price,
  lineTotal: product.price,
  toppingPackaging: packaging,
});

const priced = (
  channel: OrderChannel,
  packaging: CartItem["toppingPackaging"],
  quantity = 1,
  target: Product = product,
  availability = {},
) =>
  priceCartItem(
    { ...line(packaging), productId: target.id, quantity },
    target,
    channel,
    toppings,
    availability,
  );

describe("topping packaging defaults and compatibility", () => {
  it("defaults legacy lines to included packaging with zero surcharge", () => {
    const legacy = line(undefined);
    expect(normalizeToppingPackaging(legacy.toppingPackaging)).toBe("included");
    expect(toppingPackagingLabel(legacy)).toBe("ใส่ท็อปปิ้งเลย");
    const prepared = prepareOrderItems(
      [legacy],
      defaultProducts,
      "หน้าร้าน",
      toppings,
    )[0];
    expect(prepared.toppingPackaging).toBe("included");
    expect(prepared.packagingSurchargePerUnit).toBe(0);
    expect(prepared.packagingSurchargeTotal).toBe(0);
  });

  it("treats missing product support as enabled and explicit false as disabled", () => {
    const legacy = { ...product, supportsSeparatedToppingPackaging: undefined };
    expect(productSupportsSeparatedPackaging(legacy)).toBe(true);
    expect(normalizeProduct(legacy).supportsSeparatedToppingPackaging).toBe(
      true,
    );
    expect(
      productSupportsSeparatedPackaging({
        ...product,
        supportsSeparatedToppingPackaging: false,
      }),
    ).toBe(false);
    expect(
      toCustomerPublicProduct(legacy).supportsSeparatedToppingPackaging,
    ).toBe(true);
  });
  it("omits undefined optional fields from the public menu projection", () => {
    const projected = toCustomerPublicProduct({
      ...product,
      premiumToppingIds: undefined,
      supportsSeparatedToppingPackaging: false,
    });
    expect(Object.hasOwn(projected, "premiumToppingIds")).toBe(false);
    expect(projected.supportsSeparatedToppingPackaging).toBe(false);
  });
});

describe("channel packaging pricing", () => {
  it.each([
    ["หน้าร้าน", 0],
    ["Openchat", 0],
    ["Lineman", 5],
    ["Grab", 5],
  ] as const)("prices separated packaging for %s", (channel, surcharge) => {
    expect(packagingSurchargePerUnit(channel, "separated")).toBe(surcharge);
    expect(priced(channel, "separated").packagingSurchargePerUnit).toBe(
      surcharge,
    );
  });

  it("never charges included packaging and multiplies separated packaging by quantity", () => {
    const included = priced("Grab", "included", 3);
    expect(included.packagingSurchargeTotal).toBe(0);
    const separated = priced("Grab", "separated", 3);
    expect(separated.unitPrice).toBe(included.unitPrice + 5);
    expect(separated.packagingSurchargeTotal).toBe(15);
    expect(separated.lineTotal).toBe((included.unitPrice + 5) * 3);
    expect(
      applyCartItemUpdate(separated, { quantity: 4 }).packagingSurchargeTotal,
    ).toBe(20);
  });

  it("reprices the surcharge when the channel changes", () => {
    const storefront = priced("หน้าร้าน", "separated");
    const platform = priceCartItem(storefront, product, "Lineman", toppings);
    expect(storefront.packagingSurchargePerUnit).toBe(0);
    expect(platform.packagingSurchargePerUnit).toBe(5);
    expect(platform.unitPrice).toBe(
      priced("Lineman", "included").unitPrice + 5,
    );
  });
});

describe("packaging availability and durable snapshots", () => {
  it("allows only when global and product settings allow it", () => {
    expect(priced("Grab", "separated").validationError).toBeUndefined();
    expect(
      priced("Grab", "separated", 1, product, {
        [separatedPackagingAvailabilityId]: false,
      }).validationError,
    ).toContain("หมด");
    expect(
      priced("Grab", "separated", 1, {
        ...product,
        supportsSeparatedToppingPackaging: false,
      }).validationError,
    ).toContain("ไม่รองรับ");
    expect(
      priced("Grab", "included", 1, product, {
        [separatedPackagingAvailabilityId]: false,
      }).validationError,
    ).toBeUndefined();
  });

  it("blocks stale separated lines during final preparation", () => {
    expect(() =>
      prepareOrderItems(
        [priced("Grab", "separated")],
        defaultProducts,
        "Grab",
        toppings,
        { [separatedPackagingAvailabilityId]: false },
      ),
    ).toThrow("หมด");
  });

  it("blocks a stale customer request when current product support is disabled", () => {
    const separated = priced("หน้าร้าน", "separated");
    expect(() =>
      createCustomerRequest(
        "request",
        "customer",
        [separated],
        [{ ...product, supportsSeparatedToppingPackaging: false }],
        {},
      ),
    ).toThrow("ไม่รองรับ");

    const request = createCustomerRequest(
      "request",
      "customer",
      [separated],
      [{ ...product, supportsSeparatedToppingPackaging: true }],
      {},
    );
    expect(request.items[0].packagingSurchargePerUnit).toBe(0);
  });

  it("blocks forged packaging values instead of silently normalizing them", () => {
    expect(() =>
      prepareOrderItems(
        [{ ...line(), toppingPackaging: "forged" as never }],
        defaultProducts,
        "หน้าร้าน",
        toppings,
      ),
    ).toThrow("ไม่ถูกต้อง");
  });

  it("preserves snapshots through customer request confirmation", () => {
    const request = createCustomerRequest(
      "request",
      "customer",
      [priced("หน้าร้าน", "separated", 2)],
      defaultProducts,
      {},
    );
    expect(request.total).toBe(product.price * 2);
    expect(request.items[0]).toMatchObject({
      toppingPackaging: "separated",
      toppingPackagingLabel: "แยกท็อปปิ้ง",
      packagingSurchargePerUnit: 0,
      packagingSurchargeTotal: 0,
    });
    const confirmed = confirmCustomerRequest(request, "สด", 1);
    expect(confirmed.order.items[0]).toMatchObject(
      request.items[0] as Partial<CartItem>,
    );
  });

  it("preserves Staff order packaging snapshots and totals exactly once", () => {
    const prepared = prepareOrderItems(
      [priced("Grab", "separated", 2)],
      defaultProducts,
      "Grab",
      toppings,
    );
    const staffOrder = createOrder(
      {
        customerName: "ลูกค้า",
        channel: "Grab",
        paymentMethod: "Platform",
        items: prepared,
      },
      "order",
      "Q001",
    );
    expect(staffOrder.items[0]).toMatchObject({
      toppingPackaging: "separated",
      toppingPackagingLabel: "แยกท็อปปิ้ง",
      packagingSurchargePerUnit: 5,
      packagingSurchargeTotal: 10,
    });
    expect(staffOrder.total).toBe(prepared[0].unitPrice * 2);
  });

  it("exports packaging snapshots and legacy defaults", () => {
    const current = priced("Grab", "separated", 2);
    const rows = buildOrderExportRows([
      {
        id: "order",
        queueNumber: "Q001",
        businessDate: "2026-07-12",
        customerName: "ลูกค้า",
        channel: "Grab",
        paymentMethod: "Platform",
        status: "completed",
        items: [current, line(undefined)],
        subtotal: current.lineTotal! + product.price,
        discount: 0,
        total: current.lineTotal! + product.price,
        createdAt: "2026-07-12T00:00:00.000Z",
        updatedAt: "2026-07-12T00:00:00.000Z",
      },
    ]);
    expect(rows[0]["รูปแบบท็อปปิ้ง"]).toBe("แยกท็อปปิ้ง");
    expect(rows[0]["ค่าบรรจุภัณฑ์ต่อถ้วย"]).toBe(5);
    expect(rows[0]["ค่าบรรจุภัณฑ์รวม"]).toBe(10);
    expect(rows[1]["รูปแบบท็อปปิ้ง"]).toBe("ใส่ท็อปปิ้งเลย");
  });
});
