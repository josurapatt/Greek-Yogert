import { beforeEach, describe, expect, it, vi } from "vitest";

const initialization = vi.hoisted(() => ({
  sequence: [] as string[],
  initializeApp: vi.fn(() => {
    initialization.sequence.push("firebase-app");
    return { name: "firebase-app" };
  }),
  getApps: vi.fn(() => []),
  getApp: vi.fn(() => ({ name: "existing-app" })),
  appCheck: vi.fn(() => initialization.sequence.push("app-check")),
  getAuth: vi.fn(() => {
    initialization.sequence.push("auth");
    return { name: "auth" };
  }),
  getFirestore: vi.fn(() => {
    initialization.sequence.push("firestore");
    return { name: "firestore" };
  }),
  setPersistence: vi.fn(() => Promise.resolve()),
}));

vi.mock("firebase/app", () => ({
  initializeApp: initialization.initializeApp,
  getApps: initialization.getApps,
  getApp: initialization.getApp,
}));
vi.mock("firebase/auth", () => ({
  getAuth: initialization.getAuth,
  setPersistence: initialization.setPersistence,
  browserLocalPersistence: { name: "browser-local" },
}));
vi.mock("firebase/firestore", () => ({
  getFirestore: initialization.getFirestore,
}));
vi.mock("@app-check-bootstrap", () => ({
  initializeAppCheckBeforeFirebaseServices: initialization.appCheck,
}));

const firebaseVariables = {
  VITE_FIREBASE_API_KEY: "api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "uat.example",
  VITE_FIREBASE_PROJECT_ID: "greek-yogert-customer-uat-2026",
  VITE_FIREBASE_STORAGE_BUCKET: "uat-bucket",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123",
  VITE_FIREBASE_APP_ID: "app-id",
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  initialization.sequence.length = 0;
  initialization.getApps.mockReturnValue([]);
  Object.entries(firebaseVariables).forEach(([key, value]) =>
    vi.stubEnv(key, value),
  );
});

describe("Firebase initialization ordering", () => {
  it("initializes App Check before Auth and Firestore and only once across concurrent imports", async () => {
    await Promise.all([import("./firebase"), import("./firebase")]);

    expect(initialization.initializeApp).toHaveBeenCalledTimes(1);
    expect(initialization.appCheck).toHaveBeenCalledTimes(1);
    expect(initialization.getAuth).toHaveBeenCalledTimes(1);
    expect(initialization.getFirestore).toHaveBeenCalledTimes(1);
    expect(initialization.sequence).toEqual([
      "firebase-app",
      "app-check",
      "auth",
      "firestore",
    ]);
    expect(initialization.setPersistence).toHaveBeenCalledTimes(1);
  });

  it("reuses an existing Firebase app without creating a second instance", async () => {
    initialization.getApps.mockReturnValue([{ name: "existing-app" }] as never);
    await import("./firebase");

    expect(initialization.initializeApp).not.toHaveBeenCalled();
    expect(initialization.getApp).toHaveBeenCalledTimes(1);
    expect(initialization.sequence).toEqual(["app-check", "auth", "firestore"]);
  });
});
