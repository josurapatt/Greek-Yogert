import { readFileSync } from "node:fs";

const expectedProjectId = "greek-yogert-customer-uat-2026";
const expectedNamespaces = [
  "publicMenu/*",
  "publicSettings/toppingAvailability",
  "publicSettings/customerRequestPolicy",
  "publicProjectionControl/current",
];
const fileIndex = process.argv.indexOf("--file");
const file = fileIndex >= 0 ? process.argv[fileIndex + 1] : undefined;
if (!file) throw new Error("Missing --file");
const value = JSON.parse(readFileSync(file, "utf8"));
if (value.projectId !== expectedProjectId || value.projectId === "greek-yogert")
  throw new Error("Projection evidence targets an unsafe project");
if (value.checkedOutSha !== process.env.SOURCE_SHA)
  throw new Error(
    "Projection evidence source SHA differs from the workflow source",
  );
if (value.plan?.forbiddenNamespaceIncluded !== false)
  throw new Error("Projection plan includes a forbidden namespace");
if (
  JSON.stringify(value.plan?.approvedWriteNamespaces) !==
  JSON.stringify(expectedNamespaces)
)
  throw new Error(
    "Projection plan write scope differs from the approved scope",
  );
if (
  !Number.isInteger(value.writeCount) ||
  value.writeCount < 0 ||
  value.writeCount > 500
)
  throw new Error("Projection write count is outside the atomic bound");
if (!Array.isArray(value.publicTarget?.staleDocuments))
  throw new Error("Projection stale-ID evidence is missing");
console.log(
  JSON.stringify({
    status: "reviewed",
    projectId: value.projectId,
    fingerprint: value.fingerprint,
    plannedWrites: value.writeCount,
    staleIds: value.publicTarget.staleDocuments,
    allowedWriteScope: value.plan.approvedWriteNamespaces,
  }),
);
