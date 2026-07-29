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

    expect(screen.getByRole("alert").textContent).toBe(
      "กลุ่มตัวเลือก ID toppings มีตัวเลือกเกินจำนวนสูงสุด 50 รายการ",
    );
    expect(screen.getByText(/ID: toppings/)).toBeTruthy();
  });

  it("renders the Catalogue administration controls in operational Thai", () => {
    render(<OptionGroupManager />);

    expect(
      screen.getByRole("heading", { name: "กลุ่มตัวเลือกและท็อปปิ้ง" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /เพิ่มกลุ่มตัวเลือก/ }),
    ).toBeTruthy();
    expect(
      screen.getAllByText(/จำเป็นต้องเลือก|ไม่จำเป็นต้องเลือก/).length,
    ).toBe(fallbackOptionGroups.length);
    expect(screen.getAllByText("เปิดใช้งาน")).toHaveLength(
      fallbackOptionGroups.length,
    );
  });

  it("shows Thai empty, archive, restore, pricing, and lifecycle wording", () => {
    render(<OptionGroupManager />);
    fireEvent.click(screen.getByRole("button", { name: /เพิ่มกลุ่มตัวเลือก/ }));

    expect(
      screen.getByRole("heading", { name: "เพิ่มกลุ่มตัวเลือก" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("ชื่อที่แสดง")).toBeTruthy();
    expect((screen.getByLabelText("ID ถาวร") as HTMLInputElement).value).toBe(
      "ระบบจะสร้างเมื่อบันทึก",
    );
    expect(screen.getByLabelText("จำนวนเลือกขั้นต่ำ")).toBeTruthy();
    expect(screen.getByLabelText("จำนวนเลือกสูงสุด")).toBeTruthy();
    expect(screen.getByLabelText("อนุญาตให้เลือกซ้ำ")).toBeTruthy();
    expect(screen.getByText("ราคาเพิ่มตามตัวเลือก")).toBeTruthy();
    expect(
      screen.getByText("ยังไม่มีตัวเลือก กด “เพิ่มตัวเลือก” เพื่อเริ่มต้น"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /เพิ่มตัวเลือก/ }));
    expect(
      (screen.getByLabelText("ชื่อตัวเลือก") as HTMLInputElement).value,
    ).toBe("ตัวเลือกใหม่");
    expect((screen.getByLabelText("ประเภท") as HTMLSelectElement).value).toBe(
      "normal",
    );
    expect(screen.getByText("ปกติ")).toBeTruthy();
    expect(screen.getByText("พรีเมียม")).toBeTruthy();
    expect(screen.getByLabelText("ราคาเพิ่ม")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /เก็บถาวร/ }));
    expect(screen.getByLabelText("กู้คืนตัวเลือก")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("กู้คืนตัวเลือก"));
    expect(screen.getByLabelText("เปิดใช้งานตัวเลือก")).toBeTruthy();
  });

  it("shows Catalogue save validation in Thai", async () => {
    mocks.saveOptionGroup.mockRejectedValueOnce(
      new Error("Option group sauce has an invalid selection range"),
    );
    render(<OptionGroupManager />);
    fireEvent.click(screen.getByRole("button", { name: /เพิ่มกลุ่มตัวเลือก/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /บันทึกกลุ่มตัวเลือก/ }),
    );

    expect(
      await screen.findByText(
        "จำนวนเลือกสูงสุดต้องไม่น้อยกว่าจำนวนเลือกขั้นต่ำ",
      ),
    ).toBeTruthy();
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
        (button) => button.textContent === "แก้ไข",
      )!,
    );

    fireEvent.change(screen.getByLabelText("ชื่อที่แสดง"), {
      target: { value: "Custom toppings" },
    });
    fireEvent.click(screen.getByLabelText("จำเป็นต้องเลือกเป็นค่าเริ่มต้น"));
    fireEvent.click(screen.getByLabelText("อนุญาตให้เลือกซ้ำ"));
    fireEvent.click(screen.getByRole("button", { name: /เพิ่มตัวเลือก/ }));
    const newChoiceName = screen.getAllByLabelText("ชื่อตัวเลือก").at(-1)!;
    fireEvent.change(newChoiceName, { target: { value: "Vanilla crunch" } });
    fireEvent.click(
      screen.getByRole("button", { name: /บันทึกกลุ่มตัวเลือก/ }),
    );

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
    expect(
      screen.getByText(
        "สินค้านี้ยังใช้การตั้งค่าตัวเลือกแบบเดิม (ท็อปปิ้ง) เปลี่ยนเป็นการผูกกลุ่มตัวเลือกเฉพาะเมื่อต้องการตั้งค่าแต่ละกลุ่มโดยตรง",
      ),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "ตั้งค่ากลุ่มตัวเลือก" }),
    );
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
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("ยกเลิกการผูก"),
    );
    expect(screen.getByLabelText("จำเป็นต้องเลือก")).toBeTruthy();
    expect(screen.getByLabelText("จำนวนเลือกขั้นต่ำ")).toBeTruthy();
    expect(screen.getByLabelText("จำนวนเลือกสูงสุด")).toBeTruthy();
    expect(
      screen.getByLabelText("อนุญาตตัวเลือกที่เปิดใช้งานทั้งหมด"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "ใช้ช่องตัวเลือกสินค้าแบบเดิม" }),
    ).toBeTruthy();
  });
});
