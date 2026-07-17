export const appCheckUatProjectId = "greek-yogert-customer-uat-2026" as const;
export const appCheckProvider = "recaptcha-enterprise" as const;

export interface AppCheckEnvironment {
  VITE_APP_ENVIRONMENT?: unknown;
  VITE_FIREBASE_PROJECT_ID?: unknown;
  VITE_FIREBASE_APP_CHECK_ENABLED?: unknown;
  VITE_FIREBASE_APP_CHECK_PROVIDER?: unknown;
  VITE_FIREBASE_APP_CHECK_SITE_KEY?: unknown;
}

export type AppCheckConfigurationReason =
  | "configured"
  | "explicitly-disabled"
  | "environment-not-allowed"
  | "project-not-allowed"
  | "provider-not-allowed"
  | "site-key-invalid";

export interface ResolvedAppCheckConfiguration {
  configured: boolean;
  environment: string;
  projectId: string;
  provider: typeof appCheckProvider | "none";
  monitoringOnly: true;
  reason: AppCheckConfigurationReason;
  siteKey?: string;
}

export function isValidRecaptchaEnterpriseSiteKey(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,200}$/.test(value);
}

export function resolveAppCheckConfiguration(
  input: AppCheckEnvironment,
): ResolvedAppCheckConfiguration {
  const environment =
    typeof input.VITE_APP_ENVIRONMENT === "string"
      ? input.VITE_APP_ENVIRONMENT
      : "unknown";
  const projectId =
    typeof input.VITE_FIREBASE_PROJECT_ID === "string"
      ? input.VITE_FIREBASE_PROJECT_ID
      : "unknown";
  const base = {
    configured: false,
    environment,
    projectId,
    provider: "none" as const,
    monitoringOnly: true as const,
  };

  if (input.VITE_FIREBASE_APP_CHECK_ENABLED !== "true")
    return { ...base, reason: "explicitly-disabled" };
  if (environment !== "customer-qr-uat")
    return { ...base, reason: "environment-not-allowed" };
  if (projectId !== appCheckUatProjectId)
    return { ...base, reason: "project-not-allowed" };
  if (input.VITE_FIREBASE_APP_CHECK_PROVIDER !== appCheckProvider)
    return { ...base, reason: "provider-not-allowed" };
  if (
    !isValidRecaptchaEnterpriseSiteKey(input.VITE_FIREBASE_APP_CHECK_SITE_KEY)
  )
    return { ...base, reason: "site-key-invalid" };

  return {
    configured: true,
    environment,
    projectId,
    provider: appCheckProvider,
    monitoringOnly: true,
    reason: "configured",
    siteKey: input.VITE_FIREBASE_APP_CHECK_SITE_KEY as string,
  };
}

export function shouldBundleAppCheck(input: AppCheckEnvironment) {
  return resolveAppCheckConfiguration(input).configured;
}
