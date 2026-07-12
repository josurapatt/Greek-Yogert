export const appEnvironments = [
  "local",
  "customer-qr-uat",
  "production",
] as const;

export type AppEnvironment = (typeof appEnvironments)[number] | "unknown";

export interface RuntimeConfig {
  environment: AppEnvironment;
  customerQrEnabled: boolean;
  isCustomerQrUat: boolean;
}

interface RuntimeEnvironment {
  VITE_APP_ENVIRONMENT?: unknown;
  VITE_CUSTOMER_QR_ENABLED?: unknown;
}

export function resolveRuntimeConfig(input: RuntimeEnvironment): RuntimeConfig {
  const environment = appEnvironments.includes(
    input.VITE_APP_ENVIRONMENT as (typeof appEnvironments)[number],
  )
    ? (input.VITE_APP_ENVIRONMENT as (typeof appEnvironments)[number])
    : "unknown";

  return {
    environment,
    customerQrEnabled:
      environment !== "unknown" && input.VITE_CUSTOMER_QR_ENABLED === "true",
    isCustomerQrUat: environment === "customer-qr-uat",
  };
}

export const runtimeConfig = resolveRuntimeConfig({
  VITE_APP_ENVIRONMENT: import.meta.env.VITE_APP_ENVIRONMENT,
  VITE_CUSTOMER_QR_ENABLED: import.meta.env.VITE_CUSTOMER_QR_ENABLED,
});
