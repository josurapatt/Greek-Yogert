import { buildSync } from "esbuild";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const output = resolve("node_modules/.tmp/catalogue-overflow-recovery.mjs");
mkdirSync(resolve("node_modules/.tmp"), { recursive: true });
buildSync({
  entryPoints: ["scripts/catalogueOverflowRecovery.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  outfile: output,
});

const recovery = await import(
  `${pathToFileURL(output).href}?run=${Date.now()}`
);
try {
  const report = await recovery.runCatalogueOverflowRecoveryCommand();
  console.log(JSON.stringify(report));
} catch (cause) {
  console.error(JSON.stringify(recovery.recoveryFailureEvidence(cause)));
  process.exitCode = 1;
}
