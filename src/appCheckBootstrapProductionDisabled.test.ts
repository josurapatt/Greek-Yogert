import { beforeEach, describe, expect, it } from "vitest";
import { getAppCheckDiagnostics } from "./appCheckDiagnostics";
import { initializeAppCheckBeforeFirebaseServices } from "./appCheckBootstrapProductionDisabled";

describe("Production App Check bootstrap", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-app-check-configured");
  });

  it("remains explicitly disabled for the exact Production build", () => {
    initializeAppCheckBeforeFirebaseServices(null, {
      VITE_APP_ENVIRONMENT: "production",
      VITE_FIREBASE_PROJECT_ID: "greek-yogert",
    });

    expect(getAppCheckDiagnostics()).toMatchObject({
      configured: false,
      environment: "production",
      projectId: "greek-yogert",
      provider: "none",
      state: "disabled",
      reason: "explicitly-disabled",
    });
  });
});
