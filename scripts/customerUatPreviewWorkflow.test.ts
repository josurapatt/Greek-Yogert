import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/deploy-customer-qr-uat.yml",
  "utf8",
).replace(/\r\n?/g, "\n");
const firebaseConfig = JSON.parse(
  readFileSync("firebase.customer-uat.json", "utf8"),
) as {
  hosting?: {
    public?: string;
    rewrites?: Array<{ source?: string; destination?: string }>;
  };
};

const jobGuard = workflow.slice(
  workflow.indexOf("  deploy-customer-uat:"),
  workflow.indexOf("    runs-on:", workflow.indexOf("  deploy-customer-uat:")),
);
const liveDeployment = workflow.slice(
  workflow.indexOf("Deploy isolated UAT Firebase resources"),
  workflow.indexOf("Deploy WP-CC-02 isolated Firestore Rules"),
);
const rulesDeployment = workflow.slice(
  workflow.indexOf("Deploy WP-CC-02 isolated Firestore Rules"),
  workflow.indexOf("Deploy WP-CC-02 isolated Hosting preview"),
);
const previewDeployment = workflow.slice(
  workflow.indexOf("Deploy WP-CC-02 isolated Hosting preview"),
  workflow.indexOf("Run WP4 security and operational-control UAT"),
);

describe("WP-CC-02 Customer UAT Rules and Hosting preview workflow", () => {
  it("adds only the exact WP-CC-02 branch to the established allowlist", () => {
    const branches = new Set(
      [...jobGuard.matchAll(/feature\/[a-z0-9-]+/g)].map(([branch]) => branch),
    );

    expect(branches).toEqual(
      new Set([
        "feature/customer-qr-ordering-foundation",
        "feature/production-rollout-hardening",
        "feature/production-security-authorization",
        "feature/trusted-customer-boundary",
        "feature/anonymous-abuse-controls",
        "feature/wp-cc-02-catalogue-admin",
      ]),
    );
  });

  it("keeps the existing resource deployment mutually exclusive", () => {
    expect(liveDeployment).toContain(
      "github.head_ref != 'feature/wp-cc-02-catalogue-admin'",
    );
    expect(liveDeployment).toContain(
      "github.ref != 'refs/heads/feature/wp-cc-02-catalogue-admin'",
    );
    expect(liveDeployment).toContain(
      "--only hosting,firestore:rules,firestore:indexes",
    );
  });

  it("hard-binds the preview to isolated UAT and its encrypted secrets", () => {
    expect(workflow).toContain("environment: customer-qr-uat");
    expect(rulesDeployment).toContain(
      'test "$SOURCE_BRANCH" = "feature/wp-cc-02-catalogue-admin"',
    );
    expect(rulesDeployment).toContain(
      'test "$(git rev-parse HEAD)" = "$EXPECTED_SHA"',
    );
    expect(rulesDeployment).toContain(
      'test "$CUSTOMER_UAT_FIREBASE_PROJECT_ID" = "greek-yogert-customer-uat-2026"',
    );
    expect(rulesDeployment).toContain(
      'test "$CUSTOMER_UAT_FIREBASE_PROJECT_ID" != "greek-yogert"',
    );
    expect(rulesDeployment).toContain(
      "credential.project_id !== process.env.CUSTOMER_UAT_FIREBASE_PROJECT_ID",
    );
    expect(previewDeployment).toContain(
      'test "$SOURCE_BRANCH" = "feature/wp-cc-02-catalogue-admin"',
    );
    expect(previewDeployment).toContain(
      'test "$(git rev-parse HEAD)" = "$EXPECTED_SHA"',
    );
    expect(previewDeployment).toContain(
      'test "$CUSTOMER_UAT_FIREBASE_PROJECT_ID" = "greek-yogert-customer-uat-2026"',
    );
    expect(previewDeployment).toContain(
      'test "$CUSTOMER_UAT_FIREBASE_PROJECT_ID" != "greek-yogert"',
    );
    expect(previewDeployment).toContain(
      "credential.project_id !== process.env.CUSTOMER_UAT_FIREBASE_PROJECT_ID",
    );
    expect(previewDeployment).toContain(
      "secrets.CUSTOMER_UAT_FIREBASE_PROJECT_ID",
    );
    expect(previewDeployment).toContain(
      "secrets.CUSTOMER_UAT_FIREBASE_SERVICE_ACCOUNT_JSON",
    );

    for (const secret of [
      "CUSTOMER_UAT_FIREBASE_API_KEY",
      "CUSTOMER_UAT_FIREBASE_AUTH_DOMAIN",
      "CUSTOMER_UAT_FIREBASE_PROJECT_ID",
      "CUSTOMER_UAT_FIREBASE_STORAGE_BUCKET",
      "CUSTOMER_UAT_FIREBASE_MESSAGING_SENDER_ID",
      "CUSTOMER_UAT_FIREBASE_APP_ID",
      "CUSTOMER_UAT_FIREBASE_SERVICE_ACCOUNT_JSON",
    ]) {
      expect(workflow).toContain(`secrets.${secret}`);
    }
  });

  it("runs Rules tests before deploying only the canonical Firestore Rules", () => {
    expect(workflow.indexOf("pnpm test:rules")).toBeLessThan(
      workflow.indexOf("Deploy WP-CC-02 isolated Firestore Rules"),
    );
    expect(rulesDeployment).toContain(
      "config.firestore?.rules !== 'firestore.production.rules'",
    );
    expect(rulesDeployment).toContain("sha256sum firestore.production.rules");
    expect(rulesDeployment).toMatch(/--only\s+firestore:rules/);
    expect(rulesDeployment).not.toContain("firestore:indexes");
    expect(rulesDeployment).not.toContain("storage:rules");
    expect(rulesDeployment).not.toContain("functions:");
  });

  it("deploys only the seven-day WP-CC-02 Hosting Preview Channel after Rules", () => {
    expect(previewDeployment).toContain(
      "hosting:channel:deploy wp-cc-02-catalogue",
    );
    expect(previewDeployment).toContain("--config firebase.customer-uat.json");
    expect(previewDeployment).toContain("--expires 7d");
    expect(previewDeployment).toContain("--no-authorized-domains");
    expect(previewDeployment).not.toMatch(
      /--only\s+(?:firestore|storage|functions)/i,
    );
    expect(previewDeployment).not.toContain("firestore:rules");
    expect(previewDeployment).not.toContain("firestore:indexes");
    expect(previewDeployment).not.toContain("storage:rules");
    expect(previewDeployment).not.toContain("functions:");
  });

  it("uses one Hosting build for Staff and Customer routes", () => {
    expect(firebaseConfig.hosting?.public).toBe("dist");
    expect(firebaseConfig.hosting?.rewrites).toContainEqual({
      source: "**",
      destination: "/index.html",
    });
    expect(previewDeployment).toContain("Staff URL:");
    expect(previewDeployment).toContain("Customer URL:");
    expect(previewDeployment).toContain("$preview_url/order");
  });

  it("does not print encrypted secret values", () => {
    const runScripts = [rulesDeployment, previewDeployment]
      .map((deployment) =>
        deployment.slice(deployment.indexOf("        run: |")),
      )
      .join("\n");

    expect(runScripts).not.toContain("secrets.");
    expect(runScripts).not.toMatch(
      /echo\s+["']?\$(?:CUSTOMER_UAT_FIREBASE_SERVICE_ACCOUNT_JSON|GOOGLE_APPLICATION_CREDENTIALS)/,
    );
    expect(runScripts).not.toContain('cat "$GOOGLE_APPLICATION_CREDENTIALS"');
  });
});
