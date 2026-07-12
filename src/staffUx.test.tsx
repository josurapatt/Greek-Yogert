import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import CartItemOptions from "./components/CartItemOptions";
import HistoryOrderCard from "./components/HistoryOrderCard";
import ProductModal from "./components/ProductModal";
import QueueOrderCard from "./components/QueueOrderCard";
import { defaultProducts, toppings } from "./data";
import { filterHistoryOrders } from "./history";
import {
  applyCartItemUpdate,
  isSelectionAvailable,
  normalizePaymentMethod,
  orderPaymentLabel,
  paymentMethodsForChannel,
  prepareOrderItems,
  priceCartItem,
  validatePaymentMethod,
  validateSelection,
} from "./lib";
import { updateOrderStatusAndNavigate } from "./orderActions";
import { buildOrderExportRows, completedSalesSummary } from "./reporting";
import type { CartItem, PaymentMethod, ShopOrder } from "./types";

afterEach(cleanup);

const sizeS = defaultProducts.find((product) => product.id === "size-s")!;
const apple = defaultProducts.find((product) => product.id === "apple-ohlala")!;
const plainGranola = defaultProducts.find(
  (product) => product.id === "plain-granola",
)!;

const item = (overrides: Partial<CartItem> = {}): CartItem => ({
  id: "item-1",
  productId: "size-s",
  productName: "Size S",
  basePrice: 89,
  selectedOptions: ["กล้วย", "แอปเปิ้ล", "บิสคอฟ"],
  selectedOptionIds: ["banana", "apple", "biscoff"],
  selectedChannel: "หน้าร้าน",
  quantity: 1,
  unitPrice: 89,
  lineTotal: 89,
  priceBreakdown: {
    basePrice: 89,
    premiumIncludedSurcharge: 0,
    extraToppingCharges: 10,
    unitPrice: 99,
  },
  ...overrides,
});

const order = (
  paymentMethod: PaymentMethod | null = "สด",
  overrides: Partial<ShopOrder> = {},
): ShopOrder => ({
  id: "20260711-001",
  queueNumber: "Q001",
  businessDate: "2026-07-11",
  customerName: "สมชาย",
  channel: "หน้าร้าน",
  paymentMethod: (paymentMethod ?? undefined) as PaymentMethod,
  status: "completed",
  items: [item()],
  subtotal: 99,
  discount: 0,
  total: 99,
  createdAt: "2026-07-11T07:25:00.000Z",
  updatedAt: "2026-07-11T07:30:00.000Z",
  ...overrides,
});

describe("staff order UX", () => {
  it("renders cart topping text with the dedicated product-size class", () => {
    const { container } = render(
      <CartItemOptions options={["กล้วย", "บิสคอฟ"]} />,
    );
    expect(container.querySelector(".cart-item-options")?.textContent).toBe(
      "กล้วย • บิสคอฟ",
    );
  });

  it("shows product names, quantities, options, and extra details in queue cards", () => {
    render(
      <MemoryRouter>
        <QueueOrderCard order={{ ...order(), status: "pending" }} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Size S × 1")).toBeTruthy();
    expect(screen.getByText("• กล้วย, แอปเปิ้ล, บิสคอฟ")).toBeTruthy();
    expect(screen.getByText("• เพิ่มพิเศษ +฿10")).toBeTruthy();
    expect(screen.getByText("สด")).toBeTruthy();
  });

  it("renders legacy queue orders with missing payment and option snapshots", () => {
    const legacy = order(null, {
      status: "pending",
      items: [
        item({
          selectedOptions: undefined as unknown as string[],
          priceBreakdown: undefined,
        }),
      ],
    });
    render(
      <MemoryRouter>
        <QueueOrderCard order={legacy} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Size S × 1")).toBeTruthy();
    expect(screen.getByText("ไม่ระบุ")).toBeTruthy();
  });

  it("returns to queue only after a successful ready update", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const navigate = vi.fn();
    await updateOrderStatusAndNavigate(
      "order-1",
      "completed",
      update,
      navigate,
    );
    expect(update).toHaveBeenCalledWith("order-1", "completed");
    expect(navigate).toHaveBeenCalledWith("/queue");
  });

  it("does not navigate when the ready update fails", async () => {
    const update = vi.fn().mockRejectedValue(new Error("failed"));
    const navigate = vi.fn();
    await expect(
      updateOrderStatusAndNavigate("order-1", "completed", update, navigate),
    ).rejects.toThrow("failed");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("shows payment method on history cards", () => {
    render(
      <MemoryRouter>
        <HistoryOrderCard order={order("โอน")} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/โอน/)).toBeTruthy();
  });
});

describe("history payment filters", () => {
  const rows = [
    order("สด", { id: "cash", queueNumber: "Q001", customerName: "Cash" }),
    order("โอน", {
      id: "transfer",
      queueNumber: "Q002",
      customerName: "Transfer",
    }),
    order("โครงการ", {
      id: "project",
      queueNumber: "Q003",
      customerName: "Project",
    }),
    order("Platform", {
      id: "platform",
      queueNumber: "Q004",
      customerName: "Platform",
      channel: "Grab",
    }),
    order(null, { id: "missing", queueNumber: "Q005", customerName: "Legacy" }),
  ];

  it.each([
    ["สด", "cash"],
    ["โอน", "transfer"],
    ["โครงการ", "project"],
    ["Platform", "platform"],
    ["missing", "missing"],
  ] as const)("filters %s payments", (paymentMethod, expectedId) => {
    expect(
      filterHistoryOrders(rows, {
        query: "",
        date: "",
        status: "all",
        paymentMethod,
      }).map((entry) => entry.id),
    ).toEqual([expectedId]);
  });

  it("combines payment with status, date, and search without clearing filters", () => {
    const combined = [
      ...rows,
      order("สด", {
        id: "cancelled",
        status: "cancelled",
        businessDate: "2026-07-12",
        customerName: "Target",
      }),
    ];
    expect(
      filterHistoryOrders(combined, {
        query: "target",
        date: "2026-07-12",
        status: "cancelled",
        paymentMethod: "สด",
      }).map((entry) => entry.id),
    ).toEqual(["cancelled"]);
  });

  it("shows and filters mixed line payments while preserving legacy payments", () => {
    const mixed = order("สด", {
      id: "mixed",
      items: [
        item({ id: "cash-line", paymentMethod: "สด" }),
        item({ id: "transfer-line", paymentMethod: "โอน" }),
      ],
      paymentMethods: ["สด", "โอน"],
    });
    expect(orderPaymentLabel(mixed)).toBe("สด + โอน");
    expect(filterHistoryOrders([mixed], { query: "", date: "", status: "all", paymentMethod: "สด" })).toEqual([mixed]);
    expect(filterHistoryOrders([mixed], { query: "", date: "", status: "all", paymentMethod: "โอน" })).toEqual([mixed]);
    expect(filterHistoryOrders([mixed], { query: "", date: "", status: "all", paymentMethod: "โครงการ" })).toEqual([]);
    expect(buildOrderExportRows([mixed]).map((row) => row["วิธีชำระเงิน"])).toEqual(["สด", "โอน"]);

    const legacy = order("โครงการ", { id: "legacy-project", paymentMethods: undefined, items: [item({ paymentMethod: undefined })] });
    expect(orderPaymentLabel(legacy)).toBe("โครงการ");
    expect(filterHistoryOrders([legacy], { query: "", date: "", status: "all", paymentMethod: "โครงการ" })).toEqual([legacy]);
  });

  it("keeps payment labels in export without changing completed sales totals", () => {
    const completed = order("Platform", { channel: "Grab" });
    const cancelled = order("สด", {
      id: "cancelled",
      status: "cancelled",
      total: 200,
    });
    expect(completedSalesSummary([completed, cancelled]).sales).toBe(99);
    const rowsForExport = buildOrderExportRows([completed, cancelled]);
    expect(rowsForExport).toHaveLength(2);
    expect(rowsForExport[0]["วิธีชำระเงิน"]).toBe("Platform");
  });
});

describe("payment rules by channel", () => {
  it("forces LINE MAN to Platform", () => {
    expect(paymentMethodsForChannel("Lineman")).toEqual(["Platform"]);
    expect(normalizePaymentMethod("Lineman", "สด")).toBe("Platform");
  });

  it("forces Grab to Platform", () => {
    expect(paymentMethodsForChannel("Grab")).toEqual(["Platform"]);
    expect(validatePaymentMethod("Grab", "โอน")).not.toBeNull();
  });

  it("does not offer Platform for storefront", () => {
    expect(paymentMethodsForChannel("หน้าร้าน")).toEqual([
      "สด",
      "โอน",
      "โครงการ",
    ]);
    expect(validatePaymentMethod("หน้าร้าน", "Platform")).not.toBeNull();
  });

  it("does not offer Platform for Openchat", () => {
    expect(paymentMethodsForChannel("Openchat")).not.toContain("Platform");
  });

  it("replaces an invalid payment safely when the channel changes", () => {
    expect(normalizePaymentMethod("หน้าร้าน", "Platform")).toBe("สด");
    expect(normalizePaymentMethod("Lineman", "โครงการ")).toBe("Platform");
  });
});

describe("global topping availability", () => {
  it("defaults legacy availability to available", () => {
    expect(isSelectionAvailable(sizeS, "banana", {})).toBe(true);
  });

  it("keeps a sold-out topping visible but disables adding it", () => {
    render(
      <ProductModal
        product={sizeS}
        channel="หน้าร้าน"
        availability={{ banana: false }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    const row = screen.getByText("กล้วย").closest(".topping-row")!;
    expect(row.textContent).toContain("หมด");
    const buttons = row.querySelectorAll("button");
    expect((buttons[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps unrelated available toppings selectable", () => {
    render(
      <ProductModal
        product={sizeS}
        channel="หน้าร้าน"
        availability={{ banana: false }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    const row = screen.getByText("ส้ม").closest(".topping-row")!;
    const buttons = row.querySelectorAll("button");
    expect((buttons[1] as HTMLButtonElement).disabled).toBe(false);
  });

  it("blocks sold-out toppings in business logic", () => {
    expect(
      validateSelection(sizeS, ["banana", "orange", "apple"], "หน้าร้าน", {
        banana: false,
      }),
    ).not.toBeNull();
  });

  it("marks a stale cart item invalid and blocks submission", () => {
    const stale = item();
    const repriced = priceCartItem(stale, sizeS, "หน้าร้าน", toppings, {
      banana: false,
    });
    expect(repriced.validationError).toContain("กล้วย");
    expect(() =>
      prepareOrderItems([stale], defaultProducts, "หน้าร้าน", toppings, {
        banana: false,
      }),
    ).toThrow("หมด");
  });

  it("clears a sold-out granola flavor error after an edit selects an available flavor", () => {
    const stale = item({
      productId: apple.id,
      productName: apple.name,
      selectedOptions: ["น้ำผึ้ง"],
      selectedOptionIds: ["น้ำผึ้ง"],
    });
    const invalid = priceCartItem(stale, apple, "หน้าร้าน", toppings, {
      "granola-honey": false,
    });
    const corrected = priceCartItem(
      { ...stale, selectedOptions: ["กล้วย"], selectedOptionIds: ["กล้วย"] },
      apple,
      "หน้าร้าน",
      toppings,
      { "granola-honey": false },
    );
    const saved = applyCartItemUpdate(invalid, {
      ...corrected,
      validationError: corrected.validationError,
    });
    expect(saved.selectedOptions).toEqual(["กล้วย"]);
    expect(saved.validationError).toBeUndefined();
  });

  it("clears a sold-out topping error after an edit replaces that topping", () => {
    const invalid = priceCartItem(item(), sizeS, "หน้าร้าน", toppings, {
      banana: false,
    });
    const corrected = priceCartItem(
      item({
        selectedOptions: ["ส้ม", "แอปเปิ้ล", "บิสคอฟ"],
        selectedOptionIds: ["orange", "apple", "biscoff"],
      }),
      sizeS,
      "หน้าร้าน",
      toppings,
      { banana: false },
    );
    const saved = applyCartItemUpdate(invalid, {
      ...corrected,
      validationError: corrected.validationError,
    });
    expect(saved.selectedOptions).toEqual(["ส้ม", "แอปเปิ้ล", "บิสคอฟ"]);
    expect(saved.validationError).toBeUndefined();
  });

  it("keeps the availability error when the edited item still uses a sold-out selection", () => {
    const invalid = priceCartItem(item(), sizeS, "หน้าร้าน", toppings, {
      banana: false,
    });
    const corrected = priceCartItem(
      item({ quantity: 2 }),
      sizeS,
      "หน้าร้าน",
      toppings,
      { banana: false },
    );
    const saved = applyCartItemUpdate(invalid, {
      ...corrected,
      validationError: corrected.validationError,
    });
    expect(saved.validationError).toContain("กล้วย");
  });

  it("clears only the corrected cart item's availability error", () => {
    const first = priceCartItem(item({ id: "first" }), sizeS, "หน้าร้าน", toppings, {
      banana: false,
    });
    const second = priceCartItem(item({ id: "second" }), sizeS, "หน้าร้าน", toppings, {
      apple: false,
    });
    const corrected = priceCartItem(
      item({
        id: "first",
        selectedOptions: ["ส้ม", "แอปเปิ้ล", "บิสคอฟ"],
        selectedOptionIds: ["orange", "apple", "biscoff"],
      }),
      sizeS,
      "หน้าร้าน",
      toppings,
      { banana: false },
    );
    const saved = [first, second].map((cartItem) =>
      cartItem.id === corrected.id
        ? applyCartItemUpdate(cartItem, {
            ...corrected,
            validationError: corrected.validationError,
          })
        : cartItem,
    );
    expect(saved[0].validationError).toBeUndefined();
    expect(saved[1].validationError).toContain("แอปเปิ้ล");
  });

  it("blocks a sold-out required flavor for Apple Ohlala", () => {
    const flavor = apple.granolaOptions[0];
    expect(
      validateSelection(apple, [flavor], "หน้าร้าน", {
        "granola-banana": false,
      }),
    ).not.toBeNull();
  });

  it("blocks a sold-out required flavor for Plain Granola", () => {
    const flavor = plainGranola.granolaOptions[0];
    expect(
      validateSelection(plainGranola, [flavor], "Grab", {
        "granola-banana": false,
      }),
    ).not.toBeNull();
  });

  it("shows a sold-out Plain Granola flavor as disabled", () => {
    render(
      <ProductModal
        product={plainGranola}
        channel="Grab"
        availability={{ "granola-banana": false }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    const flavor = screen
      .getByText("กล้วย")
      .closest("button") as HTMLButtonElement;
    expect(flavor.textContent).toContain("หมด");
    expect(flavor.disabled).toBe(true);
  });
});
