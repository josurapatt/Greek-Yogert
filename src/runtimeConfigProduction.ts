const productionEnvironment = "production" as const;
const productionProjectId = "greek-yogert" as const;

interface ProductionRuntimeEnvironment {
  VITE_APP_ENVIRONMENT?: unknown;
  VITE_CUSTOMER_QR_ENABLED?: unknown;
  VITE_FIREBASE_PROJECT_ID?: unknown;
}

export function resolveProductionRuntimeConfig(
  input: ProductionRuntimeEnvironment,
) {
  const hasExactEnvironment =
    input.VITE_APP_ENVIRONMENT === productionEnvironment;
  const hasExactProject =
    input.VITE_FIREBASE_PROJECT_ID === productionProjectId;

  return {
    environment: hasExactEnvironment ? productionEnvironment : "unknown",
    customerQrEnabled:
      hasExactEnvironment &&
      hasExactProject &&
      input.VITE_CUSTOMER_QR_ENABLED === "true",
    isCustomerQrUat: false,
    isReleaseRehearsal: false,
  } as const;
}

export const runtimeConfig = resolveProductionRuntimeConfig({
  VITE_APP_ENVIRONMENT: import.meta.env.VITE_APP_ENVIRONMENT,
  VITE_CUSTOMER_QR_ENABLED: import.meta.env.VITE_CUSTOMER_QR_ENABLED,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
});

export const customerQrStaffLabel = "Customer QR";

if (typeof document !== "undefined")
  document.documentElement.dataset.appEnvironment = runtimeConfig.environment;
