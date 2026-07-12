import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultProducts } from "./data";
import { separatedPackagingAvailabilityId } from "./lib";
import CustomerOrderPage from "./pages/CustomerOrderPage";
import ProductsPage from "./pages/ProductsPage";
import SettingsPage from "./pages/SettingsPage";
import type { Product } from "./types";

const mocks = vi.hoisted(() => ({
  useCustomer: vi.fn(),
  useData: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock("./customerFirebase", () => ({ useCustomer: mocks.useCustomer }));
vi.mock("./store", () => ({
  useData: mocks.useData,
  useAuth: mocks.useAuth,
}));

afterEach(cleanup);

const product = defaultProducts.find((entry) => entry.id === "plain-greek")!;

describe("manual UAT defect regressions", () => {
  beforeEach(() => {
    mocks.useAuth.mockReturnValue({ user: { email: "staff@example.test" } });
  });

  it("keeps the product editor open on failure and closes it after a successful save", async () => {
    const products: Product[] = [{ ...product }];
    const saveProduct = vi
      .fn()
      .mockRejectedValueOnce(new Error("public projection failed"))
      .mockImplementationOnce(async (saved: Product) => {
        products[0] = saved;
      });
    mocks.useData.mockReturnValue({
      products,
      toppingAvailability: {},
      saveProduct,
      setToppingAvailability: vi.fn(),
    });

    const { container } = render(
      <MemoryRouter>
        <ProductsPage />
      </MemoryRouter>,
    );
    fireEvent.click(container.querySelector(".manage-card .secondary")!);
    const support = container.querySelector(
      ".product-editor input[type='checkbox']",
    ) as HTMLInputElement;
    fireEvent.click(support);
    fireEvent.click(container.querySelector(".product-editor .primary")!);

    expect(await screen.findByText("public projection failed")).toBeTruthy();
    expect(container.querySelector(".product-editor")).toBeTruthy();

    fireEvent.click(container.querySelector(".product-editor .primary")!);
    await waitFor(() =>
      expect(container.querySelector(".product-editor")).toBeNull(),
    );
    expect(saveProduct).toHaveBeenLastCalledWith(
      expect.objectContaining({ supportsSeparatedToppingPackaging: false }),
    );

    fireEvent.click(container.querySelector(".manage-card .secondary")!);
    expect(
      (
        container.querySelector(
          ".product-editor input[type='checkbox']",
        ) as HTMLInputElement
      ).checked,
    ).toBe(false);
  });

  it("exposes and persists the global separated-packaging setting", () => {
    const setToppingAvailability = vi.fn();
    mocks.useData.mockReturnValue({
      products: [],
      orders: [],
      toppingAvailability: {},
      setToppingAvailability,
      importBackup: vi.fn(),
    });

    render(<SettingsPage />);
    const toggle = screen.getByRole("checkbox") as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    expect(setToppingAvailability).toHaveBeenCalledWith(
      separatedPackagingAvailabilityId,
      false,
    );
  });

  it("lets a customer change quantity, edit packaging, and remove a cart line without submitting", () => {
    const submit = vi.fn();
    mocks.useCustomer.mockReturnValue({
      products: [product],
      availability: {},
      loading: false,
      submit,
    });

    const { container } = render(
      <MemoryRouter>
        <CustomerOrderPage />
      </MemoryRouter>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(product.name) }),
    );
    fireEvent.click(container.querySelector(".modal-card .primary")!);
    expect(submit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /เพิ่มจำนวน/ }));
    expect(
      container.querySelector(".customer-cart-quantity b")?.textContent,
    ).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: /แก้ไข/ }));
    const packaging = container.querySelectorAll(
      ".packaging-choice input[type='radio']",
    );
    fireEvent.click(packaging[1]);
    fireEvent.click(container.querySelector(".modal-card .primary")!);

    expect(container.querySelectorAll(".customer-cart-line")).toHaveLength(1);
    expect(container.querySelector(".packaging-detail")?.textContent).toContain(
      "แยกท็อปปิ้ง",
    );
    expect(submit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /ลบ/ }));
    expect(container.querySelectorAll(".customer-cart-line")).toHaveLength(0);
    expect(submit).not.toHaveBeenCalled();
  });
});
