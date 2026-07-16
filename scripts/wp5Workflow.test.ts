import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/full-isolated-production-release-rehearsal.yml",
  "utf8",
);
const productionWorkflow = readFileSync(
  ".github/workflows/deploy-firebase.yml",
  "utf8",
);

describe("WP5 isolated release workflow", () => {
  it("is Draft-PR/manual controlled with concurrency and the UAT environment", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("github.event.pull_request.draft == true");
    expect(workflow).toContain("concurrency:");
    expect(workflow).toContain("environment: customer-qr-uat");
    expect(workflow).not.toContain("environment: production");
  });

  it("hard-requires isolated UAT and explicitly rejects Production", () => {
    expect(workflow).toContain(
      'test "$CUSTOMER_UAT_FIREBASE_PROJECT_ID" = "greek-yogert-customer-uat-2026"',
    );
    expect(workflow).toContain(
      'test "$CUSTOMER_UAT_FIREBASE_PROJECT_ID" != "greek-yogert"',
    );
    expect(workflow).toContain(
      'test "$VITE_FIREBASE_PROJECT_ID" = "$CUSTOMER_UAT_FIREBASE_PROJECT_ID"',
    );
    expect(workflow).not.toContain("secrets.FIREBASE_SERVICE_ACCOUNT_JSON");
    expect(workflow).not.toContain("secrets.FIREBASE_PROJECT_ID");
  });

  it("deploys only exact Rules, indexes, or Hosting scopes", () => {
    const onlyScopes = [...workflow.matchAll(/--only ([^\s]+)(?:\s|$)/g)].map(
      (match) => match[1],
    );
    expect(onlyScopes.length).toBeGreaterThan(0);
    expect(
      onlyScopes.every((scope) =>
        ["firestore:rules,firestore:indexes", "hosting"].includes(scope),
      ),
    ).toBe(true);
  });

  it("leaves the safeguarded Production workflow Customer-disabled", () => {
    expect(productionWorkflow).toContain('VITE_CUSTOMER_QR_ENABLED: "false"');
    expect(productionWorkflow).toContain("--only hosting");
  });
});
