import { describe, expect, it, vi } from "vitest";
import {
  installAppCheckDebugBoundary,
  resolveAppCheckDebugBoundary,
  resolveAppCheckBrowserConsoleAllowance,
} from "./appCheckDebugBoundary.mjs";

const valid = {
  CUSTOMER_UAT_APP_CHECK_DEBUG_MODE: "ci",
  CUSTOMER_UAT_APP_CHECK_DEBUG_TOKEN: "registered-uat-debug-token-123456",
  CUSTOMER_UAT_FIREBASE_PROJECT_ID: "greek-yogert-customer-uat-2026",
};

describe("App Check CI debug boundary", () => {
  it("stays inactive in ordinary browser runs", () => {
    expect(resolveAppCheckDebugBoundary({})).toEqual({ enabled: false });
  });

  it("accepts only the exact CI mode and isolated UAT project", () => {
    expect(resolveAppCheckDebugBoundary(valid)).toEqual({
      enabled: true,
      token: valid.CUSTOMER_UAT_APP_CHECK_DEBUG_TOKEN,
    });
    expect(() =>
      resolveAppCheckDebugBoundary({
        ...valid,
        CUSTOMER_UAT_APP_CHECK_DEBUG_MODE: "true",
      }),
    ).toThrow(/exact CI mode/);
    expect(() =>
      resolveAppCheckDebugBoundary({
        ...valid,
        CUSTOMER_UAT_FIREBASE_PROJECT_ID: "greek-yogert",
      }),
    ).toThrow(/exact isolated UAT project/);
    expect(() =>
      resolveAppCheckDebugBoundary({
        ...valid,
        CUSTOMER_UAT_APP_CHECK_DEBUG_TOKEN: "",
      }),
    ).toThrow(/missing or malformed/);
  });

  it("injects the token at browser runtime without logging it", async () => {
    const addInitScript = vi.fn();
    const boundary = resolveAppCheckDebugBoundary(valid);
    await installAppCheckDebugBoundary({ addInitScript }, boundary);
    expect(addInitScript).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(addInitScript.mock.calls)).toContain(
      valid.CUSTOMER_UAT_APP_CHECK_DEBUG_TOKEN,
    );
  });

  it("allows only the exact headless reCAPTCHA storage-access message in normal UAT", () => {
    const boundary = resolveAppCheckDebugBoundary(valid);
    expect(
      resolveAppCheckBrowserConsoleAllowance(boundary, "customer-qr-uat"),
    ).toEqual(["console:requestStorageAccess: Permission denied."]);
    expect(
      resolveAppCheckBrowserConsoleAllowance(boundary, "release-rehearsal"),
    ).toEqual([]);
    expect(
      resolveAppCheckBrowserConsoleAllowance(
        { enabled: false },
        "customer-qr-uat",
      ),
    ).toEqual([]);
  });
});
