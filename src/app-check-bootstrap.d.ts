declare module "@app-check-bootstrap" {
  import type { FirebaseApp } from "firebase/app";
  import type { AppCheckEnvironment } from "./appCheckConfig";

  export function initializeAppCheckBeforeFirebaseServices(
    app: FirebaseApp | null,
    environment: AppCheckEnvironment,
  ): void;
}
