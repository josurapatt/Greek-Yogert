export const appEnvironments = [
  "local",
  "customer-qr-uat",
  "release-rehearsal",
  "production",
] as const;

export const releaseRehearsalProjectId =
  "greek-yogert-customer-uat-2026" as const;

export type AppEnvironment = (typeof appEnvironments)[number] | "unknown";

export interface RuntimeConfig {
  environment: AppEnvironment;
  customerQrEnabled: boolean;
  isCustomerQrUat: boolean;
  isReleaseRehearsal: boolean;
}

interface RuntimeEnvironment {
  VITE_APP_ENVIRONMENT?: unknown;
  VITE_CUSTOMER_QR_ENABLED?: unknown;
  VITE_FIREBASE_PROJECT_ID?: unknown;
}

export function resolveRuntimeConfig(input: RuntimeEnvironment): RuntimeConfig {
  const environment = appEnvironments.includes(
    input.VITE_APP_ENVIRONMENT as (typeof appEnvironments)[number],
  )
    ? (input.VITE_APP_ENVIRONMENT as (typeof appEnvironments)[number])
    : "unknown";

  const isReleaseRehearsal = environment === "release-rehearsal";
  const hasValidRehearsalTarget =
    !isReleaseRehearsal ||
    input.VITE_FIREBASE_PROJECT_ID === releaseRehearsalProjectId;

  return {
    environment,
    customerQrEnabled:
      environment !== "unknown" &&
      hasValidRehearsalTarget &&
      input.VITE_CUSTOMER_QR_ENABLED === "true",
    isCustomerQrUat: environment === "customer-qr-uat",
    isReleaseRehearsal,
  };
}

export const runtimeConfig = resolveRuntimeConfig({
  VITE_APP_ENVIRONMENT: import.meta.env.VITE_APP_ENVIRONMENT,
  VITE_CUSTOMER_QR_ENABLED: import.meta.env.VITE_CUSTOMER_QR_ENABLED,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
});

export const customerQrStaffLabel = runtimeConfig.isCustomerQrUat
  ? "Customer QR Demo/UAT"
  : "Customer QR";

if (typeof document !== "undefined")
  document.documentElement.dataset.appEnvironment = runtimeConfig.environment;
