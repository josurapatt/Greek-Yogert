import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  onAuthStateChanged: vi.fn(),
  signInAnonymously: vi.fn(),
}));
const firestoreMocks = vi.hoisted(() => ({ onSnapshot: vi.fn() }));

vi.mock("firebase/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("firebase/auth")>()),
  onAuthStateChanged: authMocks.onAuthStateChanged,
  signInAnonymously: authMocks.signInAnonymously,
}));

vi.mock("firebase/firestore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("firebase/firestore")>()),
  onSnapshot: firestoreMocks.onSnapshot,
}));

vi.mock("./firebase", () => ({
  auth: { name: "staff-firebase-auth" },
  db: { name: "staff-firestore" },
  firebaseReady: true,
}));

import {
  CustomerProvider,
  shouldInitializeCustomerFirebase,
  useCustomer,
} from "./customerFirebase";
import CustomerUnavailablePage from "./pages/CustomerUnavailablePage";

function CustomerProbe() {
  const { loading } = useCustomer();
  return <span>{loading ? "loading" : "disabled"}</span>;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("disabled Customer Firebase isolation", () => {
  it("does not initialize the Customer auth listener or Anonymous Authentication", async () => {
    render(
      <CustomerProvider enabled={false}>
        <CustomerProbe />
      </CustomerProvider>,
    );

    await waitFor(() => expect(screen.getByText("disabled")).toBeTruthy());
    expect(shouldInitializeCustomerFirebase(false, true)).toBe(false);
    expect(authMocks.onAuthStateChanged).not.toHaveBeenCalled();
    expect(authMocks.signInAnonymously).not.toHaveBeenCalled();
    expect(firestoreMocks.onSnapshot).not.toHaveBeenCalled();
  });

  it("shows a controlled Thai unavailable response", () => {
    render(<CustomerUnavailablePage />);
    expect(
      screen.getByRole("heading", {
        name: "ยังไม่เปิดรับคำสั่งซื้อออนไลน์",
      }),
    ).toBeTruthy();
    expect(screen.queryByText(/เข้าสู่ระบบ/)).toBeNull();
  });
});
