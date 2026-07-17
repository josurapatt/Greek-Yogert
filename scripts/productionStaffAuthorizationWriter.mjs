import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { cert, deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export const productionProjectId = "greek-yogert";
export const writeConfirmation = "CREATE_EXACTLY_TWO_STAFF_AUTHORIZATIONS";

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

function writerRepositoryRoot() {
  return resolve(fileURLToPath(import.meta.url), "..", "..");
}

class WriterError extends Error {
  constructor(stage) {
    super(stage);
    this.stage = stage;
  }
}

function fail(stage) {
  throw new WriterError(stage);
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
    !Array.isArray(inventory.staff)
  )
    fail("inventory-validation");
  if (inventory.staff.length !== 2) fail("inventory-validation");

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

  return records.map((record) => ({
    ...record,
    data:
      record.role === "capable"
        ? { role: "staff", active: true, canManageCustomerOrdering: true }
        : { role: "staff", active: true },
  }));
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

export function validateExecuteEnvironment(environment = process.env) {
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

async function verifyTargetsDoNotExist(firestore, records) {
  const references = records.map((record) =>
    firestore.doc(`users/${record.uid}`),
  );
  let snapshots;
  try {
    snapshots = await Promise.all(
      references.map((reference) => reference.get()),
    );
  } catch {
    fail("existing-document-check");
  }
  if (snapshots.some((snapshot) => snapshot.exists))
    fail("existing-document-check");
  return references;
}

async function createAndVerifyAuthorizationDocuments(firestore, records) {
  const references = await verifyTargetsDoNotExist(firestore, records);
  let batch;
  try {
    batch = firestore.batch();
    records.forEach((record, index) =>
      batch.create(references[index], record.data),
    );
    await batch.commit();
  } catch {
    fail("authorization-write");
  }
  let snapshots;
  try {
    snapshots = await Promise.all(
      references.map((reference) => reference.get()),
    );
  } catch {
    fail("post-write-verification");
  }
  if (
    snapshots.some(
      (snapshot, index) =>
        !snapshot.exists ||
        !exactAuthorizationData(snapshot.data(), records[index].data),
    )
  )
    fail("post-write-verification");
}

export async function runAuthorizationWriter({
  projectId,
  inventory,
  execute = false,
  confirmation,
  auth,
  firestore,
}) {
  validateProjectId(projectId);
  const records = validateInventory(inventory, projectId);
  if (!execute)
    return {
      status: "validation-only",
      projectValidation: "passed",
      inventoryValidation: "passed",
      authorizationDocumentsCreated: 0,
      identifiersLogged: false,
    };
  if (confirmation !== writeConfirmation) fail("write-confirmation");
  if (!auth || typeof auth.getUser !== "function" || !firestore)
    fail("client-validation");

  await verifyAuthentication(auth, records);
  await createAndVerifyAuthorizationDocuments(firestore, records);
  return {
    status: "created",
    projectValidation: "passed",
    inventoryValidation: "passed",
    existingDocumentCheck: "passed",
    authorizationDocumentsCreated: 2,
    identifiersLogged: false,
  };
}

export async function executeControlledAuthorizationWriter({
  projectId,
  inventory,
  confirmation,
  environment = process.env,
  loadServiceAccount,
  loadExpectedPrincipal,
  initializeClients,
}) {
  validateProjectId(projectId);
  validateInventory(inventory, projectId);
  if (confirmation !== writeConfirmation) fail("write-confirmation");
  validateExecuteEnvironment(environment);
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
    execute: true,
    confirmation,
    auth: clients?.auth,
    firestore: clients?.firestore,
  });
}

export async function runSanitizedWriter(input, logger = console.log) {
  try {
    const result = await runAuthorizationWriter(input);
    logger(JSON.stringify(result));
    return result;
  } catch (error) {
    const stage = error instanceof WriterError ? error.stage : "unexpected";
    logger(
      JSON.stringify({ status: "failed", stage, identifiersLogged: false }),
    );
    throw error;
  }
}

export function parseCommandArguments(argumentsList = process.argv.slice(2)) {
  const values = {};
  let execute = false;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--execute") {
      if (execute) fail("command-validation");
      execute = true;
      continue;
    }
    if (
      ![
        "--project",
        "--inventory",
        "--expected-principal",
        "--confirm",
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
  if (!projectId || !inventoryPath) fail("command-validation");
  if (execute && !values["--expected-principal"]) fail("command-validation");
  return {
    projectId,
    inventoryPath,
    expectedPrincipalPath: values["--expected-principal"],
    execute,
    confirmation: values["--confirm"],
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
    const result = command.execute
      ? await executeControlledAuthorizationWriter({
          projectId: command.projectId,
          inventory,
          confirmation: command.confirmation,
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
        })
      : await runAuthorizationWriter({
          projectId: command.projectId,
          inventory,
        });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const stage = error instanceof WriterError ? error.stage : "unexpected";
    process.stderr.write(
      `${JSON.stringify({ status: "failed", stage, identifiersLogged: false })}\n`,
    );
    process.exitCode = 1;
  } finally {
    if (app) await deleteApp(app).catch(() => undefined);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
