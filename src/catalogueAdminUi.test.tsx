import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultProducts, normalizeProduct } from "./data";
import { fallbackOptionGroups } from "./optionCatalogue";
import type { OptionGroup } from "./types";

const mocks = vi.hoisted(() => ({
  catalogueError: "",
  saveOptionGroup: vi.fn(async () => undefined),
  setToppingAvailability: vi.fn(async () => undefined),
}));

vi.mock("./store", () => ({
  useData: () => ({
    optionGroups: fallbackOptionGroups,
    catalogueError: mocks.catalogueError,
    products: defaultProducts,
    toppingAvailability: {},
    saveOptionGroup: mocks.saveOptionGroup,
    setToppingAvailability: mocks.setToppingAvailability,
  }),
}));

import OptionGroupManager from "./components/OptionGroupManager";
import ProductOptionAssignmentsField from "./components/ProductOptionAssignmentsField";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.catalogueError = "";
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("Staff catalogue controls", () => {
  it("shows a visible catalogue overflow error without replacing the catalogue", () => {
    mocks.catalogueError =
      "Option group toppings exceeds the maximum of 50 choices.";
    render(<OptionGroupManager />);

    expect(screen.getByRole("alert").textContent).toBe(mocks.catalogueError);
    expect(screen.getByText(/ID: toppings/)).toBeTruthy();
  });

  it("edits group policy and adds a choice with a generated stable ID", async () => {
    render(<OptionGroupManager />);
    const toppingCard = screen
      .getByText("toppings", {
        exact: false,
        selector: "small",
      })
      .closest("article")!;
    fireEvent.click(
      Array.from(toppingCard.querySelectorAll("button")).find(
        (button) => button.textContent === "Edit",
      )!,
    );

    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Custom toppings" },
    });
    fireEvent.click(screen.getByLabelText("Required by default"));
    fireEvent.click(screen.getByLabelText("Allow duplicate selection"));
    fireEvent.click(screen.getByRole("button", { name: /Add choice/ }));
    const newChoiceName = screen.getAllByLabelText("Name").at(-1)!;
    fireEvent.change(newChoiceName, { target: { value: "Vanilla crunch" } });
    fireEvent.click(screen.getByRole("button", { name: /Save group/ }));

    await waitFor(() => expect(mocks.saveOptionGroup).toHaveBeenCalledOnce());
    const [saved, previous] = mocks.saveOptionGroup.mock
      .calls[0] as unknown as [OptionGroup, OptionGroup];
    expect(saved.id).toBe("toppings");
    expect(saved.displayName).toBe("Custom toppings");
    expect(saved.required).toBe(false);
    expect(saved.allowDuplicates).toBe(false);
    expect(saved.choices.at(-1)).toMatchObject({
      id: "choice-vanilla-crunch",
      name: "Vanilla crunch",
      everUsed: false,
    });
    expect(previous.id).toBe("toppings");
  });

  it("converts legacy Product configuration to explicit assignments and removes assignments safely", () => {
    const product = normalizeProduct(
      defaultProducts.find((entry) => entry.optionMode === "toppings")!,
    );
    const onChange = vi.fn();
    const { rerender } = render(
      <ProductOptionAssignmentsField
        onChange={onChange}
        optionGroups={fallbackOptionGroups}
        product={product}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Configure groups" }));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ groupId: "toppings" }),
    ]);

    const explicit = {
      ...product,
      optionGroupAssignments: [{ groupId: "toppings" }],
    };
    onChange.mockClear();
    rerender(
      <ProductOptionAssignmentsField
        onChange={onChange}
        optionGroups={fallbackOptionGroups}
        product={explicit}
      />,
    );
    const assignedGroup = screen
      .getByText(
        fallbackOptionGroups.find((group) => group.id === "toppings")!
          .displayName,
        { selector: "strong" },
      )
      .closest("article")!;
    fireEvent.click(assignedGroup.querySelector('input[type="checkbox"]')!);
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
