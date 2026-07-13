import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  buildPublicProjection,
  diffPublicProjection,
  publicProjectionControlId,
  publicProjectionSchemaVersion,
  projectionFingerprint,
} from "../src/publicProjection";
import type { Product, ToppingAvailability } from "../src/types";

const productionProject = "greek-yogert";
const uatProject = "greek-yogert-customer-uat-2026";
const applyConfirmation = "APPLY_PUBLIC_PROJECTION";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function required(name: string): string {
  const value = argument(name);
  if (!value || value.startsWith("--")) throw new Error(`Missing --${name}`);
  return value;
}

const projectId = required("project");
const mode = required("mode");
const expectedFingerprint = argument("expected-fingerprint");
const allowStaleDelete = argument("allow-stale-delete") === "true";

if (projectId !== productionProject && projectId !== uatProject)
  throw new Error(
    "Projection target must be the exact UAT or Production project",
  );
if (mode !== "dry-run" && mode !== "apply")
  throw new Error("Projection mode must be dry-run or apply");
if (mode === "apply") {
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
  availabilitySnapshot,
  publicMenuSnapshot,
  publicAvailabilitySnapshot,
  controlSnapshot,
] = await Promise.all([
  firestore.collection("products").get(),
  firestore.doc("settings/toppingAvailability").get(),
  firestore.collection("publicMenu").get(),
  firestore.doc("publicSettings/toppingAvailability").get(),
  firestore.doc(`publicProjectionControl/${publicProjectionControlId}`).get(),
]);

const projection = buildPublicProjection(
  productsSnapshot.docs.map((snapshot) => snapshot.data() as Product),
  (availabilitySnapshot.data()?.availability as
    | ToppingAvailability
    | undefined) ?? {},
);
const existingMenu = Object.fromEntries(
  publicMenuSnapshot.docs.map((snapshot) => [snapshot.id, snapshot.data()]),
);
const diff = diffPublicProjection(projection, existingMenu);
const availabilityCurrent =
  publicAvailabilitySnapshot.exists &&
  projectionFingerprint(publicAvailabilitySnapshot.data()) ===
    projectionFingerprint({ availability: projection.availability });
const control = {
  schemaVersion: publicProjectionSchemaVersion,
  fingerprint: projection.fingerprint,
  menuIds: Object.keys(projection.menu).sort(),
};
const controlCurrent =
  controlSnapshot.exists &&
  projectionFingerprint(controlSnapshot.data()) ===
    projectionFingerprint(control);
const result = {
  mode,
  projectId,
  fingerprint: projection.fingerprint,
  source: {
    products: productsSnapshot.size,
    availability: availabilitySnapshot.exists ? "present" : "missing-default",
  },
  menu: diff,
  availability: availabilityCurrent ? "current" : "update",
  control: controlCurrent ? "current" : "update",
  writeCount:
    diff.create.length +
    diff.update.length +
    diff.stale.length +
    (availabilityCurrent ? 0 : 1) +
    (controlCurrent ? 0 : 1),
};

if (expectedFingerprint && expectedFingerprint !== projection.fingerprint)
  throw new Error(
    "Expected fingerprint does not match the reviewed projection",
  );
if (mode === "dry-run") {
  console.log(JSON.stringify(result));
} else {
  if (diff.stale.length && !allowStaleDelete)
    throw new Error(
      "Apply requires --allow-stale-delete true for reviewed stale IDs",
    );
  if (result.writeCount > 500)
    throw new Error("Projection exceeds the Firestore atomic batch limit");
  const batch = firestore.batch();
  [...diff.create, ...diff.update].forEach((id) =>
    batch.set(firestore.doc(`publicMenu/${id}`), projection.menu[id]),
  );
  if (!availabilityCurrent)
    batch.set(firestore.doc("publicSettings/toppingAvailability"), {
      availability: projection.availability,
    });
  if (!controlCurrent)
    batch.set(
      firestore.doc(`publicProjectionControl/${publicProjectionControlId}`),
      control,
    );
  diff.stale.forEach((id) => batch.delete(firestore.doc(`publicMenu/${id}`)));
  if (result.writeCount) await batch.commit();
  console.log(JSON.stringify({ ...result, applied: true }));
}
