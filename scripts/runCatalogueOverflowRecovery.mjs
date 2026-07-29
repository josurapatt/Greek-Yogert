import { buildSync } from "esbuild";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const output = resolve("node_modules/.tmp/catalogue-overflow-recovery.mjs");
mkdirSync(resolve("node_modules/.tmp"), { recursive: true });
buildSync({ entryPoints: ["scripts/catalogueOverflowRecovery.ts"], bundle: true, platform: "node", format: "esm", target: "node22", packages: "external", outfile: output });
await import(`${pathToFileURL(output).href}?run=${Date.now()}`);
