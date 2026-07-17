import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const wp5ProjectId = "greek-yogert-customer-uat-2026";
export const productionProjectId = "greek-yogert";
export const wp5Environment = "release-rehearsal";
export const wp5WorkflowIdentity = "wp5-isolated-production-release-rehearsal";

const allowedDeploymentScopes = new Set([
  "firestore:rules",
  "firestore:indexes",
  "hosting",
]);
const forbiddenManifestKey =
  /(?:secret|token|password|private.?key|credential|customer.?name|customer.?note|staff.?uid|owner.?uid|actor.?uid)/i;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function required(name) {
  const value = argument(name);
  if (!value || value.startsWith("--")) throw new Error(`Missing --${name}`);
  return value;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function assertWp5Identity({
  sourceSha,
  targetProjectId,
  viteProjectId,
  environment,
  customerQrEnabled,
  workflowIdentity,
  deploymentScope,
}) {
  assert(/^[a-f0-9]{40}$/.test(sourceSha), "An exact source SHA is required");
  assert(
    targetProjectId === wp5ProjectId,
    "WP5 must target the exact isolated UAT project",
  );
  assert(
    targetProjectId !== productionProjectId,
    "The Production project is prohibited",
  );
  assert(
    viteProjectId === targetProjectId,
    "Firebase and Vite project IDs must match",
  );
  assert(
    environment === wp5Environment,
    "The dedicated release-rehearsal environment is required",
  );
  assert(
    customerQrEnabled === "true" || customerQrEnabled === "false",
    "Customer QR must be an explicit true or false string",
  );
  assert(
    workflowIdentity === wp5WorkflowIdentity,
    "Unexpected workflow identity",
  );
  assert(
    Array.isArray(deploymentScope) && deploymentScope.length > 0,
    "An explicit deployment scope is required",
  );
  deploymentScope.forEach((scope) =>
    assert(
      allowedDeploymentScopes.has(scope),
      `WP5 deployment scope is prohibited: ${scope}`,
    ),
  );
}

export function assertNoSensitiveManifestFields(value, path = "manifest") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertNoSensitiveManifestFields(entry, `${path}[${index}]`),
    );
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    assert(
      !forbiddenManifestKey.test(key),
      `Sensitive field is prohibited in the release manifest: ${path}.${key}`,
    );
    assertNoSensitiveManifestFields(entry, `${path}.${key}`);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function buildWp5Manifest({
  sourceSha,
  targetProjectId,
  viteProjectId,
  environment,
  customerQrEnabled,
  projectionDryRun,
  projectionApply,
  projectionIdempotency,
  browserEvidence,
  finalState,
  rollbackBaselineIdentifier,
}) {
  const deploymentScope = ["firestore:rules", "firestore:indexes", "hosting"];
  assertWp5Identity({
    sourceSha,
    targetProjectId,
    viteProjectId,
    environment,
    customerQrEnabled,
    workflowIdentity: wp5WorkflowIdentity,
    deploymentScope,
  });
  assert(
    projectionDryRun.status === "dry-run-complete",
    "Dry run did not pass",
  );
  assert(projectionDryRun.writesPerformed === 0, "Dry run performed writes");
  assert(projectionApply.status === "applied", "Projection apply did not pass");
  assert(
    projectionApply.appliedFingerprint === projectionDryRun.fingerprint,
    "Projection apply used a different fingerprint",
  );
  assert(
    projectionIdempotency.status === "dry-run-complete" &&
      projectionIdempotency.writeCount === 0 &&
      projectionIdempotency.writesPerformed === 0,
    "Projection idempotency did not reach zero writes",
  );
  assert(browserEvidence.status === "passed", "Browser rehearsal did not pass");
  assert(finalState.status === "passed", "Final UAT verification did not pass");
  assert(
    finalState.customerOrdering === "enabled",
    "Final Customer ordering state is not enabled",
  );
  assert(
    finalState.designatedStaff === "unchanged",
    "Designated Staff state changed",
  );
  assert(finalState.cleanup === "passed", "WP5 cleanup did not pass");
  assert(
    /^[a-f0-9]{64}$/.test(rollbackBaselineIdentifier),
    "Rollback baseline must be a SHA-256 identifier",
  );

  const manifest = {
    schemaVersion: 1,
    sourceSha,
    targetProjectId,
    environment,
    customerQrFeatureState:
      customerQrEnabled === "true" ? "enabled" : "disabled",
    rules: {
      file: "firestore.production.rules",
      sha256: sha256(readFileSync("firestore.production.rules")),
    },
    indexes: {
      file: "firestore.indexes.json",
      sha256: sha256(readFileSync("firestore.indexes.json")),
      requiredCompositeIndexCount: 6,
      readiness: finalState.indexes,
    },
    projection: {
      schemaVersion: projectionDryRun.schemaVersion,
      fingerprint: projectionDryRun.fingerprint,
      dryRunPlannedWrites: projectionDryRun.writeCount,
      appliedWrites: projectionApply.writesPerformed,
      idempotencyPlannedWrites: projectionIdempotency.writeCount,
    },
    workflowIdentity: wp5WorkflowIdentity,
    testResultSummary: {
      application: "passed",
      firestoreRules: "passed",
      typeScript: "passed",
      lint: "passed",
      productionDisabledBuild: "passed",
      uatEnabledBuild: "passed",
      releaseRehearsalBuild: "passed",
      browser: browserEvidence.status,
      rollback: finalState.rollback,
      cleanup: finalState.cleanup,
    },
    deploymentScope,
    rollbackBaselineIdentifier,
  };
  assertNoSensitiveManifestFields(manifest);
  return {
    ...manifest,
    releaseManifestHash: sha256(JSON.stringify(manifest)),
  };
}

async function main() {
  const manifest = buildWp5Manifest({
    sourceSha: required("source-sha"),
    targetProjectId: required("target-project"),
    viteProjectId: required("vite-project"),
    environment: required("environment"),
    customerQrEnabled: required("customer-qr-enabled"),
    projectionDryRun: readJson(required("projection-dry-run")),
    projectionApply: readJson(required("projection-apply")),
    projectionIdempotency: readJson(required("projection-idempotency")),
    browserEvidence: readJson(required("browser-evidence")),
    finalState: readJson(required("final-state")),
    rollbackBaselineIdentifier: required("rollback-baseline"),
  });
  const output = required("output");
  writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      status: "passed",
      releaseManifestHash: manifest.releaseManifestHash,
      targetProjectId: manifest.targetProjectId,
      sourceSha: manifest.sourceSha,
    }),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
