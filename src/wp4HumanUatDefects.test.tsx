import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProductModal from "./components/ProductModal";
import CustomerOrderingOperationsPanel from "./components/CustomerOrderingOperationsPanel";
import CustomerOrderPage from "./pages/CustomerOrderPage";
import { customerRequestLimits } from "./customerRequestPolicy";
import { defaultProducts } from "./data";

const mocks = vi.hoisted(() => ({
  useCustomer: vi.fn(),
  useAuth: vi.fn(),
  useData: vi.fn(),
}));
vi.mock("./customerFirebase", () => ({ useCustomer: mocks.useCustomer }));
vi.mock("./store", () => ({
  useAuth: mocks.useAuth,
  useData: mocks.useData,
}));

afterEach(cleanup);

const plain = defaultProducts.find((entry) => entry.id === "plain-greek")!;
const toppingProduct = defaultProducts.find(
  (entry) => entry.optionMode === "toppings",
)!;

describe("WP4 Human UAT Customer limit feedback", () => {
  beforeEach(() => {
    mocks.useCustomer.mockReturnValue({
      products: [plain],
      availability: {},
      loading: false,
      orderingControl: { status: "enabled", enabled: true, message: "" },
      pendingSubmission: null,
      activeRequestId: null,
      submit: vi.fn(),
      retryPending: vi.fn(),
    });
  });

  it("accepts ten units and explains the blocked eleventh without changing quantity", () => {
    const { container } = render(
      <ProductModal
        product={plain}
        channel="หน้าร้าน"
        availability={{}}
        customerLimits
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    const increase = container.querySelector(
      ".quantity button:last-child",
    ) as HTMLButtonElement;
    for (
      let count = 1;
      count < customerRequestLimits.maxQuantityPerLine;
      count += 1
    )
      fireEvent.click(increase);
    expect(container.querySelector(".quantity b")?.textContent).toBe("10");
    expect(screen.queryByText(/สูงสุด 10 ถ้วยต่อรายการ/)).toBeNull();

    fireEvent.click(increase);
    expect(screen.getByText(/สูงสุด 10 ถ้วยต่อรายการ/)).toBeTruthy();
    expect(container.querySelector(".quantity b")?.textContent).toBe("10");

    fireEvent.click(container.querySelector(".quantity button")!);
    expect(screen.queryByText(/สูงสุด 10 ถ้วยต่อรายการ/)).toBeNull();
  });

  it("shows the configured maximum and blocks the eleventh topping with feedback", () => {
    const { container } = render(
      <ProductModal
        product={{ ...toppingProduct, maxSelectedOptions: 10 }}
        channel="หน้าร้าน"
        availability={{}}
        customerLimits
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText(/เมนูนี้เลือกได้สูงสุด 10 อย่าง/)).toBeTruthy();
    const increase = container.querySelector(
      ".topping-row button:last-child",
    ) as HTMLButtonElement;
    for (let count = 0; count < 10; count += 1) fireEvent.click(increase);
    expect(container.querySelector(".validation")).toBeNull();
    fireEvent.click(increase);
    expect(container.querySelector(".validation")?.textContent).toContain(
      "เลือกแล้ว 10 อย่าง",
    );
    expect(container.querySelector(".selection-count")?.textContent).toContain(
      "10",
    );
    fireEvent.click(container.querySelector(".topping-row button")!);
    expect(container.querySelector(".validation")).toBeNull();
  });

  it("uses a lower product-specific topping maximum before the absolute cap", () => {
    const { container } = render(
      <ProductModal
        product={{ ...toppingProduct, maxSelectedOptions: 4 }}
        channel="หน้าร้าน"
        availability={{}}
        customerLimits
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText(/เมนูนี้เลือกได้สูงสุด 4 อย่าง/)).toBeTruthy();
    const increase = container.querySelector(
      ".topping-row button:last-child",
    ) as HTMLButtonElement;
    for (let count = 0; count < 5; count += 1) fireEvent.click(increase);
    expect(container.querySelector(".validation")?.textContent).toContain(
      "เลือกแล้ว 4 อย่าง",
    );
    expect(container.querySelector(".selection-count")?.textContent).toContain(
      "4",
    );
  });

  it("shows nickname and note counters, rejects boundary plus one, and clears feedback", () => {
    render(
      <MemoryRouter>
        <CustomerOrderPage />
      </MemoryRouter>,
    );
    const name = screen.getByPlaceholderText("ชื่อเล่น (ไม่บังคับ)");
    const note = screen.getByPlaceholderText("หมายเหตุถึงร้าน (ไม่บังคับ)");
    fireEvent.change(name, {
      target: {
        value: "ก".repeat(customerRequestLimits.maxCustomerNameLength + 1),
      },
    });
    fireEvent.change(note, {
      target: {
        value: "ข".repeat(customerRequestLimits.maxCustomerNoteLength + 1),
      },
    });
    expect(screen.getByText("ชื่อเล่น 41/40 ตัวอักษร")).toBeTruthy();
    expect(screen.getByText(/ชื่อเล่นยาวเกิน 40/)).toBeTruthy();
    expect(screen.getByText("หมายเหตุ 201/200 ตัวอักษร")).toBeTruthy();
    expect(screen.getByText(/หมายเหตุยาวเกิน 200/)).toBeTruthy();

    fireEvent.change(name, { target: { value: "ก".repeat(40) } });
    fireEvent.change(note, { target: { value: "ข".repeat(200) } });
    expect(screen.queryByText(/ชื่อเล่นยาวเกิน/)).toBeNull();
    expect(screen.queryByText(/หมายเหตุยาวเกิน/)).toBeNull();
  });

  it("offers the existing pending status instead of another normal submission", () => {
    mocks.useCustomer.mockReturnValue({
      ...mocks.useCustomer(),
      activeRequestId: "request-existing",
    });
    render(
      <MemoryRouter>
        <CustomerOrderPage />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", {
      name: "กลับไปดูสถานะคำขอเดิม",
    });
    expect(link.getAttribute("href")).toBe("/order/status/request-existing");
    expect(screen.getByText(/ระบบจะไม่สร้างคำขอใหม่จากแท็บนี้/)).toBeTruthy();
  });
});

describe("WP4 Human UAT operations presentation", () => {
  beforeEach(() => {
    mocks.useData.mockReturnValue({
      products: [],
      toppingAvailability: {},
      customerRequests: [],
    });
  });

  it("clearly distinguishes ordinary and capable Staff without internal fields", () => {
    mocks.useAuth.mockReturnValue({
      user: { uid: "ordinary", email: "ordinary@example.test" },
    });
    const view = render(<CustomerOrderingOperationsPanel />);
    expect(
      screen.getByText("ปิดรับคำสั่งซื้อได้ แต่ไม่มีสิทธิ์เปิดกลับ"),
    ).toBeTruthy();
    expect(screen.queryByText(/capability/i)).toBeNull();

    mocks.useAuth.mockReturnValue({
      user: {
        uid: "capable",
        email: "capable@example.test",
        canManageCustomerOrdering: true,
      },
    });
    view.rerender(<CustomerOrderingOperationsPanel />);
    expect(screen.getByText("มีสิทธิ์เปิดรับคำสั่งซื้อกลับ")).toBeTruthy();
    expect(screen.getByText(/ไม่ใช่การบล็อกอัตโนมัติ/)).toBeTruthy();
  });
});
