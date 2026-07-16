import { buildSync } from "esbuild";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const outputDirectory = resolve("node_modules/.tmp");
const outputFile = resolve(outputDirectory, "wp5-uat-state.mjs");
mkdirSync(outputDirectory, { recursive: true });
buildSync({
  entryPoints: ["scripts/wp5UatState.mjs"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  outfile: outputFile,
});
await import(`${pathToFileURL(outputFile).href}?run=${Date.now()}`);
