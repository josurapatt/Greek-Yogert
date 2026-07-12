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
    });
  });
});
