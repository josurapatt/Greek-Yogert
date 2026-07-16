import { readFileSync } from "node:fs";

const fileIndex = process.argv.indexOf("--file");
const file = fileIndex >= 0 ? process.argv[fileIndex + 1] : undefined;
if (!file) throw new Error("Missing --file");
const state = JSON.parse(readFileSync(file, "utf8"));
const candidate = JSON.parse(readFileSync("firestore.indexes.json", "utf8"));
if (state.projectId !== "greek-yogert-customer-uat-2026")
  throw new Error("Pre-release state has the wrong project identity");
if (state.authentication.emailPassword !== "enabled")
  throw new Error("Email/Password Authentication is not ready");
if (state.authentication.anonymous !== "enabled")
  throw new Error("Anonymous Authentication is not ready");
if (state.customerOrdering !== "enabled")
  throw new Error("The pre-release Customer ordering baseline is not enabled");
if (
  state.designatedStaff.capable !== "active-with-reenable-capability" ||
  state.designatedStaff.ordinary !== "active-without-reenable-capability"
)
  throw new Error("Designated Staff authorization is not ready");

const signature = (index) =>
  JSON.stringify({
    collectionGroup: index.collectionGroup,
    queryScope: index.queryScope,
    fields: index.fields
      .filter((field) => field.fieldPath !== "__name__")
      .map((field) => ({
        fieldPath: field.fieldPath,
        ...(field.order ? { order: field.order } : {}),
        ...(field.arrayConfig ? { arrayConfig: field.arrayConfig } : {}),
      })),
  });
const observed = new Set(state.indexes.definitions.map(signature));
const required = new Set(candidate.indexes.map(signature));
if (observed.size !== required.size || observed.size !== 6)
  throw new Error("UAT index state contains missing or unrelated definitions");
for (const index of required)
  if (!observed.has(index))
    throw new Error("A required WP4 index is missing before deployment");
if (state.indexes.readyCompositeCount !== 6)
  throw new Error("The six required UAT indexes are not ready");
if (
  state.temporaryBaseline.customerRequests !== 0 ||
  state.temporaryBaseline.orders !== 0
)
  throw new Error("Existing WP5 temporary data prevents safe isolation");
console.log(
  JSON.stringify({
    status: "passed",
    projectId: state.projectId,
    authentication: "ready",
    designatedStaff: "ready",
    indexes: "exact-six-ready-no-unrelated-definitions",
    temporaryBaseline: "clean",
  }),
);
