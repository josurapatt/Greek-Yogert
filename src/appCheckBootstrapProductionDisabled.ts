import type { FirebaseApp } from "firebase/app";
import { setAppCheckDiagnostics } from "./appCheckDiagnostics";

interface ProductionAppCheckEnvironment {
  VITE_APP_ENVIRONMENT?: unknown;
  VITE_FIREBASE_PROJECT_ID?: unknown;
}

export function initializeAppCheckBeforeFirebaseServices(
  _app: FirebaseApp | null,
  environment: ProductionAppCheckEnvironment,
) {
  setAppCheckDiagnostics({
    configured: false,
    environment:
      typeof environment.VITE_APP_ENVIRONMENT === "string"
        ? environment.VITE_APP_ENVIRONMENT
        : "unknown",
    projectId:
      typeof environment.VITE_FIREBASE_PROJECT_ID === "string"
        ? environment.VITE_FIREBASE_PROJECT_ID
        : "unknown",
    provider: "none",
    mode: "monitoring-only",
    state: "disabled",
    reason: "explicitly-disabled",
  });
}
