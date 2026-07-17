import type {
  AppCheckConfigurationReason,
  ResolvedAppCheckConfiguration,
} from "./appCheckConfig";

export type AppCheckRuntimeState =
  | "disabled"
  | "configured"
  | "token-obtained"
  | "initialization-failed"
  | "token-failed";

export interface AppCheckDiagnostics {
  configured: boolean;
  environment: string;
  projectId: string;
  provider: "recaptcha-enterprise" | "none";
  mode: "monitoring-only";
  state: AppCheckRuntimeState;
  reason: AppCheckConfigurationReason | "firebase-config-incomplete";
}

let currentDiagnostics: AppCheckDiagnostics = {
  configured: false,
  environment: "unknown",
  projectId: "unknown",
  provider: "none",
  mode: "monitoring-only",
  state: "disabled",
  reason: "explicitly-disabled",
};
const listeners = new Set<() => void>();

function publishDocumentDiagnostics(value: AppCheckDiagnostics) {
  if (typeof document === "undefined") return;
  const dataset = document.documentElement.dataset;
  dataset.appCheckConfigured = String(value.configured);
  dataset.appCheckProvider = value.provider;
  dataset.appCheckMode = value.mode;
  dataset.appCheckState = value.state;
  dataset.appCheckEnvironment = value.environment;
  dataset.appCheckProject = value.projectId;
}

export function setAppCheckDiagnostics(value: AppCheckDiagnostics) {
  currentDiagnostics = Object.freeze({ ...value });
  publishDocumentDiagnostics(currentDiagnostics);
  listeners.forEach((listener) => listener());
}

export function setAppCheckConfigurationDiagnostics(
  configuration: ResolvedAppCheckConfiguration,
  firebaseReady: boolean,
) {
  const valid = configuration.configured && firebaseReady;
  setAppCheckDiagnostics({
    configured: valid,
    environment: configuration.environment,
    projectId: configuration.projectId,
    provider: valid ? configuration.provider : "none",
    mode: "monitoring-only",
    state: valid
      ? "configured"
      : configuration.reason === "explicitly-disabled"
        ? "disabled"
        : "initialization-failed",
    reason: firebaseReady ? configuration.reason : "firebase-config-incomplete",
  });
}

export function getAppCheckDiagnostics() {
  return currentDiagnostics;
}

export function subscribeToAppCheckDiagnostics(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
