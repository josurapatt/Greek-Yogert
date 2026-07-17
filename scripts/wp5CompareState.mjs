import { readFileSync } from "node:fs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const before = JSON.parse(readFileSync(argument("before"), "utf8"));
const after = JSON.parse(readFileSync(argument("after"), "utf8"));
if (
  before.projectId !== "greek-yogert-customer-uat-2026" ||
  after.projectId !== before.projectId
)
  throw new Error("State comparison project identity mismatch");
const signature = (index) => JSON.stringify(index);
const beforeIndexes = new Set(before.indexes.definitions.map(signature));
const afterIndexes = new Set(after.indexes.definitions.map(signature));
for (const index of beforeIndexes)
  if (!afterIndexes.has(index))
    throw new Error("The rules/index rehearsal deleted an existing index");
if (
  after.indexes.observedCompositeCount !== 6 ||
  after.indexes.readyCompositeCount !== 6
)
  throw new Error("The six required indexes are not ready");
if (
  before.designatedStaff.capable !== after.designatedStaff.capable ||
  before.designatedStaff.ordinary !== after.designatedStaff.ordinary
)
  throw new Error("Designated Staff readiness changed");
console.log(
  JSON.stringify({
    status: "passed",
    projectId: after.projectId,
    indexesPreserved: beforeIndexes.size,
    requiredIndexesReady: after.indexes.readyCompositeCount,
    designatedStaff: "unchanged",
  }),
);
