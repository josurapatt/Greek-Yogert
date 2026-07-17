import {
  ReCaptchaEnterpriseProvider,
  getToken,
  initializeAppCheck,
} from "firebase/app-check";
import type { FirebaseApp } from "firebase/app";
import {
  resolveAppCheckConfiguration,
  type AppCheckEnvironment,
} from "./appCheckConfig";
import {
  getAppCheckDiagnostics,
  setAppCheckConfigurationDiagnostics,
  setAppCheckDiagnostics,
} from "./appCheckDiagnostics";

export function initializeAppCheckBeforeFirebaseServices(
  app: FirebaseApp | null,
  environment: AppCheckEnvironment,
) {
  const configuration = resolveAppCheckConfiguration(environment);
  setAppCheckConfigurationDiagnostics(configuration, Boolean(app));
  if (!app || !configuration.configured || !configuration.siteKey) return;

  try {
    const instance = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(configuration.siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    void getToken(instance).then(
      () =>
        setAppCheckDiagnostics({
          ...getAppCheckDiagnostics(),
          state: "token-obtained",
        }),
      () =>
        setAppCheckDiagnostics({
          ...getAppCheckDiagnostics(),
          state: "token-failed",
        }),
    );
  } catch {
    setAppCheckDiagnostics({
      ...getAppCheckDiagnostics(),
      state: "initialization-failed",
    });
  }
}
