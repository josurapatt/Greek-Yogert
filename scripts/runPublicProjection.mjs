import { buildSync } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const outputDirectory = resolve("node_modules/.tmp");
const outputFile = resolve(outputDirectory, "project-public-data.mjs");
mkdirSync(outputDirectory, { recursive: true });
buildSync({
  entryPoints: ["scripts/projectPublicData.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  outfile: outputFile,
});
await import(`${pathToFileURL(outputFile).href}?run=${Date.now()}`);
