import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/app-check-monitoring-uat.yml",
  "utf8",
);

describe("App Check monitoring workflow boundary", () => {
  it("is deliberately triggered, exact-branch-bound, and isolated-UAT-only", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("types: [labeled]");
    expect(workflow).toContain(
      "github.event.label.name == 'run-app-check-uat'",
    );
    expect(workflow).toContain(
      'test "$DISPATCH_BRANCH" = "feature/app-check-monitoring"',
    );
    expect(workflow).toContain(
      'test "$CUSTOMER_UAT_FIREBASE_PROJECT_ID" = "greek-yogert-customer-uat-2026"',
    );
    expect(workflow).toContain(
      'test "$CUSTOMER_UAT_FIREBASE_PROJECT_ID" != "greek-yogert"',
    );
  });

  it("deploys Hosting only and contains no enforcement or billing action", () => {
    expect(workflow).toContain("--only hosting --non-interactive");
    expect(workflow).not.toMatch(/--only\s+(?:firestore|functions|appcheck)/i);
    expect(workflow).not.toMatch(/app-check.*enforc|appcheck.*enforc/i);
    expect(workflow).not.toMatch(/billing|blaze|cloud functions|cloud run/i);
  });

  it("uses encrypted environment secrets and a runtime-only CI debug boundary", () => {
    expect(workflow).toContain("secrets.CUSTOMER_UAT_APP_CHECK_SITE_KEY");
    expect(workflow).toContain("secrets.CUSTOMER_UAT_APP_CHECK_DEBUG_TOKEN");
    expect(workflow).toContain("CUSTOMER_UAT_APP_CHECK_DEBUG_MODE: ci");
    expect(workflow).not.toContain("VITE_FIREBASE_APP_CHECK_DEBUG");
  });

  it("builds and inspects all required release modes", () => {
    expect(workflow).toContain("--mode production-disabled");
    expect(workflow).toContain("--mode normal-uat");
    expect(workflow).toContain("--mode release-rehearsal");
  });
});
