import { describe, expect, it } from "vitest";
import { resolveProductionRuntimeConfig } from "./runtimeConfigProduction";

describe("Production runtime configuration", () => {
  it("enables Customer QR only for the exact Production boundary", () => {
    expect(
      resolveProductionRuntimeConfig({
        VITE_APP_ENVIRONMENT: "production",
        VITE_CUSTOMER_QR_ENABLED: "true",
        VITE_FIREBASE_PROJECT_ID: "greek-yogert",
      }),
    ).toEqual({
      environment: "production",
      customerQrEnabled: true,
      isCustomerQrUat: false,
      isReleaseRehearsal: false,
    });
  });

  it.each([
    {},
    {
      VITE_APP_ENVIRONMENT: "production",
      VITE_CUSTOMER_QR_ENABLED: "false",
      VITE_FIREBASE_PROJECT_ID: "greek-yogert",
    },
    {
      VITE_APP_ENVIRONMENT: "production",
      VITE_CUSTOMER_QR_ENABLED: "true",
      VITE_FIREBASE_PROJECT_ID: "another-project",
    },
    {
      VITE_APP_ENVIRONMENT: "unexpected",
      VITE_CUSTOMER_QR_ENABLED: "true",
      VITE_FIREBASE_PROJECT_ID: "greek-yogert",
    },
  ])("fails closed outside the exact Production boundary", (input) => {
    expect(resolveProductionRuntimeConfig(input).customerQrEnabled).toBe(false);
  });
});
