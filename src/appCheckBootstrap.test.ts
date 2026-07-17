import { beforeEach, describe, expect, it, vi } from "vitest";
import { appCheckUatProjectId } from "./appCheckConfig";
import {
  getAppCheckDiagnostics,
  setAppCheckDiagnostics,
} from "./appCheckDiagnostics";

const appCheckMocks = vi.hoisted(() => ({
  providerKeys: [] as string[],
  initializeAppCheck: vi.fn(),
  getToken: vi.fn(),
}));

vi.mock("firebase/app-check", () => ({
  ReCaptchaEnterpriseProvider: class {
    constructor(siteKey: string) {
      appCheckMocks.providerKeys.push(siteKey);
    }
  },
  initializeAppCheck: appCheckMocks.initializeAppCheck,
  getToken: appCheckMocks.getToken,
}));

import { initializeAppCheckBeforeFirebaseServices } from "./appCheckBootstrapEnabled";

const environment = {
  VITE_APP_ENVIRONMENT: "customer-qr-uat",
  VITE_FIREBASE_PROJECT_ID: appCheckUatProjectId,
  VITE_FIREBASE_APP_CHECK_ENABLED: "true",
  VITE_FIREBASE_APP_CHECK_PROVIDER: "recaptcha-enterprise",
  VITE_FIREBASE_APP_CHECK_SITE_KEY: "UatRecaptchaEnterpriseSiteKey_123456",
};

beforeEach(() => {
  vi.clearAllMocks();
  appCheckMocks.providerKeys.length = 0;
  appCheckMocks.initializeAppCheck.mockReturnValue({ app: "check" });
  appCheckMocks.getToken.mockResolvedValue({ token: "must-not-be-reported" });
  setAppCheckDiagnostics({
    configured: false,
    environment: "unknown",
    projectId: "unknown",
    provider: "none",
    mode: "monitoring-only",
    state: "disabled",
    reason: "explicitly-disabled",
  });
});

describe("App Check SDK bootstrap", () => {
  it("selects ReCaptchaEnterpriseProvider and obtains a token without exposing it", async () => {
    initializeAppCheckBeforeFirebaseServices(
      { name: "uat" } as never,
      environment,
    );

    expect(appCheckMocks.providerKeys).toEqual([
      environment.VITE_FIREBASE_APP_CHECK_SITE_KEY,
    ]);
    expect(appCheckMocks.initializeAppCheck).toHaveBeenCalledWith(
      { name: "uat" },
      expect.objectContaining({ isTokenAutoRefreshEnabled: true }),
    );
    expect(appCheckMocks.getToken).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(getAppCheckDiagnostics().state).toBe("token-obtained"),
    );
    expect(JSON.stringify(getAppCheckDiagnostics())).not.toContain(
      "must-not-be-reported",
    );
    expect(getAppCheckDiagnostics()).toMatchObject({
      configured: true,
      provider: "recaptcha-enterprise",
      mode: "monitoring-only",
      environment: "customer-qr-uat",
      projectId: appCheckUatProjectId,
    });
  });

  it("does not initialize a provider for missing or malformed configuration", () => {
    initializeAppCheckBeforeFirebaseServices({ name: "uat" } as never, {
      ...environment,
      VITE_FIREBASE_APP_CHECK_SITE_KEY: "",
    });

    expect(appCheckMocks.initializeAppCheck).not.toHaveBeenCalled();
    expect(appCheckMocks.getToken).not.toHaveBeenCalled();
    expect(getAppCheckDiagnostics()).toMatchObject({
      configured: false,
      provider: "none",
      state: "initialization-failed",
      reason: "site-key-invalid",
    });
  });

  it("reports token acquisition failure without throwing into Firebase startup", async () => {
    appCheckMocks.getToken.mockRejectedValue(
      new Error("attestation unavailable"),
    );
    expect(() =>
      initializeAppCheckBeforeFirebaseServices(
        { name: "uat" } as never,
        environment,
      ),
    ).not.toThrow();
    await vi.waitFor(() =>
      expect(getAppCheckDiagnostics().state).toBe("token-failed"),
    );
  });
});
