import {
  cert,
  deleteApp,
  initializeApp,
  type ServiceAccount,
} from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import {
  maxOptionGroupsPerCatalogue,
  mergeOptionGroupsWithFallback,
  productOptionGroupAssignments,
} from "../src/optionCatalogue";
import {
  assertOptionChoiceCount,
  normalizeLegacyPrivateOptionGroupDocument,
  normalizePrivateOptionChoiceDocument,
  normalizePrivateOptionGroupDocument,
  optionChoiceReadLimit,
} from "../src/optionCataloguePersistence";
import type { OptionGroup, Product } from "../src/types";

const productionProject = "greek-yogert";
const maximumChoices = optionChoiceReadLimit - 1;
const identifierPattern = /^[^/]{1,120}$/;

export type RecoveryInput = {
  projectId: string;
  groupId: string;
  choiceId: string;
  apply?: boolean;
};

export type RecoveryReport = {
  status: "dry-run" | "applied";
  projectId: string;
  groupId: string;
  choiceId: string;
  targetPath: string;
  choicesBefore: number;
  choicesAfter: number;
  writesPerformed: 0 | 1;
  authoritativeRead: "not-required" | "passed";
};

export class CatalogueRecoveryError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly writesPerformed: 0 | 1 = 0,
  ) {
    super(message);
    this.name = "CatalogueRecoveryError";
  }
}

function refuse(
  code: string,
  message: string,
  writesPerformed: 0 | 1 = 0,
): never {
  throw new CatalogueRecoveryError(code, message, writesPerformed);
}

function requiredIdentifier(value: string, label: string): void {
  if (!identifierPattern.test(value) || value === "." || value === "..")
    refuse("invalid-identifier", `${label} must be one exact document ID`);
}

export function validateRecoveryInput(input: RecoveryInput): void {
  if (!input.projectId) refuse("missing-project", "--project is required");
  if (!input.groupId) refuse("missing-group", "--group is required");
  if (!input.choiceId) refuse("missing-choice", "--choice is required");
  if (input.projectId === productionProject)
    refuse(
      "production-denied",
      "Production catalogue recovery is not authorised",
    );
  requiredIdentifier(input.projectId, "Project");
  requiredIdentifier(input.groupId, "Group");
  requiredIdentifier(input.choiceId, "Choice");
}

function argumentValue(arguments_: string[], name: string): string | undefined {
  const flag = `--${name}`;
  const indexes = arguments_.flatMap((value, index) =>
    value === flag ? [index] : [],
  );
  if (indexes.length > 1)
    refuse("duplicate-argument", `${flag} must be supplied exactly once`);
  if (!indexes.length) return undefined;
  const value = arguments_[indexes[0] + 1];
  if (!value || value.startsWith("--"))
    refuse(`missing-${name}`, `${flag} is required`);
  return value;
}

export function parseRecoveryArguments(arguments_: string[]): RecoveryInput {
  const allowed = new Set([
    "--project",
    "--group",
    "--choice",
    "--apply",
    "--",
  ]);
  arguments_.forEach((value, index) => {
    if (value.startsWith("--") && !allowed.has(value))
      refuse("unknown-argument", `Unsupported argument ${value}`);
    if (
      !value.startsWith("--") &&
      (index === 0 ||
        !["--project", "--group", "--choice"].includes(arguments_[index - 1]))
    )
      refuse("unexpected-value", "Unexpected command-line value");
  });
  if (arguments_.filter((value) => value === "--apply").length > 1)
    refuse("duplicate-argument", "--apply must be supplied at most once");
  const input = {
    projectId: argumentValue(arguments_, "project") ?? "",
    groupId: argumentValue(arguments_, "group") ?? "",
    choiceId: argumentValue(arguments_, "choice") ?? "",
    apply: arguments_.includes("--apply"),
  };
  validateRecoveryInput(input);
  return input;
}

type CredentialFile = ServiceAccount & {
  type: "service_account";
  project_id: string;
  client_email: string;
  private_key: string;
};

export function readRecoveryCredential(
  expectedProjectId: string,
  environment: NodeJS.ProcessEnv = process.env,
  readText: (path: string) => string = (path) => readFileSync(path, "utf8"),
): CredentialFile {
  const credentialPath = environment.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialPath)
    refuse(
      "credential-unavailable",
      "GOOGLE_APPLICATION_CREDENTIALS must identify the external Admin credential",
    );
  let value: unknown;
  try {
    value = JSON.parse(readText(credentialPath));
  } catch {
    refuse(
      "credential-invalid",
      "The external Admin credential cannot be verified",
    );
  }
  const credential = value as Partial<CredentialFile>;
  if (
    credential.type !== "service_account" ||
    typeof credential.project_id !== "string" ||
    typeof credential.client_email !== "string" ||
    typeof credential.private_key !== "string" ||
    !credential.client_email.endsWith(
      `@${credential.project_id}.iam.gserviceaccount.com`,
    )
  )
    refuse(
      "credential-invalid",
      "The external Admin credential cannot be verified",
    );
  if (credential.project_id !== expectedProjectId)
    refuse(
      "project-mismatch",
      "Authenticated project does not match --project",
    );
  return credential as CredentialFile;
}

type DataDocument = { id: string; data(): unknown };

function targetIsReferenced(
  products: DataDocument[],
  groupId: string,
  choiceId: string,
): boolean {
  try {
    return products.some((snapshot) =>
      productOptionGroupAssignments(snapshot.data() as Product).some(
        (assignment) =>
          assignment.groupId === groupId &&
          (assignment.choiceIds === undefined ||
            assignment.choiceIds.includes(choiceId)),
      ),
    );
  } catch {
    refuse(
      "references-unverifiable",
      "Authoritative Product references cannot be verified",
    );
  }
}

function validateCandidate(
  choices: { size: number; docs: DataDocument[] },
  products: DataDocument[],
  input: RecoveryInput,
) {
  if (choices.size <= maximumChoices)
    refuse("not-overflowed", "Option group is not overflowed");
  if (choices.size !== maximumChoices + 1)
    refuse(
      "not-single-choice-recovery",
      "Safe one-Choice recovery requires exactly 51 Choices",
    );
  const target = choices.docs.find((entry) => entry.id === input.choiceId);
  if (!target) refuse("target-missing", "Specified Choice does not exist");
  const choice = normalizePrivateOptionChoiceDocument(target.id, target.data());
  if (choice.active)
    refuse("target-active", "Specified Choice must be inactive");
  if (choice.everUsed)
    refuse("target-used", "Specified Choice must never have been used");
  if (targetIsReferenced(products, input.groupId, input.choiceId))
    refuse("target-referenced", "Specified Choice is currently referenced");
  return target;
}

export async function readAuthoritativeCatalogue(
  firestore: Firestore,
): Promise<OptionGroup[]> {
  const groups = await firestore
    .collection("optionGroups")
    .orderBy("displayOrder")
    .limit(maxOptionGroupsPerCatalogue)
    .get();
  const reconstructed = await Promise.all(
    groups.docs.map(async (group) => {
      const legacy = normalizeLegacyPrivateOptionGroupDocument(
        group.id,
        group.data(),
      );
      if (legacy) return legacy;
      const choices = await group.ref
        .collection("choices")
        .orderBy("displayOrder")
        .limit(optionChoiceReadLimit)
        .get();
      assertOptionChoiceCount(group.id, choices.size);
      return normalizePrivateOptionGroupDocument(
        group.id,
        group.data(),
        choices.docs.map((choice) =>
          normalizePrivateOptionChoiceDocument(choice.id, choice.data()),
        ),
      );
    }),
  );
  return mergeOptionGroupsWithFallback(reconstructed);
}

export async function recoverCatalogueOverflow(
  input: RecoveryInput,
  firestore: Firestore,
  authenticatedProjectId: string,
): Promise<RecoveryReport> {
  validateRecoveryInput(input);
  if (!authenticatedProjectId)
    refuse(
      "project-unverifiable",
      "Authenticated project identity cannot be verified",
    );
  if (authenticatedProjectId !== input.projectId)
    refuse(
      "project-mismatch",
      "Authenticated project does not match --project",
    );
  const group = firestore.doc(`optionGroups/${input.groupId}`);
  const targetPath = `${group.path}/choices/${input.choiceId}`;
  const [groupSnapshot, choices, products] = await Promise.all([
    group.get(),
    group.collection("choices").get(),
    firestore.collection("products").get(),
  ]);
  if (!groupSnapshot.exists)
    refuse("group-missing", "Specified option group does not exist");
  validateCandidate(choices, products.docs, input);
  if (!input.apply)
    return {
      status: "dry-run",
      projectId: input.projectId,
      groupId: input.groupId,
      choiceId: input.choiceId,
      targetPath,
      choicesBefore: choices.size,
      choicesAfter: choices.size - 1,
      writesPerformed: 0,
      authoritativeRead: "not-required",
    };

  await firestore.runTransaction(async (transaction) => {
    const currentGroup = await transaction.get(group);
    const currentChoices = await transaction.get(group.collection("choices"));
    const currentProducts = await transaction.get(
      firestore.collection("products"),
    );
    if (!currentGroup.exists)
      refuse("group-missing", "Specified option group does not exist");
    const currentTarget = validateCandidate(
      currentChoices,
      currentProducts.docs,
      input,
    );
    if (currentTarget.ref.path !== targetPath)
      refuse(
        "target-path-mismatch",
        "Specified Choice path cannot be verified",
      );
    transaction.delete(currentTarget.ref);
  });

  const after = await group.collection("choices").get();
  if (
    after.size !== choices.size - 1 ||
    after.size > maximumChoices ||
    after.docs.some((choice) => choice.id === input.choiceId)
  )
    refuse("postcondition-failed", "Recovery postcondition failed", 1);
  const authoritative = await readAuthoritativeCatalogue(firestore);
  const recoveredGroup = authoritative.find(
    (entry) => entry.id === input.groupId,
  );
  if (!recoveredGroup || recoveredGroup.choices.length !== after.size)
    refuse(
      "authoritative-read-failed",
      "Authoritative catalogue verification failed",
      1,
    );
  return {
    status: "applied",
    projectId: input.projectId,
    groupId: input.groupId,
    choiceId: input.choiceId,
    targetPath,
    choicesBefore: choices.size,
    choicesAfter: after.size,
    writesPerformed: 1,
    authoritativeRead: "passed",
  };
}

export function recoveryFailureEvidence(cause: unknown) {
  if (cause instanceof CatalogueRecoveryError)
    return {
      status: "refused",
      code: cause.code,
      error: cause.message,
      writesPerformed: cause.writesPerformed,
    };
  return {
    status: "refused",
    code: "unexpected-failure",
    error: "Catalogue recovery failed without exposing sensitive details",
    writesPerformed: "unknown",
  };
}

export async function runCatalogueOverflowRecoveryCommand(
  arguments_: string[] = process.argv.slice(2),
  environment: NodeJS.ProcessEnv = process.env,
): Promise<RecoveryReport> {
  const input = parseRecoveryArguments(arguments_);
  const credential = readRecoveryCredential(input.projectId, environment);
  const app = initializeApp(
    {
      credential: cert(credential),
      projectId: input.projectId,
    },
    `catalogue-overflow-recovery-${Date.now()}`,
  );
  try {
    return await recoverCatalogueOverflow(
      input,
      getFirestore(app),
      credential.project_id,
    );
  } finally {
    await deleteApp(app);
  }
}
