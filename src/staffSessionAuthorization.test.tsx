import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  onAuthStateChanged: vi.fn(),
  signOut: vi.fn(),
}));
const firestoreMocks = vi.hoisted(() => ({ getDoc: vi.fn(), doc: vi.fn() }));

vi.mock("firebase/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("firebase/auth")>()),
  onAuthStateChanged: authMocks.onAuthStateChanged,
  signOut: authMocks.signOut,
}));

vi.mock("firebase/firestore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("firebase/firestore")>()),
  doc: firestoreMocks.doc,
  getDoc: firestoreMocks.getDoc,
}));

vi.mock("./firebase", () => ({
  auth: { name: "firebase-auth" },
  db: { name: "firestore" },
  firebaseReady: true,
}));

vi.mock("./runtimeConfig", () => ({
  runtimeConfig: { customerQrEnabled: false },
}));

import { AuthProvider, useAuth } from "./store";

function SessionProbe() {
  const { authorizationError, loading, user } = useAuth();
  return (
    <span>
      {loading ? "loading" : (user?.uid ?? authorizationError ?? "signed-out")}
    </span>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Firebase Staff session authorization", () => {
  it("checks an active Staff document even when Customer QR is disabled", async () => {
    firestoreMocks.doc.mockReturnValue({ path: "users/staff-user" });
    authMocks.onAuthStateChanged.mockImplementation((_auth, callback) => {
      callback({
        uid: "staff-user",
        email: "staff@example.test",
        isAnonymous: false,
      });
      return () => undefined;
    });
    firestoreMocks.getDoc.mockResolvedValue({
      data: () => ({ role: "staff", active: true }),
    });

    render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText("staff-user")).toBeTruthy());
    expect(firestoreMocks.getDoc).toHaveBeenCalledTimes(1);
    expect(authMocks.signOut).not.toHaveBeenCalled();
  });

  it("fails closed for a non-authorized Firebase Staff session", async () => {
    firestoreMocks.doc.mockReturnValue({ path: "users/email-user" });
    authMocks.onAuthStateChanged.mockImplementation((_auth, callback) => {
      callback({
        uid: "email-user",
        email: "user@example.test",
        isAnonymous: false,
      });
      return () => undefined;
    });
    firestoreMocks.getDoc.mockResolvedValue({ data: () => undefined });
    authMocks.signOut.mockResolvedValue(undefined);

    render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(authMocks.signOut).toHaveBeenCalledTimes(1));
    expect(firestoreMocks.getDoc).toHaveBeenCalledTimes(1);
  });
});
