import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProductModal from "./components/ProductModal";
import { createCustomerRequest } from "./customerOrder";
import { defaultProducts } from "./data";
import { rebuildTrustedCustomerConfirmation } from "./trustedCustomerConfirmation";
import type { CartItem } from "./types";

afterEach(cleanup);

describe("real Customer option builder to trusted confirmation", () => {
  it("serializes a legitimate granola choice into the trusted snapshot format", () => {
    const product = defaultProducts.find(
      (entry) => entry.id === "apple-ohlala",
    )!;
    const onSave = vi.fn<(item: CartItem) => void>();
    render(
      <ProductModal
        product={product}
        channel="หน้าร้าน"
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "กล้วย" }));
    fireEvent.click(screen.getByRole("button", { name: /เพิ่มลงตะกร้า/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const item = onSave.mock.calls[0][0];
    expect(item.selectedOptionIds).toEqual(["กล้วย"]);
    expect(item.selectedOptions).toEqual(["กราโนล่ารสกล้วย"]);

    const request = createCustomerRequest(
      "request-from-real-ui",
      "anonymous-owner",
      [item],
      defaultProducts,
      {},
      { customerName: "WP3-AUTO-UI-VALID-RETEST" },
    );
    const trusted = rebuildTrustedCustomerConfirmation(
      request,
      defaultProducts,
      {},
    );
    expect(trusted.items[0].selectedOptions).toEqual(["กราโนล่ารสกล้วย"]);
  });
});
