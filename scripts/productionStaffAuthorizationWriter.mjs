import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { cert, deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export const productionProjectId = "greek-yogert";
export const inventoryFingerprintSchema =
  "production-staff-authorization-inventory-v2";
export const approvalFingerprintSchema =
  "production-staff-authorization-plan-v2";
export const applyConfirmation =
  "APPLY_APPROVED_PRODUCTION_STAFF_AUTHORIZATIONS";

const emulatorEnvironmentNames = [
  "FIRESTORE_EMULATOR_HOST",
  "FIREBASE_AUTH_EMULATOR_HOST",
  "FIREBASE_DATABASE_EMULATOR_HOST",
  "FIREBASE_STORAGE_EMULATOR_HOST",
  "FUNCTIONS_EMULATOR",
];
const projectEnvironmentNames = ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"];
const rejectedIdentifierTerms = [
  "example",
  "placeholder",
  "replace",
  "todo",
  "tbd",
  "sample",
  "dummy",
  "redacted",
  "unknown",
  "test",
  "testing",
  "fixture",
  "fake",
  "mock",
  "demo",
  "local",
  "localhost",
];
const reservedEmailDomains = [
  ".invalid",
  ".test",
  ".example",
  ".localhost",
  "example.com",
  "example.org",
  "example.net",
];
const safeFailureDetailNames = [
  "existingExactDocuments",
  "missingDocuments",
  "conflictingDocuments",
  "plannedCreates",
];
const roleOrder = { ordinary: 0, capable: 1 };

function writerRepositoryRoot() {
  return resolve(fileURLToPath(import.meta.url), "..", "..");
}

class WriterError extends Error {
  constructor(stage, details = {}) {
    super(stage);
    this.stage = stage;
    this.details = details;
  }
}

function fail(stage, details) {
  throw new WriterError(stage, details);
}

function hasExactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  return value;
}

function sha256Fingerprint(schema, value) {
  const digest = createHash("sha256")
    .update(JSON.stringify(stableValue({ schema, value })))
    .digest("hex");
  return `${schema}-${digest}`;
}

function isPlaceholder(value) {
  return (
    typeof value !== "string" ||
    !value.trim() ||
    /<[^>]+>/.test(value) ||
    rejectedIdentifierTerms.some((term) => value.toLowerCase().includes(term))
  );
}

function isReservedEmailDomain(value) {
  const domain = value.trim().toLowerCase().split("@")[1];
  return (
    !domain ||
    reservedEmailDomains.some(
      (reserved) => domain === reserved.slice(1) || domain.endsWith(reserved),
    )
  );
}

function isInventoryEmail(value) {
  return (
    !isPlaceholder(value) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) &&
    !isReservedEmailDomain(value)
  );
}

function isInventoryUid(value) {
  return (
    !isPlaceholder(value) &&
    value.trim() === value &&
    value.length <= 128 &&
    !/\s/.test(value)
  );
}

function pathIsOutsideRepository(repositoryRoot, candidatePath) {
  const pathFromRepository = relative(repositoryRoot, candidatePath);
  return (
    pathFromRepository === ".." ||
    pathFromRepository.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRepository)
  );
}

function readExternalJson(filePath, repositoryRoot, locationStage, parseStage) {
  if (typeof filePath !== "string" || !isAbsolute(filePath))
    fail(locationStage);
  let resolvedFile;
  let resolvedRepository;
  try {
    resolvedFile = realpathSync(resolve(filePath));
    resolvedRepository = realpathSync(resolve(repositoryRoot));
  } catch {
    fail(locationStage);
  }
  if (!pathIsOutsideRepository(resolvedRepository, resolvedFile))
    fail(locationStage);
  try {
    return JSON.parse(readFileSync(resolvedFile, "utf8"));
  } catch {
    fail(parseStage);
  }
}

export function validateProjectId(projectId) {
  if (projectId !== productionProjectId) fail("project-validation");
  return productionProjectId;
}

export function validateInventory(inventory, projectId = productionProjectId) {
  validateProjectId(projectId);
  if (!hasExactKeys(inventory, ["projectId", "staff"]))
    fail("inventory-validation");
  if (
    inventory.projectId !== productionProjectId ||
    !Array.isArray(inventory.staff) ||
    inventory.staff.length !== 2
  )
    fail("inventory-validation");

  const roles = new Set();
  const uids = new Set();
  const emails = new Set();
  const records = inventory.staff.map((record) => {
    if (!hasExactKeys(record, ["email", "uid", "role", "authDisabled"]))
      fail("inventory-validation");
    if (!isInventoryEmail(record.email) || !isInventoryUid(record.uid))
      fail("inventory-validation");
    if (record.authDisabled !== false) fail("inventory-validation");
    if (record.role !== "ordinary" && record.role !== "capable")
      fail("inventory-validation");
    const email = record.email.trim().toLowerCase();
    if (roles.has(record.role) || uids.has(record.uid) || emails.has(email))
      fail("inventory-validation");
    roles.add(record.role);
    uids.add(record.uid);
    emails.add(email);
    return { email, uid: record.uid, role: record.role };
  });

  if (!roles.has("ordinary") || !roles.has("capable"))
    fail("inventory-validation");

  return records
    .map((record) => ({
      ...record,
      data:
        record.role === "capable"
          ? { role: "staff", active: true, canManageCustomerOrdering: true }
          : { role: "staff", active: true },
    }))
    .sort((left, right) => roleOrder[left.role] - roleOrder[right.role]);
}

function fingerprintValidatedRecords(records, projectId) {
  return sha256Fingerprint(inventoryFingerprintSchema, {
    projectId,
    staff: records.map((record) => ({
      authorization: record.data,
      email: record.email,
      role: record.role,
      uid: record.uid,
    })),
  });
}

export function createInventoryFingerprint(
  inventory,
  projectId = productionProjectId,
) {
  return fingerprintValidatedRecords(
    validateInventory(inventory, projectId),
    projectId,
  );
}

export function readExternalInventory(
  inventoryPath,
  repositoryRoot = process.cwd(),
) {
  return readExternalJson(
    inventoryPath,
    repositoryRoot,
    "inventory-location",
    "inventory-validation",
  );
}

export function validateServiceAccount(value, projectId = productionProjectId) {
  validateProjectId(projectId);
  if (
    !value ||
    value.type !== "service_account" ||
    value.project_id !== productionProjectId ||
    !isInventoryEmail(value.client_email) ||
    !value.client_email.endsWith(
      `@${productionProjectId}.iam.gserviceaccount.com`,
    ) ||
    typeof value.private_key !== "string" ||
    !value.private_key.trim()
  )
    fail("credential-validation");
  return value;
}

export function readServiceAccount(
  credentialsPath,
  projectId = productionProjectId,
  repositoryRoot = process.cwd(),
) {
  return validateServiceAccount(
    readExternalJson(
      credentialsPath,
      repositoryRoot,
      "credential-validation",
      "credential-validation",
    ),
    projectId,
  );
}

export function validateExpectedPrincipal(
  value,
  projectId = productionProjectId,
) {
  validateProjectId(projectId);
  if (
    !hasExactKeys(value, ["projectId", "serviceAccountEmail"]) ||
    value.projectId !== productionProjectId ||
    !isInventoryEmail(value.serviceAccountEmail) ||
    !value.serviceAccountEmail.endsWith(
      `@${productionProjectId}.iam.gserviceaccount.com`,
    )
  )
    fail("principal-validation");
  return value.serviceAccountEmail.trim().toLowerCase();
}

export function readExpectedPrincipal(
  principalPath,
  projectId = productionProjectId,
  repositoryRoot = process.cwd(),
) {
  return validateExpectedPrincipal(
    readExternalJson(
      principalPath,
      repositoryRoot,
      "principal-validation",
      "principal-validation",
    ),
    projectId,
  );
}

export function validateOnlineEnvironment(environment = process.env) {
  if (
    emulatorEnvironmentNames.some((name) =>
      Object.prototype.hasOwnProperty.call(environment, name),
    )
  )
    fail("environment-validation");
  if (
    projectEnvironmentNames.some(
      (name) =>
        Object.prototype.hasOwnProperty.call(environment, name) &&
        environment[name] !== productionProjectId,
    )
  )
    fail("environment-validation");
  if (Object.prototype.hasOwnProperty.call(environment, "FIREBASE_CONFIG")) {
    let firebaseConfig;
    try {
      firebaseConfig = JSON.parse(environment.FIREBASE_CONFIG);
    } catch {
      fail("environment-validation");
    }
    if (
      !firebaseConfig ||
      typeof firebaseConfig !== "object" ||
      Array.isArray(firebaseConfig) ||
      firebaseConfig.projectId !== productionProjectId ||
      (firebaseConfig.project_id !== undefined &&
        firebaseConfig.project_id !== productionProjectId)
    )
      fail("environment-validation");
  }
  return productionProjectId;
}

function exactAuthorizationData(value, expected) {
  return (
    hasExactKeys(value, Object.keys(expected)) &&
    Object.entries(expected).every(([key, entry]) => value[key] === entry)
  );
}

async function verifyAuthentication(auth, records) {
  let users;
  try {
    users = await Promise.all(
      records.map((record) => auth.getUser(record.uid)),
    );
  } catch {
    fail("authentication-verification");
  }
  if (
    users.some(
      (user, index) =>
        !user ||
        user.disabled !== false ||
        typeof user.email !== "string" ||
        user.email.trim().toLowerCase() !== records[index].email,
    )
  )
    fail("authentication-verification");
}

async function readAuthorizationTargets(firestore, records, stage) {
  const references = records.map((record) =>
    firestore.doc(`users/${record.uid}`),
  );
  let snapshots;
  try {
    snapshots = await Promise.all(
      references.map((reference) => reference.get()),
    );
  } catch {
    fail(stage);
  }
  try {
    return records.map((record, index) => {
      const snapshot = snapshots[index];
      const state = !snapshot.exists
        ? "missing"
        : exactAuthorizationData(snapshot.data(), record.data)
          ? "exact"
          : "conflicting";
      return { record, reference: references[index], state };
    });
  } catch {
    fail(stage);
  }
}

function createPlan(records, targets, projectId) {
  const inventoryFingerprint = fingerprintValidatedRecords(records, projectId);
  const existingExactDocuments = targets.filter(
    (target) => target.state === "exact",
  ).length;
  const missingDocuments = targets.filter(
    (target) => target.state === "missing",
  ).length;
  const conflictingDocuments = targets.filter(
    (target) => target.state === "conflicting",
  ).length;
  const plannedCreateFields = targets
    .filter((target) => target.state === "missing")
    .map((target) => ({
      role: target.record.role,
      fields: Object.keys(target.record.data).sort(),
    }));
  const approvalFingerprint = sha256Fingerprint(approvalFingerprintSchema, {
    inventoryFingerprint,
    projectId,
    targets: targets.map((target) => ({
      fields:
        target.state === "missing"
          ? Object.keys(target.record.data).sort()
          : [],
      role: target.record.role,
      state: target.state,
    })),
  });
  return {
    targets,
    result: {
      status: "planned",
      projectValidation: "passed",
      inventoryValidation: "passed",
      authenticationVerification: "passed",
      authorizationDocumentCheck:
        conflictingDocuments === 0 ? "passed" : "blocked",
      approvedStaff: records.length,
      ordinaryStaff: records.filter((record) => record.role === "ordinary")
        .length,
      capableStaff: records.filter((record) => record.role === "capable")
        .length,
      existingExactDocuments,
      missingDocuments,
      conflictingDocuments,
      plannedCreates: missingDocuments,
      plannedCreateFields,
      inventoryFingerprint,
      approvalFingerprint,
      identifiersLogged: false,
    },
  };
}

async function buildOnlinePlan({ projectId, records, auth, firestore }) {
  await verifyAuthentication(auth, records);
  const targets = await readAuthorizationTargets(
    firestore,
    records,
    "authorization-document-read",
  );
  const plan = createPlan(records, targets, projectId);
  if (plan.result.conflictingDocuments !== 0)
    fail("authorization-document-conflict", {
      existingExactDocuments: plan.result.existingExactDocuments,
      missingDocuments: plan.result.missingDocuments,
      conflictingDocuments: plan.result.conflictingDocuments,
      plannedCreates: 0,
    });
  return plan;
}

function validateApprovalFingerprint(value) {
  if (
    typeof value !== "string" ||
    !new RegExp(`^${approvalFingerprintSchema}-[a-f0-9]{64}$`).test(value)
  )
    fail("fingerprint-validation");
  return value;
}

async function verifyPostApply(firestore, records, projectId) {
  const targets = await readAuthorizationTargets(
    firestore,
    records,
    "post-write-verification",
  );
  if (targets.some((target) => target.state !== "exact"))
    fail("post-write-verification");
  const plan = createPlan(records, targets, projectId);
  if (plan.result.plannedCreates !== 0) fail("post-write-verification");
  return plan.result;
}

async function applyApprovedPlan({
  projectId,
  records,
  approvedFingerprint,
  auth,
  firestore,
}) {
  const plan = await buildOnlinePlan({ projectId, records, auth, firestore });
  if (plan.result.approvalFingerprint !== approvedFingerprint)
    fail("fingerprint-mismatch");

  const missingTargets = plan.targets.filter(
    (target) => target.state === "missing",
  );
  if (missingTargets.length > 0) {
    let batch;
    try {
      batch = firestore.batch();
      missingTargets.forEach((target) =>
        batch.create(target.reference, target.record.data),
      );
      await batch.commit();
    } catch {
      fail("authorization-write");
    }
  }

  const postApplyPlan = await verifyPostApply(firestore, records, projectId);
  return {
    status: missingTargets.length === 0 ? "already-current" : "applied",
    projectValidation: "passed",
    inventoryValidation: "passed",
    authenticationVerification: "passed",
    authorizationDocumentCheck: "passed",
    approvedStaff: records.length,
    ordinaryStaff: records.filter((record) => record.role === "ordinary")
      .length,
    capableStaff: records.filter((record) => record.role === "capable").length,
    inventoryFingerprint: plan.result.inventoryFingerprint,
    approvedFingerprint,
    plannedCreates: plan.result.plannedCreates,
    authorizationDocumentsCreated: missingTargets.length,
    postWriteVerification: "passed",
    postApplyPlannedCreates: postApplyPlan.plannedCreates,
    postApplyApprovalFingerprint: postApplyPlan.approvalFingerprint,
    idempotencyVerification: "passed",
    identifiersLogged: false,
  };
}

export async function runAuthorizationWriter({
  projectId,
  inventory,
  mode = "validate",
  confirmation,
  approvedFingerprint,
  auth,
  firestore,
}) {
  validateProjectId(projectId);
  const records = validateInventory(inventory, projectId);
  const inventoryFingerprint = fingerprintValidatedRecords(records, projectId);
  if (mode === "validate")
    return {
      status: "validation-only",
      projectValidation: "passed",
      inventoryValidation: "passed",
      approvedStaff: records.length,
      ordinaryStaff: records.filter((record) => record.role === "ordinary")
        .length,
      capableStaff: records.filter((record) => record.role === "capable")
        .length,
      inventoryFingerprint,
      authorizationDocumentsCreated: 0,
      identifiersLogged: false,
    };
  if (mode !== "plan" && mode !== "apply") fail("mode-validation");
  if (mode === "apply") {
    if (confirmation !== applyConfirmation) fail("write-confirmation");
    validateApprovalFingerprint(approvedFingerprint);
  }
  if (!auth || typeof auth.getUser !== "function" || !firestore)
    fail("client-validation");
  if (mode === "plan")
    return (await buildOnlinePlan({ projectId, records, auth, firestore }))
      .result;
  return applyApprovedPlan({
    projectId,
    records,
    approvedFingerprint,
    auth,
    firestore,
  });
}

export async function executeControlledAuthorizationWriter({
  projectId,
  inventory,
  mode,
  confirmation,
  approvedFingerprint,
  environment = process.env,
  loadServiceAccount,
  loadExpectedPrincipal,
  initializeClients,
}) {
  validateProjectId(projectId);
  validateInventory(inventory, projectId);
  if (mode !== "plan" && mode !== "apply") fail("mode-validation");
  if (mode === "apply") {
    if (confirmation !== applyConfirmation) fail("write-confirmation");
    validateApprovalFingerprint(approvedFingerprint);
  }
  validateOnlineEnvironment(environment);
  if (
    typeof loadServiceAccount !== "function" ||
    typeof loadExpectedPrincipal !== "function" ||
    typeof initializeClients !== "function"
  )
    fail("client-validation");
  const serviceAccount = validateServiceAccount(
    loadServiceAccount(),
    projectId,
  );
  const expectedPrincipal = loadExpectedPrincipal();
  if (
    typeof expectedPrincipal !== "string" ||
    serviceAccount.client_email.trim().toLowerCase() !== expectedPrincipal
  )
    fail("principal-validation");
  const clients = await initializeClients(serviceAccount);
  return runAuthorizationWriter({
    projectId,
    inventory,
    mode,
    confirmation,
    approvedFingerprint,
    auth: clients?.auth,
    firestore: clients?.firestore,
  });
}

function sanitizedFailure(error) {
  const result = {
    status: "failed",
    stage: error instanceof WriterError ? error.stage : "unexpected",
  };
  if (error instanceof WriterError)
    safeFailureDetailNames.forEach((name) => {
      if (Number.isInteger(error.details?.[name]))
        result[name] = error.details[name];
    });
  result.identifiersLogged = false;
  return result;
}

export async function runSanitizedWriter(input, logger = console.log) {
  try {
    const result = await runAuthorizationWriter(input);
    logger(JSON.stringify(result));
    return result;
  } catch (error) {
    logger(JSON.stringify(sanitizedFailure(error)));
    throw error;
  }
}

export function parseCommandArguments(argumentsList = process.argv.slice(2)) {
  const values = {};
  let mode = "validate";
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--plan" || argument === "--apply") {
      if (mode !== "validate") fail("command-validation");
      mode = argument.slice(2);
      continue;
    }
    if (
      ![
        "--project",
        "--inventory",
        "--expected-principal",
        "--confirm",
        "--approved-fingerprint",
      ].includes(argument)
    )
      fail("command-validation");
    const value = argumentsList[index + 1];
    if (!value || value.startsWith("--") || values[argument] !== undefined)
      fail("command-validation");
    values[argument] = value;
    index += 1;
  }
  const projectId = values["--project"];
  const inventoryPath = values["--inventory"];
  const expectedPrincipalPath = values["--expected-principal"];
  const confirmation = values["--confirm"];
  const approvedFingerprint = values["--approved-fingerprint"];
  if (!projectId || !inventoryPath) fail("command-validation");
  if (mode === "validate") {
    if (expectedPrincipalPath || confirmation || approvedFingerprint)
      fail("command-validation");
  } else if (!expectedPrincipalPath) fail("command-validation");
  if (mode === "plan" && (confirmation || approvedFingerprint))
    fail("command-validation");
  if (mode === "apply" && (!confirmation || !approvedFingerprint))
    fail("command-validation");
  return {
    projectId,
    inventoryPath,
    expectedPrincipalPath,
    mode,
    confirmation,
    approvedFingerprint,
  };
}

async function main() {
  let app;
  try {
    const command = parseCommandArguments();
    const repositoryRoot = writerRepositoryRoot();
    const inventory = readExternalInventory(
      command.inventoryPath,
      repositoryRoot,
    );
    const result =
      command.mode === "validate"
        ? await runAuthorizationWriter({
            projectId: command.projectId,
            inventory,
          })
        : await executeControlledAuthorizationWriter({
            projectId: command.projectId,
            inventory,
            mode: command.mode,
            confirmation: command.confirmation,
            approvedFingerprint: command.approvedFingerprint,
            environment: process.env,
            loadServiceAccount: () =>
              readServiceAccount(
                process.env.GOOGLE_APPLICATION_CREDENTIALS,
                command.projectId,
                repositoryRoot,
              ),
            loadExpectedPrincipal: () =>
              readExpectedPrincipal(
                command.expectedPrincipalPath,
                command.projectId,
                repositoryRoot,
              ),
            initializeClients: (serviceAccount) => {
              app = initializeApp(
                {
                  credential: cert(serviceAccount),
                  projectId: command.projectId,
                },
                `production-staff-authorization-${Date.now()}`,
              );
              return { auth: getAuth(app), firestore: getFirestore(app) };
            },
          });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify(sanitizedFailure(error))}\n`);
    process.exitCode = 1;
  } finally {
    if (app) await deleteApp(app).catch(() => undefined);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
