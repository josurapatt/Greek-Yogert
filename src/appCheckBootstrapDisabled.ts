import type { FirebaseApp } from "firebase/app";
import {
  resolveAppCheckConfiguration,
  type AppCheckEnvironment,
} from "./appCheckConfig";
import { setAppCheckConfigurationDiagnostics } from "./appCheckDiagnostics";

export function initializeAppCheckBeforeFirebaseServices(
  app: FirebaseApp | null,
  environment: AppCheckEnvironment,
) {
  setAppCheckConfigurationDiagnostics(
    resolveAppCheckConfiguration(environment),
    Boolean(app),
  );
}
