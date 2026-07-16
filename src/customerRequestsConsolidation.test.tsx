import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { customerStorefrontChannel, waitingForShop } from "./customerOrder";
import CustomerRequestsPage from "./pages/CustomerRequestsPage";
import type { CartItem, CustomerOrderRequest } from "./types";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useData: vi.fn(),
  confirm: vi.fn(),
  reject: vi.fn(),
  stillPending: vi.fn(),
}));

vi.mock("./firebase", () => ({ db: {}, firebaseReady: true }));
vi.mock("./store", () => ({
  useAuth: mocks.useAuth,
  useData: mocks.useData,
}));
vi.mock("./customerRequestActions", () => ({
  confirmCustomerRequestTransaction: mocks.confirm,
  rejectCustomerRequestTransaction: mocks.reject,
  requestIsStillPending: mocks.stillPending,
}));

afterEach(cleanup);

const line: CartItem = {
  id: "line-1",
  productId: "plain-greek",
  productName: "Plain Greek",
  basePrice: 59,
  selectedOptions: [],
  selectedOptionIds: [],
  quantity: 1,
  unitPrice: 59,
  lineTotal: 59,
};

const request = (index: number): CustomerOrderRequest => ({
  id: `request-${String(index).padStart(2, "0")}`,
  ownerUid: `owner-${index}`,
  status: waitingForShop,
  channel: customerStorefrontChannel,
  customerName: index === 1 ? "ค้นหาเฉพาะคนนี้" : `ลูกค้า ${index}`,
  ...(index % 2 === 0 ? { customerNote: `หมายเหตุ ${index}` } : {}),
  items: [{ ...line, id: `line-${index}` }],
  subtotal: 59,
  total: 59,
  itemCount: 1,
  createdAt: "2026-07-16T00:00:00.000Z",
  updatedAt: "2026-07-16T00:00:00.000Z",
});

describe("Customer Requests consolidation", () => {
  const dismissCustomerRequest = vi.fn();

  beforeEach(() => {
    mocks.useAuth.mockReturnValue({ user: { uid: "staff" } });
    mocks.useData.mockReturnValue({
      customerRequests: Array.from({ length: 13 }, (_, index) =>
        request(index + 1),
      ),
      customerRequestsIncomplete: true,
      dismissCustomerRequest,
      products: [],
      toppingAvailability: {},
    });
    mocks.confirm.mockResolvedValue(undefined);
    mocks.reject.mockResolvedValue(undefined);
    mocks.stillPending.mockResolvedValue(true);
  });

  it("contains request work only with list, search, filters, pagination, and details", () => {
    const view = render(
      <MemoryRouter initialEntries={["/customer-requests"]}>
        <CustomerRequestsPage />
      </MemoryRouter>,
    );
    expect(
      view.container.querySelector(".customer-ordering-operations"),
    ).toBeNull();
    expect(view.container.querySelector("#customer-ordering")).toBeNull();
    expect(screen.queryByRole("button", { name: /Seed/ })).toBeNull();
    expect(view.container.querySelectorAll(".queue-card")).toHaveLength(12);
    expect(screen.getByText("หน้า 1 จาก 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "ถัดไป" }));
    expect(view.container.querySelectorAll(".queue-card")).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("ค้นหาคำขอ"), {
      target: { value: "เฉพาะคนนี้" },
    });
    expect(view.container.querySelectorAll(".queue-card")).toHaveLength(1);
    expect(
      screen
        .getByRole("link", { name: "ค้นหาเฉพาะคนนี้" })
        .getAttribute("href"),
    ).toBe("/customer-requests/request-01");

    fireEvent.change(screen.getByLabelText("ค้นหาคำขอ"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("กรองคำขอ"), {
      target: { value: "with-note" },
    });
    expect(view.container.querySelectorAll(".queue-card")).toHaveLength(6);
  });

  it("keeps confirm and reject available regardless of intake control state", async () => {
    mocks.useData.mockReturnValue({
      ...mocks.useData(),
      customerRequests: [request(1)],
      customerOrderingEnabled: false,
    });
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("duplicate");
    const view = render(
      <MemoryRouter initialEntries={["/customer-requests"]}>
        <CustomerRequestsPage />
      </MemoryRouter>,
    );
    const card = view.container.querySelector(".queue-card")!;
    fireEvent.click(card.querySelector("button.primary")!);
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
    fireEvent.click(card.querySelector("button.secondary:last-child")!);
    await waitFor(() => expect(mocks.reject).toHaveBeenCalled());
    expect(prompt).toHaveBeenCalled();
  });
});
