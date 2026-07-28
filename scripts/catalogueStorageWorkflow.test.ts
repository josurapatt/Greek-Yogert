import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/deploy-catalogue-storage-uat.yml",
  "utf8",
);

describe("catalogue Storage deployment gate", () => {
  it("is manual-only, exact-head guarded, and isolated-UAT-only", () => {
    expect(workflow).toMatch(/workflow_dispatch:/);
    expect(workflow).not.toMatch(/^\s+(?:push|pull_request):/m);
    expect(workflow).toContain("APPROVED_ISOLATED_UAT_STORAGE");
    expect(workflow).toContain(
      'test "$(git rev-parse HEAD)" = "$APPROVED_SHA"',
    );
    expect(workflow).toContain(
      'test "$CUSTOMER_UAT_FIREBASE_PROJECT_ID" = "greek-yogert-customer-uat-2026"',
    );
    expect(workflow).toContain(
      'test "$CUSTOMER_UAT_FIREBASE_PROJECT_ID" != "greek-yogert"',
    );
    expect(workflow).toMatch(/--only storage\s+\\/);
    expect(workflow).not.toMatch(/--only\s+(?:hosting|firestore|functions)/);
  });
});
