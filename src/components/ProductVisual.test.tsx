import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ProductVisual from "./ProductVisual";

describe("ProductVisual", () => {
  it("renders a configured image and falls back to the Product Emoji on error", () => {
    render(
      <ProductVisual
        emoji="🍓"
        imageUrl="https://example.test/product.jpg"
        name="Berry yogurt"
      />,
    );
    fireEvent.error(screen.getByRole("img", { name: "Berry yogurt" }));
    expect(
      screen.getByRole("img", { name: "Berry yogurt" }).textContent,
    ).toContain("🍓");
  });

  it("uses a neutral bowl placeholder when image and Emoji are unavailable", () => {
    render(<ProductVisual name="Plain yogurt" />);
    expect(
      screen.getByRole("img", { name: "Plain yogurt placeholder" }).textContent,
    ).toContain("🥣");
  });
});
