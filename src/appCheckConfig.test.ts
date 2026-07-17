import { describe, expect, it } from "vitest";
import {
  appCheckProvider,
  appCheckUatProjectId,
  resolveAppCheckConfiguration,
  shouldBundleAppCheck,
} from "./appCheckConfig";

const validInput = {
  VITE_APP_ENVIRONMENT: "customer-qr-uat",
  VITE_FIREBASE_PROJECT_ID: appCheckUatProjectId,
  VITE_FIREBASE_APP_CHECK_ENABLED: "true",
  VITE_FIREBASE_APP_CHECK_PROVIDER: appCheckProvider,
  VITE_FIREBASE_APP_CHECK_SITE_KEY: "UatRecaptchaEnterpriseSiteKey_123456",
};

describe("App Check configuration", () => {
  it("accepts only the exact isolated UAT monitoring configuration", () => {
    expect(resolveAppCheckConfiguration(validInput)).toEqual({
      configured: true,
      environment: "customer-qr-uat",
      projectId: appCheckUatProjectId,
      provider: appCheckProvider,
      monitoringOnly: true,
      reason: "configured",
      siteKey: validInput.VITE_FIREBASE_APP_CHECK_SITE_KEY,
    });
    expect(shouldBundleAppCheck(validInput)).toBe(true);
  });

  it.each([
    [
      { ...validInput, VITE_FIREBASE_APP_CHECK_ENABLED: "TRUE" },
      "explicitly-disabled",
    ],
    [
      { ...validInput, VITE_APP_ENVIRONMENT: "production" },
      "environment-not-allowed",
    ],
    [
      { ...validInput, VITE_APP_ENVIRONMENT: "release-rehearsal" },
      "environment-not-allowed",
    ],
    [
      { ...validInput, VITE_FIREBASE_PROJECT_ID: "greek-yogert" },
      "project-not-allowed",
    ],
    [{ ...validInput, VITE_FIREBASE_PROJECT_ID: "" }, "project-not-allowed"],
    [
      { ...validInput, VITE_FIREBASE_APP_CHECK_PROVIDER: "recaptcha-v3" },
      "provider-not-allowed",
    ],
    [
      { ...validInput, VITE_FIREBASE_APP_CHECK_SITE_KEY: "" },
      "site-key-invalid",
    ],
    [
      {
        ...validInput,
        VITE_FIREBASE_APP_CHECK_SITE_KEY: "contains whitespace",
      },
      "site-key-invalid",
    ],
  ])("fails safely for an invalid boundary", (input, reason) => {
    const resolved = resolveAppCheckConfiguration(input);
    expect(resolved.configured).toBe(false);
    expect(resolved.reason).toBe(reason);
    expect(resolved.provider).toBe("none");
    expect(resolved).not.toHaveProperty("siteKey");
    expect(shouldBundleAppCheck(input)).toBe(false);
  });
});
