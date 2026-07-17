const isolatedUatProjectId = "greek-yogert-customer-uat-2026";
const headlessRecaptchaStorageAccessError =
  "console:requestStorageAccess: Permission denied.";

export function resolveAppCheckDebugBoundary(environment) {
  const mode = environment.CUSTOMER_UAT_APP_CHECK_DEBUG_MODE;
  const token = environment.CUSTOMER_UAT_APP_CHECK_DEBUG_TOKEN;
  if (!mode && !token) return { enabled: false };
  if (mode !== "ci")
    throw new Error("App Check debug provider requires the exact CI mode");
  if (environment.CUSTOMER_UAT_FIREBASE_PROJECT_ID !== isolatedUatProjectId)
    throw new Error(
      "App Check debug provider requires the exact isolated UAT project",
    );
  if (typeof token !== "string" || token.length < 20 || /\s/.test(token))
    throw new Error("App Check CI debug token is missing or malformed");
  return { enabled: true, token };
}

export async function installAppCheckDebugBoundary(context, boundary) {
  if (!boundary.enabled) return;
  await context.addInitScript(
    ({ token }) => {
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = token;
    },
    { token: boundary.token },
  );
}

export function resolveAppCheckBrowserConsoleAllowance(
  boundary,
  expectedAppEnvironment,
) {
  return boundary.enabled && expectedAppEnvironment === "customer-qr-uat"
    ? [headlessRecaptchaStorageAccessError]
    : [];
}
