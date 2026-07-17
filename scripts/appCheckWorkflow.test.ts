import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/app-check-monitoring-uat.yml",
  "utf8",
);
const browserUat = readFileSync("scripts/wp3BrowserUat.mjs", "utf8");
const browserStep = workflow.slice(
  workflow.indexOf("Run App Check Customer-to-Staff browser UAT and cleanup"),
  workflow.indexOf("Run ordinary-Staff emergency-control browser UAT"),
);
const baselineStep = workflow.slice(
  workflow.indexOf("Establish enabled isolated-UAT intake baseline"),
  workflow.indexOf("Deploy monitoring client to isolated UAT Hosting only"),
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

  it("asserts the deployed normal-UAT artifact identity independently of designated Staff", () => {
    expect(browserStep).toContain(
      "CUSTOMER_UAT_EXPECTED_APP_ENVIRONMENT: customer-qr-uat",
    );
    expect(browserStep).not.toContain(
      "CUSTOMER_UAT_EXPECTED_APP_ENVIRONMENT: release-rehearsal",
    );
    expect(browserUat).toContain("CUSTOMER_UAT_EXPECTED_APP_ENVIRONMENT");
    expect(browserUat).toContain(
      "actualAppEnvironment === expectedAppEnvironment",
    );
    expect(browserUat).toContain(
      'isReleaseRehearsalArtifact =\n  expectedAppEnvironment === "release-rehearsal"',
    );
    expect(browserUat).toContain("if (isReleaseRehearsalArtifact)");
  });

  it("recovers a prior fail-closed run only inside the exact isolated UAT boundary", () => {
    expect(baselineStep).toContain(
      'test "$CUSTOMER_UAT_FIREBASE_PROJECT_ID" = "greek-yogert-customer-uat-2026"',
    );
    expect(baselineStep).toContain(
      'test "$CUSTOMER_UAT_FIREBASE_PROJECT_ID" != "greek-yogert"',
    );
    expect(baselineStep).toContain("--command set-control --enabled true");
    expect(baselineStep).toContain("--confirm WP5_SET_CUSTOMER_ORDERING");
    expect(
      workflow.indexOf("Establish enabled isolated-UAT intake baseline"),
    ).toBeLessThan(
      workflow.indexOf(
        "Run App Check Customer-to-Staff browser UAT and cleanup",
      ),
    );
    expect(
      workflow.indexOf("Fail closed after an isolated-UAT rehearsal failure"),
    ).toBeGreaterThan(
      workflow.indexOf(
        "Run App Check Customer-to-Staff browser UAT and cleanup",
      ),
    );
  });
});
