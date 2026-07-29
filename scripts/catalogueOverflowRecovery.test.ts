import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { deleteDoc, doc } from "firebase/firestore";
import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CatalogueRecoveryError,
  parseRecoveryArguments,
  readAuthoritativeCatalogue,
  readRecoveryCredential,
  recoverCatalogueOverflow,
  recoveryFailureEvidence,
} from "./catalogueOverflowRecovery";

const projectId = "catalogue-recovery-test";
const groupId = "recovery-group";
const targetId = "choice-50";

const groupMetadata = {
  id: groupId,
  displayName: "Recovery group",
  active: true,
  displayOrder: 7,
  required: false,
  minSelections: 0,
  maxSelections: 1,
  allowDuplicates: false,
  pricingMode: "choice-surcharge",
};

function choiceData(index: number, overrides: Record<string, unknown> = {}) {
  return {
    name: `Choice ${index}`,
    active: index !== 50,
    displayOrder: index,
    classification: "normal",
    surcharge: index,
    everUsed: index !== 50,
    ...overrides,
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

class FakeDocumentReference {
  constructor(
    readonly store: FakeFirestore,
    readonly path: string,
  ) {}

  get id() {
    return this.path.split("/").at(-1)!;
  }

  get() {
    return Promise.resolve(this.store.documentSnapshot(this.path));
  }

  collection(name: string) {
    return new FakeQuery(this.store, `${this.path}/${name}`);
  }
}

class FakeDocumentSnapshot {
  readonly id: string;
  readonly ref: FakeDocumentReference;

  constructor(
    store: FakeFirestore,
    path: string,
    private readonly value: unknown,
  ) {
    this.id = path.split("/").at(-1)!;
    this.ref = new FakeDocumentReference(store, path);
  }

  get exists() {
    return this.value !== undefined;
  }

  data() {
    return this.value === undefined ? undefined : clone(this.value);
  }
}

class FakeQuery {
  private orderField?: string;
  private maximum?: number;

  constructor(
    readonly store: FakeFirestore,
    readonly path: string,
  ) {}

  doc(id: string) {
    return new FakeDocumentReference(this.store, `${this.path}/${id}`);
  }

  orderBy(field: string) {
    this.orderField = field;
    return this;
  }

  limit(value: number) {
    this.maximum = value;
    return this;
  }

  get() {
    return Promise.resolve(
      this.store.querySnapshot(this.path, this.orderField, this.maximum),
    );
  }
}

class FakeFirestore {
  readonly documents = new Map<string, unknown>();
  readonly deletedPaths: string[] = [];
  readonly transactionReadPaths: string[] = [];
  beforeTransaction?: () => void;

  doc(path: string) {
    return new FakeDocumentReference(this, path);
  }

  collection(path: string) {
    return new FakeQuery(this, path);
  }

  documentSnapshot(path: string) {
    return new FakeDocumentSnapshot(this, path, this.documents.get(path));
  }

  querySnapshot(path: string, orderField?: string, maximum?: number) {
    const prefix = `${path}/`;
    let documents = [...this.documents.entries()]
      .filter(
        ([documentPath]) =>
          documentPath.startsWith(prefix) &&
          !documentPath.slice(prefix.length).includes("/"),
      )
      .map(
        ([documentPath, value]) =>
          new FakeDocumentSnapshot(this, documentPath, value),
      );
    if (orderField)
      documents = documents.sort(
        (left, right) =>
          Number(
            (left.data() as Record<string, unknown> | undefined)?.[orderField],
          ) -
          Number(
            (right.data() as Record<string, unknown> | undefined)?.[orderField],
          ),
      );
    if (maximum !== undefined) documents = documents.slice(0, maximum);
    return { docs: documents, size: documents.length };
  }

  async runTransaction<T>(
    update: (transaction: {
      get(
        reference: FakeDocumentReference | FakeQuery,
      ): Promise<
        FakeDocumentSnapshot | ReturnType<FakeFirestore["querySnapshot"]>
      >;
      delete(reference: FakeDocumentReference): void;
    }) => Promise<T>,
  ) {
    this.beforeTransaction?.();
    const pendingDeletes: string[] = [];
    const result = await update({
      get: async (reference) => {
        this.transactionReadPaths.push(reference.path);
        return reference instanceof FakeDocumentReference
          ? this.documentSnapshot(reference.path)
          : this.querySnapshot(reference.path);
      },
      delete: (reference) => pendingDeletes.push(reference.path),
    });
    pendingDeletes.forEach((path) => {
      this.documents.delete(path);
      this.deletedPaths.push(path);
    });
    return result;
  }
}

function recoveryStore(choiceCount = 51) {
  const store = new FakeFirestore();
  store.documents.set(`optionGroups/${groupId}`, clone(groupMetadata));
  Array.from({ length: choiceCount }, (_, index) => {
    store.documents.set(
      `optionGroups/${groupId}/choices/choice-${String(index).padStart(2, "0")}`,
      choiceData(index),
    );
  });
  return store;
}

function recoveryInput(apply = false) {
  return { projectId, groupId, choiceId: targetId, apply };
}

async function recover(store: FakeFirestore, apply = false) {
  return recoverCatalogueOverflow(
    recoveryInput(apply),
    store as unknown as Firestore,
    projectId,
  );
}

describe("catalogue overflow recovery command boundary", () => {
  it("refuses a missing --project", () => {
    expect(() =>
      parseRecoveryArguments(["--group", groupId, "--choice", targetId]),
    ).toThrow("--project is required");
  });

  it("refuses a missing --group", () => {
    expect(() =>
      parseRecoveryArguments(["--project", projectId, "--choice", targetId]),
    ).toThrow("--group is required");
  });

  it("refuses a missing --choice", () => {
    expect(() =>
      parseRecoveryArguments(["--project", projectId, "--group", groupId]),
    ).toThrow("--choice is required");
  });

  it("refuses Production", () => {
    expect(() =>
      parseRecoveryArguments([
        "--project",
        "greek-yogert",
        "--group",
        groupId,
        "--choice",
        targetId,
      ]),
    ).toThrow("Production catalogue recovery is not authorised");
  });

  it("does not accept credential material through command-line arguments", () => {
    expect(() =>
      parseRecoveryArguments([
        "--project",
        projectId,
        "--group",
        groupId,
        "--choice",
        targetId,
        "--credential",
        "private-value",
      ]),
    ).toThrow("Unsupported argument --credential");
  });

  it("fails closed when external credential identity is unavailable", () => {
    expect(() => readRecoveryCredential(projectId, {})).toThrow(
      "GOOGLE_APPLICATION_CREDENTIALS",
    );
  });

  it("refuses a requested/authenticated project mismatch", () => {
    expect(() =>
      readRecoveryCredential(
        projectId,
        { GOOGLE_APPLICATION_CREDENTIALS: "credential.json" },
        () =>
          JSON.stringify({
            type: "service_account",
            project_id: "different-project",
            client_email: "recovery@different-project.iam.gserviceaccount.com",
            private_key: "private-value",
          }),
      ),
    ).toThrow("Authenticated project does not match --project");
  });

  it("never includes credential or private-key contents in evidence", () => {
    const privateValue = "PRIVATE-KEY-MUST-NOT-APPEAR";
    const credentialValue = "CREDENTIAL-MUST-NOT-APPEAR";
    const evidence = recoveryFailureEvidence(
      new Error(`${privateValue} ${credentialValue}`),
    );
    expect(JSON.stringify(evidence)).not.toContain(privateValue);
    expect(JSON.stringify(evidence)).not.toContain(credentialValue);
    expect(evidence).toMatchObject({
      status: "refused",
      code: "unexpected-failure",
      writesPerformed: "unknown",
    });
  });
});

describe("catalogue overflow recovery module", () => {
  it("refuses a group with exactly 50 Choices", async () => {
    await expect(recover(recoveryStore(50))).rejects.toThrow(
      "Option group is not overflowed",
    );
  });

  it("detects a group with exactly 51 Choices", async () => {
    await expect(recover(recoveryStore())).resolves.toMatchObject({
      choicesBefore: 51,
      choicesAfter: 50,
    });
  });

  it("refuses overflow that cannot be fixed by one deletion", async () => {
    await expect(recover(recoveryStore(52))).rejects.toThrow(
      "Safe one-Choice recovery requires exactly 51 Choices",
    );
  });

  it("refuses a missing target Choice", async () => {
    const store = recoveryStore();
    store.documents.delete(`optionGroups/${groupId}/choices/${targetId}`);
    store.documents.set(
      `optionGroups/${groupId}/choices/replacement`,
      choiceData(50),
    );
    await expect(recover(store)).rejects.toThrow(
      "Specified Choice does not exist",
    );
  });

  it("refuses an active target Choice", async () => {
    const store = recoveryStore();
    store.documents.set(
      `optionGroups/${groupId}/choices/${targetId}`,
      choiceData(50, { active: true }),
    );
    await expect(recover(store)).rejects.toThrow(
      "Specified Choice must be inactive",
    );
  });

  it("refuses a target with everUsed true even when inactive", async () => {
    const store = recoveryStore();
    store.documents.set(
      `optionGroups/${groupId}/choices/${targetId}`,
      choiceData(50, { active: false, everUsed: true }),
    );
    await expect(recover(store)).rejects.toThrow(
      "Specified Choice must never have been used",
    );
  });

  it("refuses a target referenced through canonical Product assignments", async () => {
    const store = recoveryStore();
    store.documents.set("products/product-a", {
      optionGroupAssignments: [{ groupId, choiceIds: [targetId] }],
    });
    await expect(recover(store)).rejects.toThrow(
      "Specified Choice is currently referenced",
    );
  });

  it("refuses a target referenced through an all-Choices assignment", async () => {
    const store = recoveryStore();
    store.documents.set("products/product-a", {
      optionGroupAssignments: [{ groupId }],
    });
    await expect(recover(store)).rejects.toThrow(
      "Specified Choice is currently referenced",
    );
  });

  it("performs zero writes during a valid dry run", async () => {
    const store = recoveryStore();
    const report = await recover(store);
    expect(report.writesPerformed).toBe(0);
    expect(store.deletedPaths).toEqual([]);
    expect(store.documents.size).toBe(52);
  });

  it("reports the exact target path and expected resulting count", async () => {
    await expect(recover(recoveryStore())).resolves.toMatchObject({
      status: "dry-run",
      targetPath: `optionGroups/${groupId}/choices/${targetId}`,
      choicesBefore: 51,
      choicesAfter: 50,
      authoritativeRead: "not-required",
    });
  });

  it("re-reads Choice and Product state immediately before deletion", async () => {
    const store = recoveryStore();
    store.beforeTransaction = () => {
      store.documents.set(
        `optionGroups/${groupId}/choices/${targetId}`,
        choiceData(50, { active: true }),
      );
    };
    await expect(recover(store, true)).rejects.toThrow(
      "Specified Choice must be inactive",
    );
    expect(store.transactionReadPaths).toEqual([
      `optionGroups/${groupId}`,
      `optionGroups/${groupId}/choices`,
      "products",
    ]);
    expect(store.deletedPaths).toEqual([]);
  });

  it("deletes exactly one valid target Choice and leaves 50", async () => {
    const store = recoveryStore();
    const report = await recover(store, true);
    expect(report).toMatchObject({
      status: "applied",
      choicesBefore: 51,
      choicesAfter: 50,
      writesPerformed: 1,
      authoritativeRead: "passed",
    });
    expect(store.deletedPaths).toEqual([
      `optionGroups/${groupId}/choices/${targetId}`,
    ]);
    expect(store.querySnapshot(`optionGroups/${groupId}/choices`).size).toBe(
      50,
    );
  });

  it("leaves every other Choice byte-for-byte unchanged", async () => {
    const store = recoveryStore();
    const before = new Map(
      [...store.documents.entries()].filter(([path]) =>
        path.startsWith(`optionGroups/${groupId}/choices/`),
      ),
    );
    await recover(store, true);
    before.delete(`optionGroups/${groupId}/choices/${targetId}`);
    expect(
      [...before.entries()].every(
        ([path, value]) =>
          JSON.stringify(store.documents.get(path)) === JSON.stringify(value),
      ),
    ).toBe(true);
  });

  it("leaves group metadata byte-for-byte unchanged", async () => {
    const store = recoveryStore();
    const before = JSON.stringify(
      store.documents.get(`optionGroups/${groupId}`),
    );
    await recover(store, true);
    expect(JSON.stringify(store.documents.get(`optionGroups/${groupId}`))).toBe(
      before,
    );
  });

  it("completes the normal authoritative catalogue read after recovery", async () => {
    const store = recoveryStore();
    await recover(store, true);
    const catalogue = await readAuthoritativeCatalogue(
      store as unknown as Firestore,
    );
    expect(
      catalogue.find((group) => group.id === groupId)?.choices,
    ).toHaveLength(50);
  });

  it("refuses a second apply after the exact recovery", async () => {
    const store = recoveryStore();
    await recover(store, true);
    await expect(recover(store, true)).rejects.toThrow(
      "Option group is not overflowed",
    );
    expect(store.deletedPaths).toHaveLength(1);
  });
});

const emulatorProjectId = "greek-yogert-customer-uat-2026";
const emulatorEnabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

describe.skipIf(!emulatorEnabled)(
  "catalogue overflow recovery Firestore Emulator proof",
  () => {
    let adminApp: App;
    let environment: RulesTestEnvironment;
    let credentialDirectory: string;
    let credentialPath: string;

    beforeAll(async () => {
      const [host, portText] = process.env.FIRESTORE_EMULATOR_HOST!.split(":");
      environment = await initializeTestEnvironment({
        projectId: emulatorProjectId,
        firestore: {
          host,
          port: Number(portText),
          rules: readFileSync("firestore.production.rules", "utf8"),
        },
      });
      await environment.clearFirestore();
      adminApp = initializeApp(
        { projectId: emulatorProjectId },
        `recovery-proof-${Date.now()}`,
      );
      credentialDirectory = mkdtempSync(join(tmpdir(), "catalogue-recovery-"));
      credentialPath = join(credentialDirectory, "credential.json");
      const { privateKey } = generateKeyPairSync("rsa", {
        modulusLength: 2048,
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
        publicKeyEncoding: { type: "spki", format: "pem" },
      });
      writeFileSync(
        credentialPath,
        JSON.stringify({
          type: "service_account",
          project_id: emulatorProjectId,
          private_key_id: "emulator-only",
          private_key: privateKey,
          client_email: `recovery@${emulatorProjectId}.iam.gserviceaccount.com`,
          client_id: "emulator-only",
          auth_uri: "https://accounts.google.com/o/oauth2/auth",
          token_uri: "https://oauth2.googleapis.com/token",
          auth_provider_x509_cert_url:
            "https://www.googleapis.com/oauth2/v1/certs",
          client_x509_cert_url:
            "https://www.googleapis.com/robot/v1/metadata/x509/emulator",
        }),
        { mode: 0o600 },
      );
    });

    afterAll(async () => {
      if (adminApp) await deleteApp(adminApp);
      if (environment) await environment.cleanup();
      if (credentialDirectory)
        rmSync(credentialDirectory, { recursive: true, force: true });
    });

    function runPackageCommand(script: string, arguments_: string[]) {
      const pnpmCli =
        process.env.CATALOGUE_RECOVERY_PNPM_CLI ?? process.env.npm_execpath;
      if (!pnpmCli) throw new Error("pnpm command boundary is unavailable");
      return spawnSync(
        process.execPath,
        [pnpmCli, script, "--", ...arguments_],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            GOOGLE_APPLICATION_CREDENTIALS: credentialPath,
          },
        },
      );
    }

    function jsonEvidence(output: string) {
      const line = output
        .split(/\r?\n/)
        .reverse()
        .find((entry) => entry.trim().startsWith("{"));
      if (!line) throw new Error(`Missing structured evidence: ${output}`);
      return JSON.parse(line) as Record<string, unknown>;
    }

    it("proves dry-run, exact apply, repository recovery, projection dry-run, and Staff deletion denial", async () => {
      const firestore = getFirestore(adminApp);
      const groupPath = `optionGroups/${groupId}`;
      const batch = firestore.batch();
      batch.set(firestore.doc(groupPath), groupMetadata);
      batch.set(firestore.doc("users/recovery-staff"), {
        role: "staff",
        active: true,
      });
      Array.from({ length: 51 }, (_, index) =>
        batch.set(
          firestore.doc(
            `${groupPath}/choices/choice-${String(index).padStart(2, "0")}`,
          ),
          choiceData(index),
        ),
      );
      await batch.commit();
      const groupBefore = (await firestore.doc(groupPath).get()).data();
      const choicesBefore = await firestore
        .collection(`${groupPath}/choices`)
        .get();
      const choiceBytesBefore = new Map(
        choicesBefore.docs.map((choice) => [
          choice.id,
          JSON.stringify(choice.data()),
        ]),
      );

      const baseArguments = [
        "--project",
        emulatorProjectId,
        "--group",
        groupId,
        "--choice",
        targetId,
      ];
      const dryRun = runPackageCommand(
        "catalogue:recover-overflow",
        baseArguments,
      );
      expect(dryRun.status, dryRun.stderr).toBe(0);
      expect(jsonEvidence(dryRun.stdout)).toMatchObject({
        status: "dry-run",
        targetPath: `${groupPath}/choices/${targetId}`,
        choicesBefore: 51,
        choicesAfter: 50,
        writesPerformed: 0,
      });
      expect(
        await firestore.collection(`${groupPath}/choices`).get(),
      ).toHaveProperty("size", 51);

      const apply = runPackageCommand("catalogue:recover-overflow", [
        ...baseArguments,
        "--apply",
      ]);
      expect(apply.status, apply.stderr).toBe(0);
      expect(jsonEvidence(apply.stdout)).toMatchObject({
        status: "applied",
        targetPath: `${groupPath}/choices/${targetId}`,
        choicesBefore: 51,
        choicesAfter: 50,
        writesPerformed: 1,
        authoritativeRead: "passed",
      });

      const choicesAfter = await firestore
        .collection(`${groupPath}/choices`)
        .get();
      expect(choicesAfter.size).toBe(50);
      expect((await firestore.doc(groupPath).get()).data()).toEqual(
        groupBefore,
      );
      choicesAfter.docs.forEach((choice) =>
        expect(JSON.stringify(choice.data())).toBe(
          choiceBytesBefore.get(choice.id),
        ),
      );
      expect(
        (await readAuthoritativeCatalogue(firestore)).find(
          (group) => group.id === groupId,
        )?.choices,
      ).toHaveLength(50);

      const projection = runPackageCommand("projection:public", [
        "--project",
        emulatorProjectId,
        "--mode",
        "dry-run",
      ]);
      expect(projection.status, projection.stderr).toBe(0);
      expect(jsonEvidence(projection.stdout)).toMatchObject({
        status: "dry-run-complete",
        writesPerformed: 0,
      });

      const staff = environment
        .authenticatedContext("recovery-staff", {
          firebase: { sign_in_provider: "password" },
        })
        .firestore();
      await assertFails(
        deleteDoc(doc(staff, groupPath, "choices", "choice-00")),
      );

      const secondApply = runPackageCommand("catalogue:recover-overflow", [
        ...baseArguments,
        "--apply",
      ]);
      expect(secondApply.status).not.toBe(0);
      expect(jsonEvidence(secondApply.stderr)).toMatchObject({
        status: "refused",
        code: "not-overflowed",
        writesPerformed: 0,
      });
      expect(
        await firestore.collection(`${groupPath}/choices`).get(),
      ).toHaveProperty("size", 50);
    }, 60_000);
  },
);

describe("catalogue recovery safe error type", () => {
  it("returns structured refusal evidence for known validation failures", () => {
    expect(
      recoveryFailureEvidence(
        new CatalogueRecoveryError("known", "Safe refusal"),
      ),
    ).toEqual({
      status: "refused",
      code: "known",
      error: "Safe refusal",
      writesPerformed: 0,
    });
  });
});
