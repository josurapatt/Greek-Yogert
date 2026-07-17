import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const modes = new Set([
  "normal-uat",
  "production-disabled",
  "release-rehearsal",
]);
const appCheckSdkMarkers = [
  "firebaseappcheck.googleapis.com",
  "FIREBASE_APPCHECK_DEBUG_TOKEN",
];
const forbiddenAllBuildMarkers = [
  "CUSTOMER_UAT_APP_CHECK_DEBUG_TOKEN",
  "CUSTOMER_UAT_APP_CHECK_DEBUG_MODE",
  "CUSTOMER_UAT_FIREBASE_SERVICE_ACCOUNT_JSON",
  "BEGIN PRIVATE KEY",
  '"private_key"',
];

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

export function validateAppCheckBundle({ distDirectory, mode }) {
  if (!modes.has(mode))
    throw new Error(`Unsupported App Check bundle mode: ${mode}`);
  if (!existsSync(distDirectory) || !statSync(distDirectory).isDirectory())
    throw new Error(
      "App Check bundle validation requires an existing dist directory",
    );
  const contents = filesUnder(distDirectory)
    .filter((path) => /\.(?:html|js|css|json|webmanifest)$/i.test(path))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");

  for (const marker of forbiddenAllBuildMarkers)
    if (contents.includes(marker))
      throw new Error(`Forbidden build marker found: ${marker}`);

  if (mode === "normal-uat") {
    if (!contents.includes("firebaseappcheck.googleapis.com"))
      throw new Error("Normal UAT bundle does not contain the App Check SDK");
  } else {
    for (const marker of appCheckSdkMarkers)
      if (contents.includes(marker))
        throw new Error(
          `${mode} bundle unexpectedly contains App Check SDK marker`,
        );
  }

  return { mode, filesInspected: filesUnder(distDirectory).length };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = argument("--mode");
  const distDirectory = resolve(argument("--dist") ?? "dist");
  const result = validateAppCheckBundle({ distDirectory, mode });
  process.stdout.write(
    `App Check ${result.mode} bundle validation passed (${result.filesInspected} files).\n`,
  );
}
