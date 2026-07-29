import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { shouldBundleAppCheck } from "./src/appCheckConfig.js";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const environment = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const bootstrap =
    environment.VITE_APP_ENVIRONMENT === "production"
      ? "./src/appCheckBootstrapProductionDisabled.ts"
      : shouldBundleAppCheck(environment)
        ? "./src/appCheckBootstrapEnabled.ts"
        : "./src/appCheckBootstrapDisabled.ts";
  const runtimeConfig =
    environment.VITE_APP_ENVIRONMENT === "production"
      ? "./src/runtimeConfigProduction.ts"
      : "./src/runtimeConfig.ts";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@app-check-bootstrap": fileURLToPath(
          new URL(bootstrap, import.meta.url),
        ),
        "@runtime-config": fileURLToPath(
          new URL(runtimeConfig, import.meta.url),
        ),
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      exclude: ["**/node_modules/**", "firestore.production.test.ts"],
    },
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks: (id) =>
            id.includes("/node_modules/firebase/") ||
            id.includes("/node_modules/@firebase/")
              ? "firebase"
              : undefined,
        },
      },
    },
  };
});
