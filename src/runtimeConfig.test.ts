import { describe, expect, it } from "vitest";
import { resolveRuntimeConfig } from "./runtimeConfig";

describe("Customer QR runtime configuration", () => {
  it.each([
    {},
    { VITE_APP_ENVIRONMENT: "local" },
    {
      VITE_APP_ENVIRONMENT: "local",
      VITE_CUSTOMER_QR_ENABLED: "TRUE",
    },
    {
      VITE_APP_ENVIRONMENT: "unexpected",
      VITE_CUSTOMER_QR_ENABLED: "true",
    },
  ])("fails closed for missing or invalid values", (input) => {
    expect(resolveRuntimeConfig(input).customerQrEnabled).toBe(false);
  });

  it("keeps the safeguarded Production build disabled", () => {
    expect(
      resolveRuntimeConfig({
        VITE_APP_ENVIRONMENT: "production",
        VITE_CUSTOMER_QR_ENABLED: "false",
      }),
    ).toEqual({
      environment: "production",
      customerQrEnabled: false,
      isCustomerQrUat: false,
      isReleaseRehearsal: false,
    });
  });

  it("explicitly enables Customer QR UAT and its UAT display mode", () => {
    expect(
      resolveRuntimeConfig({
        VITE_APP_ENVIRONMENT: "customer-qr-uat",
        VITE_CUSTOMER_QR_ENABLED: "true",
      }),
    ).toEqual({
      environment: "customer-qr-uat",
      customerQrEnabled: true,
      isCustomerQrUat: true,
      isReleaseRehearsal: false,
    });
  });

  it("allows an explicit local development choice without inferring UAT mode", () => {
    expect(
      resolveRuntimeConfig({
        VITE_APP_ENVIRONMENT: "local",
        VITE_CUSTOMER_QR_ENABLED: "true",
      }),
    ).toEqual({
      environment: "local",
      customerQrEnabled: true,
      isCustomerQrUat: false,
      isReleaseRehearsal: false,
    });
  });

  it("enables the production-like rehearsal only for the exact isolated project", () => {
    expect(
      resolveRuntimeConfig({
        VITE_APP_ENVIRONMENT: "release-rehearsal",
        VITE_CUSTOMER_QR_ENABLED: "true",
        VITE_FIREBASE_PROJECT_ID: "greek-yogert-customer-uat-2026",
      }),
    ).toEqual({
      environment: "release-rehearsal",
      customerQrEnabled: true,
      isCustomerQrUat: false,
      isReleaseRehearsal: true,
    });
  });

  it.each([undefined, "", "greek-yogert", "another-project"])(
    "fails closed for an invalid rehearsal project %s",
    (projectId) => {
      expect(
        resolveRuntimeConfig({
          VITE_APP_ENVIRONMENT: "release-rehearsal",
          VITE_CUSTOMER_QR_ENABLED: "true",
          VITE_FIREBASE_PROJECT_ID: projectId,
        }).customerQrEnabled,
      ).toBe(false);
    },
  );

  it("keeps a Customer-disabled rehearsal build disabled", () => {
    expect(
      resolveRuntimeConfig({
        VITE_APP_ENVIRONMENT: "release-rehearsal",
        VITE_CUSTOMER_QR_ENABLED: "false",
        VITE_FIREBASE_PROJECT_ID: "greek-yogert-customer-uat-2026",
      }).customerQrEnabled,
    ).toBe(false);
  });
});
