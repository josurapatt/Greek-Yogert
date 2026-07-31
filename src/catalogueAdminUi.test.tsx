import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultProducts, normalizeProduct } from "./data";
import { fallbackOptionGroups } from "./optionCatalogue";
import type { OptionGroup, Product } from "./types";

const mocks = vi.hoisted(() => ({
  catalogueError: "",
  optionGroups: [] as OptionGroup[],
  products: [] as Product[],
  saveOptionGroup: vi.fn(async () => undefined),
  saveProduct: vi.fn(async () => undefined),
  setToppingAvailability: vi.fn(async () => undefined),
}));

vi.mock("./store", () => ({
  useData: () => ({
    optionGroups: mocks.optionGroups,
    catalogueError: mocks.catalogueError,
    products: mocks.products,
    toppingAvailability: {},
    saveOptionGroup: mocks.saveOptionGroup,
    saveProduct: mocks.saveProduct,
    setToppingAvailability: mocks.setToppingAvailability,
  }),
}));

import OptionGroupManager from "./components/OptionGroupManager";
import ProductOptionAssignmentsField from "./components/ProductOptionAssignmentsField";
import ProductsPage from "./pages/ProductsPage";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.catalogueError = "";
  mocks.optionGroups = structuredClone(fallbackOptionGroups);
  mocks.products = structuredClone(defaultProducts);
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
    expect(screen.getByRole("heading", { name: "ท็อปปิ้ง" })).toBeTruthy();
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
    expect(
      screen.getByLabelText("จำนวนเลือกขั้นต่ำ (0 = ไม่จำเป็น)"),
    ).toBeTruthy();
    expect(screen.getByLabelText("จำนวนเลือกสูงสุด")).toBeTruthy();
    const advanced = screen
      .getByText("การตั้งค่าขั้นสูง")
      .closest("details") as HTMLDetailsElement;
    expect(advanced.open).toBe(false);
    expect(screen.getByLabelText("อนุญาตให้เลือกซ้ำ")).toBeTruthy();
    expect(screen.getByText("ราคาเพิ่มตามตัวเลือก")).toBeTruthy();
    expect(
      screen.getByText("ยังไม่มีตัวเลือก กด “เพิ่มตัวเลือก” เพื่อเริ่มต้น"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /เพิ่มตัวเลือก/ }));
    expect(
      (screen.getByLabelText("ชื่อตัวเลือก") as HTMLInputElement).value,
    ).toBe("ตัวเลือกใหม่");
    const choiceAdvanced = screen
      .getByText("ข้อมูลเพิ่มเติมและการเก็บถาวร")
      .closest("details") as HTMLDetailsElement;
    expect(choiceAdvanced.open).toBe(false);
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
    const toppingCard = screen.getByText("ท็อปปิ้ง").closest("article")!;
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
      screen.getByText(/สินค้าเดิมนี้ยังใช้รูปแบบ ท็อปปิ้ง แบบเก่า/),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "เปลี่ยนมาใช้กลุ่มตัวเลือก" }),
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
      screen.getByRole("button", { name: "กลับไปใช้รูปแบบเดิม" }),
    ).toBeTruthy();
  });

  it("edits classification and channel surcharges from a choice status card", async () => {
    render(<ProductsPage />);

    fireEvent.click(screen.getByRole("button", { name: /กล้วย.*รสกราโนล่า/ }));
    expect(screen.getByRole("heading", { name: "แก้ไข กล้วย" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("ประเภทตัวเลือก"), {
      target: { value: "premium" },
    });
    fireEvent.change(screen.getByLabelText("ราคาเพิ่มเริ่มต้น"), {
      target: { value: "12" },
    });
    fireEvent.change(screen.getByLabelText("ราคาเพิ่ม LINE MAN"), {
      target: { value: "18" },
    });
    fireEvent.change(screen.getByLabelText("ราคาเพิ่ม Customer QR"), {
      target: { value: "15" },
    });
    fireEvent.click(screen.getByRole("button", { name: /บันทึกรายละเอียด/ }));

    await waitFor(() => expect(mocks.saveOptionGroup).toHaveBeenCalledOnce());
    const [saved] = mocks.saveOptionGroup.mock.calls[0] as unknown as [
      OptionGroup,
      OptionGroup,
    ];
    expect(
      saved.choices.find((choice) => choice.name === "กล้วย"),
    ).toMatchObject({
      classification: "premium",
      surcharge: 12,
      channelSurcharges: {
        Lineman: 18,
        customerQr: 15,
      },
    });
  });

  it("opens and closes a Choice directly from its status card", async () => {
    render(<ProductsPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "ปิดขาย" })[0]);
    await waitFor(() =>
      expect(mocks.setToppingAvailability).toHaveBeenCalledWith(
        expect.any(String),
        false,
      ),
    );
    expect(screen.queryByRole("heading", { name: /แก้ไข/ })).toBeNull();
  });

  it("shows a clear authorization denial from the direct status action", async () => {
    mocks.setToppingAvailability.mockRejectedValueOnce(
      Object.assign(new Error("7 PERMISSION_DENIED"), {
        code: "permission-denied",
      }),
    );
    render(<ProductsPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "ปิดขาย" })[0]);

    expect((await screen.findByRole("alert")).textContent).toBe(
      "บัญชีนี้ไม่มีสิทธิ์บันทึกแคตตาล็อก กรุณาตรวจสอบสิทธิ์พนักงาน",
    );
  });

  it("starts new products in the catalogue assignment workflow", async () => {
    render(<ProductsPage />);

    fireEvent.click(screen.getByRole("button", { name: /เพิ่มสินค้า/ }));
    expect(screen.getByText("กลุ่มตัวเลือกที่ผูกกับสินค้า")).toBeTruthy();
    expect(screen.queryByText("การตั้งค่าตัวเลือกแบบเดิม")).toBeNull();
    const granolaGroup = screen
      .getByText("รสกราโนล่า", { selector: "strong" })
      .closest("article")!;
    fireEvent.click(granolaGroup.querySelector('input[type="checkbox"]')!);
    fireEvent.change(screen.getByLabelText("ราคาหน้าร้าน"), {
      target: { value: "59" },
    });
    fireEvent.click(screen.getByRole("button", { name: /บันทึกสินค้า/ }));

    await waitFor(() => expect(mocks.saveProduct).toHaveBeenCalledOnce());
    const [savedProduct] = mocks.saveProduct.mock.calls[0] as unknown as [
      Product,
    ];
    expect(savedProduct).toMatchObject({
      optionGroupAssignments: [{ groupId: "granola-flavour" }],
    });
  });
});
