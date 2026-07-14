import { describe, expect, it } from "vitest";
import { createCustomerRequest, confirmCustomerRequest } from "./customerOrder";
import { defaultProducts } from "./data";
import { rebuildTrustedCustomerConfirmation } from "./trustedCustomerConfirmation";
import type { CartItem, Product } from "./types";

const apple = defaultProducts.find((product) => product.id === "apple-ohlala")!;
const sizeS = defaultProducts.find((product) => product.id === "size-s")!;

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

function requestFor(item = appleItem()) {
  return createCustomerRequest(
    "request-1",
    "anonymous-uid",
    [item],
    defaultProducts,
    {},
  );
}

function sizeSItem(): CartItem {
  return {
    ...appleItem(),
    productId: sizeS.id,
    productName: sizeS.name,
    basePrice: 89,
    selectedOptions: ["กล้วย", "กล้วย", "แอปเปิ้ล"],
    selectedOptionIds: ["banana", "banana", "apple"],
    unitPrice: 89,
    lineTotal: 89,
    toppingPackaging: "separated",
  };
}

function expectMismatch(action: () => unknown) {
  expect(action).toThrow("คำขอไม่ตรงกับเมนูปัจจุบัน");
}

describe("trusted Customer confirmation boundary", () => {
  it("rebuilds an exact valid request and keeps mixed payment allocation correct", () => {
    const request = createCustomerRequest(
      "request-1",
      "anonymous-uid",
      [appleItem(), { ...appleItem(), id: "cart-2" }],
      defaultProducts,
      {},
    );
    const trusted = rebuildTrustedCustomerConfirmation(
      request,
      defaultProducts,
      {},
    );
    const confirmed = confirmCustomerRequest(
      request,
      { "cart-1": "สด", "cart-2": "โอน" },
      1,
      "staff-uid",
      "2026-07-13T00:00:00.000Z",
      trusted.items,
    );
    expect(confirmed.order.items.map((item) => item.paymentMethod)).toEqual([
      "สด",
      "โอน",
    ]);
    expect(confirmed.order.total).toBe(request.total);
    expect(() =>
      confirmCustomerRequest(confirmed.request, "สด", 2, "staff-uid"),
    ).toThrow("ดำเนินการแล้ว");
  });

  it("rejects forged or stale financial and label snapshots", () => {
    const cases: Array<(request: ReturnType<typeof requestFor>) => void> = [
      (request) => {
        request.items[0].unitPrice = 1;
      },
      (request) => {
        request.items[0].basePrice = 1;
      },
      (request) => {
        request.items[0].productName = "forged";
      },
      (request) => {
        request.items[0].selectedOptions = ["forged"];
      },
      (request) => {
        request.items[0].lineTotal = 1;
      },
      (request) => {
        request.subtotal = 1;
      },
      (request) => {
        request.total = 1;
      },
      (request) => {
        request.itemCount = 2;
      },
    ];
    cases.forEach((mutate) => {
      const request = requestFor();
      mutate(request);
      expectMismatch(() =>
        rebuildTrustedCustomerConfirmation(request, defaultProducts, {}),
      );
    });
  });

  it("rejects unavailable products and invalid quantities", () => {
    const inactive = defaultProducts.map((product) =>
      product.id === apple.id ? { ...product, active: false } : product,
    );
    expectMismatch(() =>
      rebuildTrustedCustomerConfirmation(requestFor(), inactive, {}),
    );
    expectMismatch(() =>
      rebuildTrustedCustomerConfirmation(requestFor(), [], {}),
    );
    const invalidQuantity = requestFor();
    invalidQuantity.items[0].quantity = 0;
    expectMismatch(() =>
      rebuildTrustedCustomerConfirmation(invalidQuantity, defaultProducts, {}),
    );
  });

  it("rechecks trusted product price changes", () => {
    const changed: Product[] = defaultProducts.map((product) =>
      product.id === apple.id
        ? {
            ...product,
            price: 70,
            channelPrices: { ...product.channelPrices, หน้าร้าน: 70 },
          }
        : product,
    );
    expectMismatch(() =>
      rebuildTrustedCustomerConfirmation(requestFor(), changed, {}),
    );
  });

  it("validates toppings, availability, and separated packaging", () => {
    const item = sizeSItem();
    const valid = requestFor(item);
    expect(
      rebuildTrustedCustomerConfirmation(valid, defaultProducts, {}).items,
    ).toHaveLength(1);

    const unknown = structuredClone(valid);
    unknown.items[0].selectedOptionIds[0] = "unknown";
    expectMismatch(() =>
      rebuildTrustedCustomerConfirmation(unknown, defaultProducts, {}),
    );

    const disallowedProducts = defaultProducts.map((product) =>
      product.id === sizeS.id
        ? { ...product, availableToppingIds: ["banana"] }
        : product,
    );
    expectMismatch(() =>
      rebuildTrustedCustomerConfirmation(valid, disallowedProducts, {}),
    );
    expectMismatch(() =>
      rebuildTrustedCustomerConfirmation(valid, defaultProducts, {
        banana: false,
      }),
    );
    expectMismatch(() =>
      rebuildTrustedCustomerConfirmation(valid, defaultProducts, {
        "separated-topping-packaging": false,
      }),
    );
    const noPackagingProduct = defaultProducts.map((product) =>
      product.id === sizeS.id
        ? { ...product, supportsSeparatedToppingPackaging: false }
        : product,
    );
    expectMismatch(() =>
      rebuildTrustedCustomerConfirmation(valid, noPackagingProduct, {}),
    );
    const forgedSurcharge = structuredClone(valid);
    forgedSurcharge.items[0].packagingSurchargePerUnit = 5;
    expectMismatch(() =>
      rebuildTrustedCustomerConfirmation(forgedSurcharge, defaultProducts, {}),
    );
  });

  it("validates granola choices against current private configuration", () => {
    const request = requestFor();
    const changed = defaultProducts.map((product) =>
      product.id === apple.id
        ? { ...product, granolaOptions: ["เบอร์รี่รวม"] }
        : product,
    );
    expectMismatch(() =>
      rebuildTrustedCustomerConfirmation(request, changed, {}),
    );
  });

  it("accepts the real Customer UI granola label but rejects a different display snapshot", () => {
    const valid = requestFor();
    expect(
      rebuildTrustedCustomerConfirmation(valid, defaultProducts, {}).items[0]
        .selectedOptions,
    ).toEqual(["กราโนล่ารสกล้วย"]);

    const mismatched = structuredClone(valid);
    mismatched.items[0].selectedOptions = ["กล้วย"];
    expectMismatch(() =>
      rebuildTrustedCustomerConfirmation(mismatched, defaultProducts, {}),
    );
  });

  const mismatchCases: Array<{
    label: string;
    arrange: () => {
      request: ReturnType<typeof requestFor>;
      products?: Product[];
      availability?: Record<string, boolean>;
    };
  }> = [
    {
      label: "forged unit price",
      arrange: () => {
        const request = requestFor();
        request.items[0].unitPrice = 1;
        return { request };
      },
    },
    {
      label: "forged product name",
      arrange: () => {
        const request = requestFor();
        request.items[0].productName = "forged";
        return { request };
      },
    },
    {
      label: "forged subtotal",
      arrange: () => {
        const request = requestFor();
        request.subtotal = 1;
        return { request };
      },
    },
    {
      label: "forged total",
      arrange: () => {
        const request = requestFor();
        request.total = 1;
        return { request };
      },
    },
    {
      label: "forged option surcharge",
      arrange: () => {
        const request = requestFor(sizeSItem());
        request.items[0].priceBreakdown!.premiumIncludedSurcharge = 99;
        return { request };
      },
    },
    {
      label: "forged packaging surcharge",
      arrange: () => {
        const request = requestFor(sizeSItem());
        request.items[0].packagingSurchargePerUnit = 5;
        request.items[0].packagingSurchargeTotal = 5;
        return { request };
      },
    },
    {
      label: "forged channel",
      arrange: () => {
        const request = requestFor();
        (request as { channel: string }).channel = "Grab";
        return { request };
      },
    },
    {
      label: "stale Storefront price",
      arrange: () => ({
        request: requestFor(),
        products: defaultProducts.map((product) =>
          product.id === apple.id
            ? {
                ...product,
                price: 70,
                channelPrices: {
                  ...product.channelPrices,
                  หน้าร้าน: 70,
                },
              }
            : product,
        ),
      }),
    },
    {
      label: "missing product",
      arrange: () => ({
        request: requestFor(),
        products: defaultProducts.filter((product) => product.id !== apple.id),
      }),
    },
    {
      label: "inactive or unavailable product",
      arrange: () => ({
        request: requestFor(),
        products: defaultProducts.map((product) =>
          product.id === apple.id ? { ...product, active: false } : product,
        ),
      }),
    },
    {
      label: "unsupported topping",
      arrange: () => {
        const request = requestFor(sizeSItem());
        request.items[0].selectedOptionIds[0] = "unknown";
        return { request };
      },
    },
    {
      label: "unavailable topping",
      arrange: () => ({
        request: requestFor(sizeSItem()),
        availability: { banana: false },
      }),
    },
    {
      label: "unavailable granola",
      arrange: () => ({
        request: requestFor(),
        availability: { "granola-banana": false },
      }),
    },
    {
      label: "too few selections",
      arrange: () => {
        const request = requestFor(sizeSItem());
        request.items[0].selectedOptionIds.pop();
        request.items[0].selectedOptions.pop();
        return { request };
      },
    },
    {
      label: "too many selections without the trusted surcharge",
      arrange: () => {
        const request = requestFor(sizeSItem());
        request.items[0].selectedOptionIds.push("orange");
        request.items[0].selectedOptions.push("ส้ม");
        return { request };
      },
    },
    {
      label: "duplicate invalid selections",
      arrange: () => {
        const item = sizeSItem();
        item.selectedOptionIds = ["banana", "banana", "banana"];
        item.selectedOptions = ["กล้วย", "กล้วย", "กล้วย"];
        return {
          request: requestFor(item),
          availability: { banana: false },
        };
      },
    },
    {
      label: "unsupported separated packaging value",
      arrange: () => {
        const request = requestFor(sizeSItem());
        request.items[0].toppingPackaging = "unsupported" as never;
        return { request };
      },
    },
    {
      label: "globally disabled separated packaging",
      arrange: () => ({
        request: requestFor(sizeSItem()),
        availability: { "separated-topping-packaging": false },
      }),
    },
    {
      label: "per-product disabled separated packaging",
      arrange: () => ({
        request: requestFor(sizeSItem()),
        products: defaultProducts.map((product) =>
          product.id === sizeS.id
            ? { ...product, supportsSeparatedToppingPackaging: false }
            : product,
        ),
      }),
    },
  ];

  it.each(mismatchCases)(
    "rejects $label and leaves the Customer request pending",
    ({ arrange }) => {
      const {
        request,
        products = defaultProducts,
        availability = {},
      } = arrange();
      const before = structuredClone(request);
      expectMismatch(() =>
        rebuildTrustedCustomerConfirmation(request, products, availability),
      );
      expect(request).toEqual(before);
      expect(request.status).toBe("รอร้านยืนยัน");
      expect(request.confirmedOrderId).toBeUndefined();
      expect(request.queueNumber).toBeUndefined();
    },
  );
});
