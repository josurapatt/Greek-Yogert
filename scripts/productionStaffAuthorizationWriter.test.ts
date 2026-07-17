import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  executeControlledAuthorizationWriter,
  parseCommandArguments,
  productionProjectId,
  readExpectedPrincipal,
  readExternalInventory,
  readServiceAccount,
  runAuthorizationWriter,
  runSanitizedWriter,
  validateInventory,
  validateProjectId,
  validateServiceAccount,
  writeConfirmation,
} from "./productionStaffAuthorizationWriter.mjs";

const ordinaryUid = "GYSr8VxQp2Lm4Nw6Ka9Hd3Jf5Tb7";
const capableUid = "GYSc4Mz7Ra2Vk9Np6Lh8Qd1Xe5Uw";
const ordinaryEmail = "ordinary.operator@greekyogurt-shop.co.th";
const capableEmail = "capable.operator@greekyogurt-shop.co.th";
const principalEmail =
  "writer-principal-000000@greek-yogert.iam.gserviceaccount.com";

function inventory(overrides: Record<string, unknown> = {}) {
  return {
    projectId: productionProjectId,
    staff: [
      {
        email: ordinaryEmail,
        uid: ordinaryUid,
        role: "ordinary",
        authDisabled: false,
      },
      {
        email: capableEmail,
        uid: capableUid,
        role: "capable",
        authDisabled: false,
      },
    ],
    ...overrides,
  };
}

function serviceAccount(overrides: Record<string, unknown> = {}) {
  return {
    type: "service_account",
    project_id: productionProjectId,
    client_email: principalEmail,
    private_key: "synthetic-key-material",
    ...overrides,
  };
}

function expectedPrincipal(overrides: Record<string, unknown> = {}) {
  return {
    projectId: productionProjectId,
    serviceAccountEmail: principalEmail,
    ...overrides,
  };
}

function fakeClients({
  existing = [] as string[],
  authFailure = false,
  commitFailure = false,
  postCommitFailure,
}: {
  existing?: string[];
  authFailure?: boolean;
  commitFailure?: boolean;
  postCommitFailure?: "read" | "missing" | "mismatch" | "extra";
} = {}) {
  const documents = new Map<string, Record<string, unknown>>();
  existing.forEach((path) => documents.set(path, { existing: true }));
  const reads: string[] = [];
  const creates: Array<{ path: string; data: Record<string, unknown> }> = [];
  const mutations = { deletes: 0, merges: 0, overwrites: 0, commits: 0 };
  const auth = {
    getUser: vi.fn(async (uid: string) => {
      if (authFailure) throw new Error("sensitive credential failure");
      if (uid === ordinaryUid) return { disabled: false, email: ordinaryEmail };
      if (uid === capableUid) return { disabled: false, email: capableEmail };
      throw new Error("unexpected synthetic identifier");
    }),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
  };
  const firestore = {
    doc(path: string) {
      return {
        path,
        async get() {
          reads.push(path);
          const afterCommit = mutations.commits === 1;
          if (afterCommit && postCommitFailure === "read")
            throw new Error("sensitive post-write failure");
          if (afterCommit && postCommitFailure === "missing")
            return { exists: false, data: () => undefined };
          const data = documents.get(path);
          if (afterCommit && postCommitFailure === "mismatch")
            return {
              exists: true,
              data: () => ({ ...data, active: false }),
            };
          if (afterCommit && postCommitFailure === "extra")
            return {
              exists: true,
              data: () => ({ ...data, unreviewed: true }),
            };
          return { exists: documents.has(path), data: () => data };
        },
      };
    },
    batch() {
      const pending: Array<{ path: string; data: Record<string, unknown> }> =
        [];
      return {
        create(reference: { path: string }, data: Record<string, unknown>) {
          pending.push({ path: reference.path, data });
          creates.push({ path: reference.path, data });
        },
        async commit() {
          if (commitFailure) throw new Error("sensitive token failure");
          if (pending.some(({ path }) => documents.has(path)))
            throw new Error("precondition failure");
          pending.forEach(({ path, data }) => documents.set(path, data));
          mutations.commits += 1;
        },
      };
    },
  };
  return { auth, firestore, documents, reads, creates, mutations };
}

function externalJson(value: unknown) {
  const directory = mkdtempSync(join(tmpdir(), "staff-writer-"));
  const path = join(directory, "input.json");
  writeFileSync(path, JSON.stringify(value), "utf8");
  return { directory, path };
}

async function expectWriterFailure(
  input: Parameters<typeof runAuthorizationWriter>[0],
  stage: string,
) {
  await expect(runAuthorizationWriter(input)).rejects.toMatchObject({ stage });
}

describe("Production Staff authorization writer inventory validation", () => {
  it("accepts exactly one ordinary and one capable mapping", () => {
    expect(validateInventory(inventory())).toMatchObject([
      { role: "ordinary", data: { role: "staff", active: true } },
      {
        role: "capable",
        data: {
          role: "staff",
          active: true,
          canManageCustomerOrdering: true,
        },
      },
    ]);
  });

  it.each([
    ["missing inventory", undefined],
    ["unexpected root field", { ...inventory(), unsupported: true }],
    ["one record", inventory({ staff: [inventory().staff[0]] })],
    [
      "three records",
      inventory({ staff: [...inventory().staff, inventory().staff[0]] }),
    ],
    [
      "duplicate UID",
      inventory({
        staff: [
          inventory().staff[0],
          { ...inventory().staff[1], uid: ordinaryUid },
        ],
      }),
    ],
    [
      "duplicate ordinary role",
      inventory({
        staff: [
          inventory().staff[0],
          { ...inventory().staff[1], role: "ordinary" },
        ],
      }),
    ],
    [
      "duplicate capable role",
      inventory({
        staff: [
          { ...inventory().staff[0], role: "capable" },
          inventory().staff[1],
        ],
      }),
    ],
    [
      "placeholder UID",
      inventory({
        staff: [
          { ...inventory().staff[0], uid: "mock-identifier" },
          inventory().staff[1],
        ],
      }),
    ],
    [
      "reserved email domain",
      inventory({
        staff: [
          { ...inventory().staff[0], email: "ordinary@example.com" },
          inventory().staff[1],
        ],
      }),
    ],
    [
      "unexpected field",
      inventory({
        staff: [
          { ...inventory().staff[0], unsupported: true },
          inventory().staff[1],
        ],
      }),
    ],
    [
      "invalid role",
      inventory({
        staff: [
          { ...inventory().staff[0], role: "administrator" },
          inventory().staff[1],
        ],
      }),
    ],
    [
      "disabled account",
      inventory({
        staff: [
          { ...inventory().staff[0], authDisabled: true },
          inventory().staff[1],
        ],
      }),
    ],
  ])("rejects %s", (_label, value) => {
    expect(() => validateInventory(value)).toThrow("inventory-validation");
  });

  it("rejects every project except the exact Production project", () => {
    expect(() => validateProjectId("greek-yogert-customer-uat-2026")).toThrow(
      "project-validation",
    );
    expect(() => validateProjectId("")).toThrow("project-validation");
    expect(() => validateProjectId("other-project")).toThrow(
      "project-validation",
    );
  });

  it("rejects credentials outside the exact Production project", () => {
    expect(() =>
      validateServiceAccount(
        serviceAccount({ project_id: "greek-yogert-customer-uat-2026" }),
      ),
    ).toThrow("credential-validation");
  });

  it("rejects an inventory path inside the repository", () => {
    expect(() => readExternalInventory(process.cwd())).toThrow(
      "inventory-location",
    );
  });
});

describe("Production Staff authorization writer external file boundary", () => {
  it("rejects relative, repository, and missing credential paths", () => {
    expect(() => readServiceAccount("credential.json")).toThrow(
      "credential-validation",
    );
    expect(() =>
      readServiceAccount(resolve(process.cwd(), "package.json")),
    ).toThrow("credential-validation");
    expect(() =>
      readServiceAccount(join(tmpdir(), "missing-staff-credential.json")),
    ).toThrow("credential-validation");
  });

  it("rejects a symlink that resolves inside the repository where supported", () => {
    const directory = mkdtempSync(join(tmpdir(), "staff-writer-link-"));
    const link = join(directory, "credential-link.json");
    try {
      try {
        symlinkSync(resolve(process.cwd(), "package.json"), link, "file");
        expect(() => readServiceAccount(link)).toThrow("credential-validation");
      } catch (error: unknown) {
        if (
          !error ||
          typeof error !== "object" ||
          !["EPERM", "EACCES", "UNKNOWN"].includes(
            (error as NodeJS.ErrnoException).code ?? "",
          )
        )
          throw error;
        expect(() =>
          readServiceAccount(resolve(process.cwd(), "package.json")),
        ).toThrow("credential-validation");
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("accepts valid external credential and expected-principal files", () => {
    const credential = externalJson(serviceAccount());
    const principal = externalJson(expectedPrincipal());
    try {
      expect(readServiceAccount(credential.path)).toMatchObject({
        project_id: productionProjectId,
      });
      expect(readExpectedPrincipal(principal.path)).toBe(principalEmail);
    } finally {
      rmSync(credential.directory, { recursive: true, force: true });
      rmSync(principal.directory, { recursive: true, force: true });
    }
  });

  it("rejects a project-mismatched external credential", () => {
    const credential = externalJson(
      serviceAccount({ project_id: "greek-yogert-customer-uat-2026" }),
    );
    try {
      expect(() => readServiceAccount(credential.path)).toThrow(
        "credential-validation",
      );
    } finally {
      rmSync(credential.directory, { recursive: true, force: true });
    }
  });
});

describe("Production Staff authorization writer execution boundary", () => {
  it("is validation-only by default and does not need Firebase clients", async () => {
    await expect(
      runAuthorizationWriter({
        projectId: productionProjectId,
        inventory: inventory(),
      }),
    ).resolves.toMatchObject({
      status: "validation-only",
      authorizationDocumentsCreated: 0,
    });
  });

  it.each([
    ["FIRESTORE_EMULATOR_HOST", { FIRESTORE_EMULATOR_HOST: "localhost:8080" }],
    ["an empty FIRESTORE_EMULATOR_HOST", { FIRESTORE_EMULATOR_HOST: "" }],
    [
      "FIREBASE_AUTH_EMULATOR_HOST",
      { FIREBASE_AUTH_EMULATOR_HOST: "localhost:9099" },
    ],
    [
      "FIREBASE_DATABASE_EMULATOR_HOST",
      { FIREBASE_DATABASE_EMULATOR_HOST: "localhost:9000" },
    ],
    [
      "FIREBASE_STORAGE_EMULATOR_HOST",
      { FIREBASE_STORAGE_EMULATOR_HOST: "localhost:9199" },
    ],
    ["FUNCTIONS_EMULATOR", { FUNCTIONS_EMULATOR: "true" }],
    ["a conflicting GCLOUD_PROJECT", { GCLOUD_PROJECT: "other-project" }],
    [
      "a conflicting GOOGLE_CLOUD_PROJECT",
      { GOOGLE_CLOUD_PROJECT: "other-project" },
    ],
    [
      "a conflicting FIREBASE_CONFIG",
      { FIREBASE_CONFIG: JSON.stringify({ projectId: "other-project" }) },
    ],
    ["a malformed FIREBASE_CONFIG", { FIREBASE_CONFIG: "not-json" }],
    [
      "conflicting FIREBASE_CONFIG project identifiers",
      {
        FIREBASE_CONFIG: JSON.stringify({
          projectId: productionProjectId,
          project_id: "other-project",
        }),
      },
    ],
  ])(
    "fails before credential reads or Firebase initialization for %s",
    async (_label, environment) => {
      const clients = fakeClients();
      const loadService = vi.fn(() => serviceAccount());
      const loadPrincipal = vi.fn(() => principalEmail);
      const initializeClients = vi.fn(() => clients);
      await expect(
        executeControlledAuthorizationWriter({
          projectId: productionProjectId,
          inventory: inventory(),
          confirmation: writeConfirmation,
          environment,
          loadServiceAccount: loadService,
          loadExpectedPrincipal: loadPrincipal,
          initializeClients,
        }),
      ).rejects.toMatchObject({ stage: "environment-validation" });
      expect(loadService).not.toHaveBeenCalled();
      expect(loadPrincipal).not.toHaveBeenCalled();
      expect(initializeClients).not.toHaveBeenCalled();
      expect(clients.auth.getUser).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["no project environment", {}],
    ["exact GCLOUD_PROJECT", { GCLOUD_PROJECT: productionProjectId }],
    [
      "exact GOOGLE_CLOUD_PROJECT",
      { GOOGLE_CLOUD_PROJECT: productionProjectId },
    ],
    [
      "exact FIREBASE_CONFIG projectId",
      {
        FIREBASE_CONFIG: JSON.stringify({ projectId: productionProjectId }),
      },
    ],
    [
      "exact FIREBASE_CONFIG projectId and project_id",
      {
        FIREBASE_CONFIG: JSON.stringify({
          projectId: productionProjectId,
          project_id: productionProjectId,
        }),
      },
    ],
  ])(
    "continues to the mocked initialization boundary for %s",
    async (_label, environment) => {
      const clients = fakeClients();
      const loadService = vi.fn(() => serviceAccount());
      const loadPrincipal = vi.fn(() => principalEmail);
      const initializationBoundary = new Error("mock initialization boundary");
      const initializeClients = vi.fn(() => {
        throw initializationBoundary;
      });

      await expect(
        executeControlledAuthorizationWriter({
          projectId: productionProjectId,
          inventory: inventory(),
          confirmation: writeConfirmation,
          environment,
          loadServiceAccount: loadService,
          loadExpectedPrincipal: loadPrincipal,
          initializeClients,
        }),
      ).rejects.toBe(initializationBoundary);
      expect(loadService).toHaveBeenCalledTimes(1);
      expect(loadPrincipal).toHaveBeenCalledTimes(1);
      expect(initializeClients).toHaveBeenCalledTimes(1);
      expect(clients.auth.getUser).not.toHaveBeenCalled();
      expect(clients.creates).toEqual([]);
    },
  );

  it("requires the exact Production confirmation before any client call", async () => {
    const clients = fakeClients();
    await expectWriterFailure(
      {
        projectId: productionProjectId,
        inventory: inventory(),
        execute: true,
        auth: clients.auth,
        firestore: clients.firestore,
      },
      "write-confirmation",
    );
    expect(clients.auth.getUser).not.toHaveBeenCalled();
    expect(clients.creates).toEqual([]);
  });

  it("rejects missing or mismatched expected principals before initialization", async () => {
    for (const value of [
      undefined,
      "other@greek-yogert.iam.gserviceaccount.com",
    ]) {
      const initializeClients = vi.fn();
      await expect(
        executeControlledAuthorizationWriter({
          projectId: productionProjectId,
          inventory: inventory(),
          confirmation: writeConfirmation,
          environment: {},
          loadServiceAccount: () => serviceAccount(),
          loadExpectedPrincipal: () => value,
          initializeClients,
        }),
      ).rejects.toMatchObject({ stage: "principal-validation" });
      expect(initializeClients).not.toHaveBeenCalled();
    }
  });

  it("creates exactly the reviewed two-document schemas with no unrelated writes", async () => {
    const clients = fakeClients();
    await expect(
      runAuthorizationWriter({
        projectId: productionProjectId,
        inventory: inventory(),
        execute: true,
        confirmation: writeConfirmation,
        auth: clients.auth,
        firestore: clients.firestore,
      }),
    ).resolves.toMatchObject({
      status: "created",
      authorizationDocumentsCreated: 2,
      identifiersLogged: false,
    });
    expect(clients.auth.getUser).toHaveBeenCalledTimes(2);
    expect(clients.auth.updateUser).not.toHaveBeenCalled();
    expect(clients.auth.deleteUser).not.toHaveBeenCalled();
    expect(clients.creates).toEqual([
      {
        path: `users/${ordinaryUid}`,
        data: { role: "staff", active: true },
      },
      {
        path: `users/${capableUid}`,
        data: {
          role: "staff",
          active: true,
          canManageCustomerOrdering: true,
        },
      },
    ]);
    expect(clients.reads.every((path) => path.startsWith("users/"))).toBe(true);
    expect([...clients.documents.keys()]).toHaveLength(2);
    expect(clients.mutations).toEqual({
      deletes: 0,
      merges: 0,
      overwrites: 0,
      commits: 1,
    });
  });

  it.each([
    ["first target", [`users/${ordinaryUid}`]],
    ["second target", [`users/${capableUid}`]],
    ["both targets", [`users/${ordinaryUid}`, `users/${capableUid}`]],
  ])(
    "aborts before writes when %s already exists",
    async (_label, existing) => {
      const clients = fakeClients({ existing });
      await expectWriterFailure(
        {
          projectId: productionProjectId,
          inventory: inventory(),
          execute: true,
          confirmation: writeConfirmation,
          auth: clients.auth,
          firestore: clients.firestore,
        },
        "existing-document-check",
      );
      expect(clients.creates).toEqual([]);
    },
  );

  it("stops before writes when Authentication verification fails", async () => {
    const clients = fakeClients({ authFailure: true });
    await expectWriterFailure(
      {
        projectId: productionProjectId,
        inventory: inventory(),
        execute: true,
        confirmation: writeConfirmation,
        auth: clients.auth,
        firestore: clients.firestore,
      },
      "authentication-verification",
    );
    expect(clients.creates).toEqual([]);
    expect(clients.documents).toEqual(new Map());
  });

  it("does not accept partial success when the atomic batch fails", async () => {
    const clients = fakeClients({ commitFailure: true });
    await expectWriterFailure(
      {
        projectId: productionProjectId,
        inventory: inventory(),
        execute: true,
        confirmation: writeConfirmation,
        auth: clients.auth,
        firestore: clients.firestore,
      },
      "authorization-write",
    );
    expect(clients.creates).toHaveLength(2);
    expect(clients.documents).toEqual(new Map());
    expect(clients.mutations.commits).toBe(0);
  });

  it.each(["read", "missing", "mismatch", "extra"] as const)(
    "stops without repair after post-commit %s verification failure",
    async (postCommitFailure) => {
      const output: string[] = [];
      const clients = fakeClients({ postCommitFailure });
      await expect(
        runSanitizedWriter(
          {
            projectId: productionProjectId,
            inventory: inventory(),
            execute: true,
            confirmation: writeConfirmation,
            auth: clients.auth,
            firestore: clients.firestore,
          },
          (message: string) => output.push(message),
        ),
      ).rejects.toMatchObject({ stage: "post-write-verification" });
      expect(clients.documents).toHaveLength(2);
      expect(clients.creates).toHaveLength(2);
      expect(clients.mutations).toEqual({
        deletes: 0,
        merges: 0,
        overwrites: 0,
        commits: 1,
      });
      const logs = output.join("\n");
      expect(logs).toContain('"stage":"post-write-verification"');
      expect(logs).not.toContain(ordinaryUid);
      expect(logs).not.toContain(capableUid);
      expect(logs).not.toContain("sensitive post-write failure");
    },
  );
});

describe("Production Staff authorization writer sanitized interface", () => {
  it("accepts only the explicit command interface", () => {
    expect(
      parseCommandArguments([
        "--project",
        productionProjectId,
        "--inventory",
        "C:\\secure\\inventory.json",
      ]),
    ).toMatchObject({ execute: false, projectId: productionProjectId });
    expect(() =>
      parseCommandArguments([
        "--project",
        productionProjectId,
        "--inventory",
        "C:\\secure\\inventory.json",
        "--execute",
      ]),
    ).toThrow("command-validation");
    expect(() =>
      parseCommandArguments([
        "--project",
        productionProjectId,
        "--inventory",
        "C:\\secure\\inventory.json",
        "--unknown",
      ]),
    ).toThrow("command-validation");
  });

  it("never logs identifiers on success or failure", async () => {
    const output: string[] = [];
    const clients = fakeClients();
    await runSanitizedWriter(
      {
        projectId: productionProjectId,
        inventory: inventory(),
        execute: true,
        confirmation: writeConfirmation,
        auth: clients.auth,
        firestore: clients.firestore,
      },
      (message: string) => output.push(message),
    );
    const failedClients = fakeClients({ authFailure: true });
    await expect(
      runSanitizedWriter(
        {
          projectId: productionProjectId,
          inventory: inventory(),
          execute: true,
          confirmation: writeConfirmation,
          auth: failedClients.auth,
          firestore: failedClients.firestore,
        },
        (message: string) => output.push(message),
      ),
    ).rejects.toThrow();
    const logs = output.join("\n");
    expect(logs).not.toContain(ordinaryUid);
    expect(logs).not.toContain(capableUid);
    expect(logs).not.toContain(ordinaryEmail);
    expect(logs).not.toContain(capableEmail);
    expect(logs).not.toContain(principalEmail);
    expect(logs).not.toContain("sensitive credential failure");
  });
});
