import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProductModal from "./components/ProductModal";
import OrderItemSummary from "./components/OrderItemSummary";
import { defaultProducts } from "./data";
import { separatedPackagingAvailabilityId } from "./lib";
import type { CartItem } from "./types";

afterEach(cleanup);

const product = defaultProducts.find((entry) => entry.id === "plain-greek")!;

describe("topping packaging ordering UI", () => {
  it("defaults to included packaging and saves a per-line separated snapshot", () => {
    const onSave = vi.fn();
    render(
      <ProductModal
        product={product}
        channel="Lineman"
        onClose={() => undefined}
        onSave={onSave}
      />,
    );
    expect(
      (screen.getByLabelText("ใส่ท็อปปิ้งเลย") as HTMLInputElement).checked,
    ).toBe(true);
    fireEvent.click(screen.getByLabelText(/แยกท็อปปิ้ง/));
    fireEvent.click(screen.getByRole("button", { name: /เพิ่มลงตะกร้า/ }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        toppingPackaging: "separated",
        toppingPackagingLabel: "แยกท็อปปิ้ง",
        packagingSurchargePerUnit: 5,
        packagingSurchargeTotal: 5,
      }),
    );
  });

  it("shows sold out globally and unsupported per product while normal stays selectable", () => {
    const { rerender } = render(
      <ProductModal
        product={product}
        channel="หน้าร้าน"
        availability={{ [separatedPackagingAvailabilityId]: false }}
        onClose={() => undefined}
        onSave={() => undefined}
      />,
    );
    expect(screen.getByText("หมด")).toBeTruthy();
    expect(
      (screen.getByLabelText(/แยกท็อปปิ้ง/) as HTMLInputElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText("ใส่ท็อปปิ้งเลย") as HTMLInputElement).disabled,
    ).toBe(false);

    rerender(
      <ProductModal
        product={{
          ...product,
          supportsSeparatedToppingPackaging: false,
        }}
        channel="หน้าร้าน"
        onClose={() => undefined}
        onSave={() => undefined}
      />,
    );
    expect(screen.getByText("ไม่รองรับ")).toBeTruthy();
    expect(
      (screen.getByLabelText(/แยกท็อปปิ้ง/) as HTMLInputElement).disabled,
    ).toBe(true);
  });

  it("renders durable packaging details in shared queue/request summaries", () => {
    const item: CartItem = {
      id: "line",
      productId: product.id,
      productName: product.name,
      basePrice: 79,
      selectedOptions: [],
      selectedOptionIds: [],
      quantity: 3,
      unitPrice: 84,
      lineTotal: 252,
      toppingPackaging: "separated",
      toppingPackagingLabel: "แยกท็อปปิ้ง",
      packagingSurchargePerUnit: 5,
      packagingSurchargeTotal: 15,
    };
    render(<OrderItemSummary item={item} />);
    expect(
      screen.getByText(/รูปแบบท็อปปิ้ง: แยกท็อปปิ้ง/).textContent,
    ).toContain("รวม ฿15");
  });
});
