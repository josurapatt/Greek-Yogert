import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cert, deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export const productionProjectId = "greek-yogert";
export const writeConfirmation = "CREATE_EXACTLY_TWO_STAFF_AUTHORIZATIONS";

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
    /<[^>]+>|\b(example|placeholder|replace|todo|tbd|sample|dummy|redacted|unknown)\b/i.test(
      value,
    )
  );
}

function isInventoryEmail(value) {
  return (
    !isPlaceholder(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
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
    return {
      email,
      uid: record.uid,
      role: record.role,
    };
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
  if (!isAbsolute(inventoryPath)) fail("inventory-location");
  let resolvedInventory;
  let resolvedRepository;
  try {
    resolvedInventory = realpathSync(resolve(inventoryPath));
    resolvedRepository = realpathSync(resolve(repositoryRoot));
  } catch {
    fail("inventory-location");
  }
  const pathFromRepository = relative(resolvedRepository, resolvedInventory);
  if (
    !pathFromRepository ||
    (!pathFromRepository.startsWith("..") && !isAbsolute(pathFromRepository))
  )
    fail("inventory-location");
  try {
    return JSON.parse(readFileSync(resolvedInventory, "utf8"));
  } catch {
    fail("inventory-validation");
  }
}

export function validateServiceAccount(value, projectId = productionProjectId) {
  validateProjectId(projectId);
  if (
    !value ||
    value.type !== "service_account" ||
    value.project_id !== productionProjectId ||
    typeof value.client_email !== "string" ||
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
) {
  if (!credentialsPath || !isAbsolute(credentialsPath))
    fail("credential-validation");
  try {
    return validateServiceAccount(
      JSON.parse(readFileSync(credentialsPath, "utf8")),
      projectId,
    );
  } catch (error) {
    if (error instanceof WriterError) throw error;
    fail("credential-validation");
  }
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
    if (!["--project", "--inventory", "--confirm"].includes(argument))
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
  return {
    projectId,
    inventoryPath,
    execute,
    confirmation: values["--confirm"],
  };
}

async function main() {
  let app;
  try {
    const command = parseCommandArguments();
    const inventory = readExternalInventory(
      command.inventoryPath,
      writerRepositoryRoot(),
    );
    if (!command.execute) {
      await runSanitizedWriter({
        projectId: command.projectId,
        inventory,
      });
      return;
    }
    if (command.confirmation !== writeConfirmation) fail("write-confirmation");
    const serviceAccount = readServiceAccount(
      process.env.GOOGLE_APPLICATION_CREDENTIALS,
      command.projectId,
    );
    app = initializeApp(
      { credential: cert(serviceAccount), projectId: command.projectId },
      `production-staff-authorization-${Date.now()}`,
    );
    await runSanitizedWriter({
      projectId: command.projectId,
      inventory,
      execute: true,
      confirmation: command.confirmation,
      auth: getAuth(app),
      firestore: getFirestore(app),
    });
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
