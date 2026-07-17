import { describe, expect, it } from "vitest";
import {
  assertNoSensitiveManifestFields,
  assertWp5Identity,
  wp5Environment,
  wp5ProjectId,
  wp5WorkflowIdentity,
} from "./wp5ReleaseManifest.mjs";

const validIdentity = {
  sourceSha: "a".repeat(40),
  targetProjectId: wp5ProjectId,
  viteProjectId: wp5ProjectId,
  environment: wp5Environment,
  customerQrEnabled: "true",
  workflowIdentity: wp5WorkflowIdentity,
  deploymentScope: ["firestore:rules", "firestore:indexes", "hosting"],
};

describe("WP5 release rehearsal guards", () => {
  it("accepts only the exact isolated release identity", () => {
    expect(() => assertWp5Identity(validIdentity)).not.toThrow();
  });

  it.each([
    { targetProjectId: "greek-yogert", viteProjectId: "greek-yogert" },
    { targetProjectId: "another-project", viteProjectId: "another-project" },
    { viteProjectId: "greek-yogert" },
    { environment: "production" },
    { sourceSha: "abc" },
    { deploymentScope: ["firestore", "hosting"] },
  ])("rejects unsafe identity override %j", (override) => {
    expect(() =>
      assertWp5Identity({ ...validIdentity, ...override }),
    ).toThrow();
  });

  it.each([undefined, "", "TRUE", "1"])(
    "rejects malformed Customer QR state %s",
    (customerQrEnabled) => {
      expect(() =>
        assertWp5Identity({ ...validIdentity, customerQrEnabled }),
      ).toThrow();
    },
  );

  it("rejects sensitive manifest fields recursively", () => {
    expect(() =>
      assertNoSensitiveManifestFields({ evidence: { staffUid: "hidden" } }),
    ).toThrow(/Sensitive field/);
    expect(() =>
      assertNoSensitiveManifestFields({ credentials: { value: "hidden" } }),
    ).toThrow(/Sensitive field/);
  });
});
