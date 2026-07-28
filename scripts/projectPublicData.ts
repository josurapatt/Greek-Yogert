import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { execFileSync } from "node:child_process";
import { defaultProducts } from "../src/data";
import {
  fallbackOptionGroups,
  maxOptionGroupsPerCatalogue,
  mergeOptionGroupsWithFallback,
  normalizeOptionGroup,
} from "../src/optionCatalogue";
import {
  buildPublicProjection,
  diffPublicProjection,
  projectionFingerprint,
} from "../src/publicProjection";
import type { OptionGroup, Product, ToppingAvailability } from "../src/types";

const productionProject = "greek-yogert";
const uatProject = "greek-yogert-customer-uat-2026";
const offlineProject = "offline-review";
const applyConfirmation = "APPLY_PUBLIC_PROJECTION";
const approvedWriteNamespaces = [
  "optionGroups/*",
  "publicOptionGroups/*",
  "publicMenu/*",
  "publicSettings/toppingAvailability",
  "publicSettings/customerRequestPolicy",
  "publicProjectionControl/current",
] as const;
const forbiddenNamespaces = [
  "users/*",
  "orders/*",
  "customerOrderRequests/*",
  "counters/*",
  "history/*",
  "reports/*",
  "products/*",
  "settings/*",
] as const;

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function required(name: string): string {
  const value = argument(name);
  if (!value || value.startsWith("--")) throw new Error(`Missing --${name}`);
  return value;
}

function exactCurrentValue(actual: unknown, expected: unknown): boolean {
  if (actual === undefined) return false;
  return projectionFingerprint(actual) === projectionFingerprint(expected);
}

function assertProductDocuments(
  products: Array<{ documentId: string; product: Product }>,
) {
  const mismatches = products.flatMap(({ documentId, product }) =>
    product.id === documentId
      ? []
      : [{ documentId, embeddedId: product.id ?? null }],
  );
  if (mismatches.length)
    throw new Error(
      `Private product document IDs do not match embedded IDs: ${JSON.stringify(mismatches)}`,
    );
  if (
    new Set(products.map(({ documentId }) => documentId)).size !==
    products.length
  )
    throw new Error("Private product source contains duplicate document IDs");
}

function assertGroupDocuments(
  groups: Array<{ documentId: string; group: OptionGroup }>,
) {
  const mismatches = groups.flatMap(({ documentId, group }) =>
    group.id === documentId
      ? []
      : [{ documentId, embeddedId: group.id ?? null }],
  );
  if (mismatches.length)
    throw new Error(
      `Private option-group document IDs do not match embedded IDs: ${JSON.stringify(mismatches)}`,
    );
  if (
    new Set(groups.map(({ documentId }) => documentId)).size !== groups.length
  )
    throw new Error(
      "Private option-group source contains duplicate document IDs",
    );
  if (groups.length > maxOptionGroupsPerCatalogue)
    throw new Error(
      "Private option-group source exceeds the bounded read limit",
    );
}

interface ExistingProjectionState {
  privateGroups: Record<string, unknown>;
  publicMenu: Record<string, unknown>;
  publicGroups: Record<string, unknown>;
  publicAvailability?: unknown;
  publicRequestPolicy?: unknown;
  control?: unknown;
}

function buildResult(
  mode: "dry-run" | "apply",
  projectId: string,
  checkedOutSha: string,
  products: Product[],
  persistedGroups: OptionGroup[],
  availability: ToppingAvailability,
  existing: ExistingProjectionState,
  expectedFingerprint?: string,
) {
  const catalogue = mergeOptionGroupsWithFallback(persistedGroups);
  const projection = buildPublicProjection(products, availability, catalogue);
  const diff = diffPublicProjection(
    projection,
    existing.publicMenu,
    existing.publicGroups,
  );
  const privateGroupCreates = fallbackOptionGroups
    .map((group) => group.id)
    .filter((id) => !(id in existing.privateGroups))
    .sort();
  const availabilityCurrent = exactCurrentValue(existing.publicAvailability, {
    availability: projection.availability,
  });
  const requestPolicyCurrent = exactCurrentValue(
    existing.publicRequestPolicy,
    projection.requestPolicy,
  );
  const controlCurrent = exactCurrentValue(
    existing.control,
    projection.control,
  );
  const writeCount =
    privateGroupCreates.length +
    diff.create.length +
    diff.update.length +
    diff.stale.length +
    diff.groupsCreate.length +
    diff.groupsUpdate.length +
    diff.groupsStale.length +
    (availabilityCurrent ? 0 : 1) +
    (requestPolicyCurrent ? 0 : 1) +
    (controlCurrent ? 0 : 1);
  return {
    projection,
    diff,
    privateGroupCreates,
    availabilityCurrent,
    requestPolicyCurrent,
    controlCurrent,
    report: {
      mode,
      projectId,
      checkedOutSha,
      schemaVersion: projection.control.schemaVersion,
      fingerprint: projection.fingerprint,
      expectedFingerprint: expectedFingerprint ?? null,
      fingerprintMatchesExpected:
        expectedFingerprint === undefined ||
        expectedFingerprint === projection.fingerprint,
      source: {
        products: products.length,
        persistedOptionGroups: persistedGroups.length,
        effectiveOptionGroups: catalogue.length,
        availability: Object.keys(availability).length
          ? "present"
          : "missing-default",
        validation: {
          result: "passed",
          documentIdsMatchEmbeddedIds: true,
          uniqueProductIds: true,
          uniqueOptionGroupAndChoiceIds: true,
        },
      },
      publicTarget: {
        validation: "passed",
        existingMenuDocuments: Object.keys(existing.publicMenu).length,
        missingDocuments: diff.create,
        currentDocuments: diff.current,
        staleDocuments: diff.stale,
        documentsNeedingWhitelistReplacement: diff.update,
        missingOptionGroups: diff.groupsCreate,
        currentOptionGroups: diff.groupsCurrent,
        staleOptionGroups: diff.groupsStale,
        optionGroupsNeedingReplacement: diff.groupsUpdate,
        availability: availabilityCurrent ? "current" : "update",
        requestPolicy: requestPolicyCurrent ? "current" : "update",
        control: controlCurrent ? "current" : "update",
      },
      plan: {
        privateOptionGroupCreates: privateGroupCreates,
        menuCreates: diff.create,
        menuUpdates: diff.update,
        menuRemovals: diff.stale,
        publicOptionGroupCreates: diff.groupsCreate,
        publicOptionGroupUpdates: diff.groupsUpdate,
        publicOptionGroupRemovals: diff.groupsStale,
        availabilityUpdate: !availabilityCurrent,
        requestPolicyUpdate: !requestPolicyCurrent,
        controlUpdate: !controlCurrent,
        approvedWriteNamespaces,
        forbiddenNamespaces,
        forbiddenNamespaceIncluded: false,
      },
      writeCount,
      atomicity: "single-firestore-batch",
    },
  };
}

async function offlineDryRun(
  checkedOutSha: string,
  expectedFingerprint?: string,
) {
  const baseline = argument("baseline") ?? "empty";
  if (baseline !== "empty" && baseline !== "current")
    throw new Error("Offline baseline must be empty or current");
  const projection = buildPublicProjection(
    defaultProducts,
    {},
    fallbackOptionGroups,
  );
  const current = baseline === "current";
  const existing: ExistingProjectionState = current
    ? {
        privateGroups: Object.fromEntries(
          fallbackOptionGroups.map((group) => [group.id, group]),
        ),
        publicMenu: projection.menu,
        publicGroups: projection.optionGroups,
        publicAvailability: { availability: projection.availability },
        publicRequestPolicy: projection.requestPolicy,
        control: projection.control,
      }
    : {
        privateGroups: {},
        publicMenu: {},
        publicGroups: {},
      };
  const result = buildResult(
    "dry-run",
    offlineProject,
    checkedOutSha,
    defaultProducts,
    current ? fallbackOptionGroups : [],
    {},
    existing,
    expectedFingerprint,
  );
  if (
    expectedFingerprint &&
    expectedFingerprint !== result.projection.fingerprint
  )
    throw new Error(
      "Expected fingerprint does not match the reviewed projection",
    );
  console.log(
    JSON.stringify({
      ...result.report,
      offline: true,
      baseline,
      status: "dry-run-complete",
      writesPerformed: 0,
    }),
  );
}

async function remoteRun(
  projectId: string,
  mode: "dry-run" | "apply",
  checkedOutSha: string,
  expectedFingerprint?: string,
) {
  if (projectId !== productionProject && projectId !== uatProject)
    throw new Error(
      "Projection target must be the exact UAT or Production project",
    );
  if (mode === "apply") {
    if (projectId === productionProject)
      throw new Error("Catalogue projection apply is forbidden for Production");
    if (!expectedFingerprint)
      throw new Error("Apply requires --expected-fingerprint");
    if (argument("confirm") !== applyConfirmation)
      throw new Error("Apply requires --confirm APPLY_PUBLIC_PROJECTION");
  }
  if (!getApps().length)
    initializeApp({ credential: applicationDefault(), projectId });
  const firestore = getFirestore();
  const [
    productsSnapshot,
    optionGroupsSnapshot,
    availabilitySnapshot,
    publicMenuSnapshot,
    publicOptionGroupsSnapshot,
    publicAvailabilitySnapshot,
    publicRequestPolicySnapshot,
    controlSnapshot,
  ] = await Promise.all([
    firestore.collection("products").get(),
    firestore
      .collection("optionGroups")
      .limit(maxOptionGroupsPerCatalogue)
      .get(),
    firestore.doc("settings/toppingAvailability").get(),
    firestore.collection("publicMenu").get(),
    firestore
      .collection("publicOptionGroups")
      .limit(maxOptionGroupsPerCatalogue)
      .get(),
    firestore.doc("publicSettings/toppingAvailability").get(),
    firestore.doc("publicSettings/customerRequestPolicy").get(),
    firestore.doc("publicProjectionControl/current").get(),
  ]);
  const productDocuments = productsSnapshot.docs.map((snapshot) => ({
    documentId: snapshot.id,
    product: snapshot.data() as Product,
  }));
  const groupDocuments = optionGroupsSnapshot.docs.map((snapshot) => ({
    documentId: snapshot.id,
    group: snapshot.data() as OptionGroup,
  }));
  assertProductDocuments(productDocuments);
  assertGroupDocuments(groupDocuments);
  const persistedGroups = groupDocuments.map(({ group }) =>
    normalizeOptionGroup(group),
  );
  const existing: ExistingProjectionState = {
    privateGroups: Object.fromEntries(
      groupDocuments.map(({ documentId, group }) => [documentId, group]),
    ),
    publicMenu: Object.fromEntries(
      publicMenuSnapshot.docs.map((snapshot) => [snapshot.id, snapshot.data()]),
    ),
    publicGroups: Object.fromEntries(
      publicOptionGroupsSnapshot.docs.map((snapshot) => [
        snapshot.id,
        snapshot.data(),
      ]),
    ),
    publicAvailability: publicAvailabilitySnapshot.exists
      ? publicAvailabilitySnapshot.data()
      : undefined,
    publicRequestPolicy: publicRequestPolicySnapshot.exists
      ? publicRequestPolicySnapshot.data()
      : undefined,
    control: controlSnapshot.exists ? controlSnapshot.data() : undefined,
  };
  const result = buildResult(
    mode,
    projectId,
    checkedOutSha,
    productDocuments.map(({ product }) => product),
    persistedGroups,
    (availabilitySnapshot.data()?.availability as
      | ToppingAvailability
      | undefined) ?? {},
    existing,
    expectedFingerprint,
  );
  if (
    expectedFingerprint &&
    expectedFingerprint !== result.projection.fingerprint
  )
    throw new Error(
      "Expected fingerprint does not match the reviewed projection",
    );
  if (mode === "dry-run") {
    console.log(
      JSON.stringify({
        ...result.report,
        status: "dry-run-complete",
        writesPerformed: 0,
      }),
    );
    return;
  }
  const allowStaleDelete = argument("allow-stale-delete") === "true";
  if (
    (result.diff.stale.length || result.diff.groupsStale.length) &&
    !allowStaleDelete
  )
    throw new Error(
      "Apply requires --allow-stale-delete true for reviewed stale IDs",
    );
  if (result.report.writeCount > 500)
    throw new Error("Projection exceeds the Firestore atomic batch limit");
  const batch = firestore.batch();
  result.privateGroupCreates.forEach((id) => {
    const group = fallbackOptionGroups.find((entry) => entry.id === id);
    if (!group) throw new Error(`Missing committed fallback group ${id}`);
    batch.create(firestore.doc(`optionGroups/${id}`), group);
  });
  [...result.diff.create, ...result.diff.update].forEach((id) =>
    batch.set(firestore.doc(`publicMenu/${id}`), result.projection.menu[id]),
  );
  [...result.diff.groupsCreate, ...result.diff.groupsUpdate].forEach((id) =>
    batch.set(
      firestore.doc(`publicOptionGroups/${id}`),
      result.projection.optionGroups[id],
    ),
  );
  if (!result.availabilityCurrent)
    batch.set(firestore.doc("publicSettings/toppingAvailability"), {
      availability: result.projection.availability,
    });
  if (!result.requestPolicyCurrent)
    batch.set(
      firestore.doc("publicSettings/customerRequestPolicy"),
      result.projection.requestPolicy,
    );
  if (!result.controlCurrent)
    batch.set(
      firestore.doc("publicProjectionControl/current"),
      result.projection.control,
    );
  result.diff.stale.forEach((id) =>
    batch.delete(firestore.doc(`publicMenu/${id}`)),
  );
  result.diff.groupsStale.forEach((id) =>
    batch.delete(firestore.doc(`publicOptionGroups/${id}`)),
  );
  if (result.report.writeCount) await batch.commit();
  console.log(
    JSON.stringify({
      ...result.report,
      status: "applied",
      applied: true,
      appliedFingerprint: result.projection.fingerprint,
      createdCount:
        result.privateGroupCreates.length +
        result.diff.create.length +
        result.diff.groupsCreate.length,
      updatedCount: result.diff.update.length + result.diff.groupsUpdate.length,
      removedCount: result.diff.stale.length + result.diff.groupsStale.length,
      projectionControlUpdated: !result.controlCurrent,
      writesPerformed: result.report.writeCount,
      atomicCommit: result.report.writeCount ? "committed" : "not-required",
    }),
  );
}

async function main() {
  const offline = hasFlag("offline");
  const mode = (argument("mode") ?? "dry-run") as "dry-run" | "apply";
  if (mode !== "dry-run" && mode !== "apply")
    throw new Error("Projection mode must be dry-run or apply");
  if (offline && mode !== "dry-run")
    throw new Error("Offline projection supports dry-run only");
  const expectedFingerprint = argument("expected-fingerprint") || undefined;
  const checkedOutSha = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  if (offline) {
    await offlineDryRun(checkedOutSha, expectedFingerprint);
    return;
  }
  await remoteRun(
    required("project"),
    mode,
    checkedOutSha,
    expectedFingerprint,
  );
}

await main();
