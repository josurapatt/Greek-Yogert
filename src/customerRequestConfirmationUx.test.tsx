import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CustomerRequestDetailPage from "./pages/CustomerRequestDetailPage";
import {
  customerConfirmationFailureMessage,
  paymentRequiredMessage,
} from "./customerConfirmationUx";
import type { CustomerOrderRequest } from "./types";

const mocks = vi.hoisted(() => ({
  firestore: {},
  request: {
    id: "request-ui-valid",
    ownerUid: "anonymous-owner",
    status: "รอร้านยืนยัน",
    channel: "หน้าร้าน",
    customerName: "WP3-AUTO-UI-VALID-RETEST",
    items: [
      {
        id: "line-1",
        productId: "apple-ohlala",
        productName: "Apple Ohlala",
        basePrice: 69,
        selectedOptions: ["กราโนล่ารสกล้วย"],
        selectedOptionIds: ["กล้วย"],
        selectedChannel: "หน้าร้าน",
        quantity: 1,
        unitPrice: 69,
        lineTotal: 69,
      },
    ],
    subtotal: 69,
    total: 69,
    itemCount: 1,
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
  } as CustomerOrderRequest,
  confirm: vi.fn(),
  reconcile: vi.fn(),
  dismiss: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("./firebase", () => ({ db: mocks.firestore }));
vi.mock("./store", () => ({
  useAuth: () => ({ user: { uid: "staff-user" } }),
  useData: () => ({
    customerRequests: [mocks.request],
    dismissCustomerRequest: mocks.dismiss,
  }),
}));
vi.mock("./customerRequestActions", () => ({
  confirmCustomerRequestTransaction: mocks.confirm,
  rejectCustomerRequestTransaction: vi.fn(),
  requestIsStillPending: mocks.reconcile,
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
    useParams: () => ({ id: mocks.request.id }),
  };
});

beforeEach(() => {
  mocks.confirm.mockReset().mockResolvedValue(undefined);
  mocks.reconcile.mockReset().mockResolvedValue(true);
  mocks.dismiss.mockReset();
  mocks.navigate.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <CustomerRequestDetailPage />
    </MemoryRouter>,
  );
}

describe("Staff Customer request confirmation UI", () => {
  it("shows accessible payment guidance, clears it, then confirms and navigates", async () => {
    renderPage();
    const confirm = screen.getByRole("button", {
      name: "ยืนยันและสร้างคิว",
    });
    expect(confirm.getAttribute("disabled")).toBeNull();

    fireEvent.click(confirm);
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(
      paymentRequiredMessage,
    );
    const payment = screen.getByRole("combobox", {
      name: "วิธีชำระเงิน Apple Ohlala",
    });
    expect(payment.getAttribute("aria-invalid")).toBe("true");
    expect(payment.getAttribute("aria-describedby")).toBe(
      "customer-request-payment-error",
    );

    fireEvent.change(payment, { target: { value: "สด" } });
    expect(screen.queryByText(paymentRequiredMessage)).toBeNull();
    fireEvent.click(confirm);

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
    expect(mocks.confirm).toHaveBeenCalledWith(
      mocks.firestore,
      mocks.request.id,
      { "line-1": "สด" },
      "staff-user",
    );
    expect(mocks.dismiss).toHaveBeenCalledWith(mocks.request.id);
    expect(mocks.navigate).toHaveBeenCalledWith("/queue");
  });

  it("shows a safe mismatch result and keeps the request pending", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.confirm.mockRejectedValueOnce(
      new Error(
        "คำขอไม่ตรงกับเมนูปัจจุบัน: ข้อมูลรายการ selectedOptions ไม่ตรงกับข้อมูลที่เชื่อถือได้",
      ),
    );
    renderPage();
    fireEvent.change(
      screen.getByRole("combobox", {
        name: "วิธีชำระเงิน Apple Ohlala",
      }),
      { target: { value: "สด" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันและสร้างคิว" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "กรุณาให้ลูกค้าแก้ไขหรือสร้างคำขอใหม่",
      ),
    );
    expect(screen.queryByText(/ข้อมูลรายการ selectedOptions/)).toBeNull();
    expect(mocks.dismiss).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("maps permission and unexpected failures without exposing technical details", () => {
    const permission = Object.assign(
      new Error("internal document path and rules detail"),
      { code: "permission-denied" },
    );
    expect(customerConfirmationFailureMessage(permission)).toBe(
      "ไม่สามารถยืนยันคำสั่งซื้อได้ กรุณาตรวจสอบสิทธิ์พนักงานแล้วลองใหม่",
    );
    expect(customerConfirmationFailureMessage(new Error("private stack"))).toBe(
      "ยืนยันคำสั่งซื้อไม่สำเร็จ ระบบยังไม่ได้สร้างคิว กรุณาลองใหม่อีกครั้ง",
    );
  });
});
