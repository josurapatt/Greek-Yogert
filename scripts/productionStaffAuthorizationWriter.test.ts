import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  applyConfirmation,
  approvalFingerprintSchema,
  createInventoryFingerprint,
  executeControlledAuthorizationWriter,
  inventoryFingerprintSchema,
  parseCommandArguments,
  productionProjectId,
  readExpectedPrincipal,
  readExternalInventory,
  readServiceAccount,
  runAuthorizationWriter,
  runSanitizedWriter,
  validateExpectedPrincipal,
  validateInventory,
  validateProjectId,
  validateServiceAccount,
} from "./productionStaffAuthorizationWriter.mjs";

const ordinaryUid = "GYSr8VxQp2Lm4Nw6Ka9Hd3Jf5Tb7";
const capableUid = "GYSc4Mz7Ra2Vk9Np6Lh8Qd1Xe5Uw";
const ordinaryEmail = "ordinary.operator@greekyogurt-shop.co.th";
const capableEmail = "capable.operator@greekyogurt-shop.co.th";
const principalEmail =
  "writer-principal-000000@greek-yogert.iam.gserviceaccount.com";
const alternatePrincipalEmail =
  "writer-principal-111111@greek-yogert.iam.gserviceaccount.com";
const ordinaryPath = `users/${ordinaryUid}`;
const capablePath = `users/${capableUid}`;
const ordinaryAuthorization = { role: "staff", active: true };
const capableAuthorization = {
  role: "staff",
  active: true,
  canManageCustomerOrdering: true,
};

type DocumentData = Record<string, unknown>;

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

function exactDocuments() {
  return {
    [ordinaryPath]: ordinaryAuthorization,
    [capablePath]: capableAuthorization,
  };
}

function fakeClients({
  initialDocuments = {},
  authFailure = false,
  authOverrides = {},
  missingAuthUid,
  readFailure = false,
  commitFailure = false,
  racePath,
  postCommitFailure,
}: {
  initialDocuments?: Record<string, DocumentData>;
  authFailure?: boolean;
  authOverrides?: Record<string, Record<string, unknown>>;
  missingAuthUid?: string;
  readFailure?: boolean;
  commitFailure?: boolean;
  racePath?: string;
  postCommitFailure?: "read" | "missing" | "mismatch" | "extra";
} = {}) {
  const documents = new Map<string, DocumentData>(
    Object.entries(initialDocuments).map(([path, data]) => [
      path,
      structuredClone(data),
    ]),
  );
  const reads: string[] = [];
  const docPaths: string[] = [];
  const creates: Array<{ path: string; data: DocumentData }> = [];
  const mutations = {
    batchCalls: 0,
    commitAttempts: 0,
    commits: 0,
    authUpdates: 0,
    authDeletes: 0,
    authCreates: 0,
    sets: 0,
    updates: 0,
    deletes: 0,
  };
  const defaultUsers: Record<string, Record<string, unknown>> = {
    [ordinaryUid]: { disabled: false, email: ordinaryEmail },
    [capableUid]: { disabled: false, email: capableEmail },
  };
  const users = new Map(
    Object.entries({ ...defaultUsers, ...authOverrides }).map(([uid, user]) => [
      uid,
      structuredClone(user),
    ]),
  );
  if (missingAuthUid) users.delete(missingAuthUid);
  const auth = {
    getUser: vi.fn(async (uid: string) => {
      if (authFailure) throw new Error("sensitive credential failure");
      const user = users.get(uid);
      if (!user) throw new Error("sensitive missing-user detail");
      return structuredClone(user);
    }),
    updateUser: vi.fn(async () => {
      mutations.authUpdates += 1;
    }),
    deleteUser: vi.fn(async () => {
      mutations.authDeletes += 1;
    }),
    createUser: vi.fn(async () => {
      mutations.authCreates += 1;
    }),
    listUsers: vi.fn(),
  };
  const firestore = {
    doc(path: string) {
      docPaths.push(path);
      return {
        path,
        async get() {
          reads.push(path);
          if (readFailure) throw new Error("sensitive Firestore failure");
          const afterCommit = mutations.commits > 0;
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
          return {
            exists: documents.has(path),
            data: () => (data ? structuredClone(data) : undefined),
          };
        },
        async set() {
          mutations.sets += 1;
        },
        async update() {
          mutations.updates += 1;
        },
        async delete() {
          mutations.deletes += 1;
        },
      };
    },
    batch() {
      mutations.batchCalls += 1;
      const pending: Array<{ path: string; data: DocumentData }> = [];
      return {
        create(reference: { path: string }, data: DocumentData) {
          const entry = { path: reference.path, data: structuredClone(data) };
          pending.push(entry);
          creates.push(entry);
        },
        async commit() {
          mutations.commitAttempts += 1;
          if (commitFailure) throw new Error("sensitive token failure");
          if (racePath) documents.set(racePath, { createdByRace: true });
          if (pending.some(({ path }) => documents.has(path)))
            throw new Error("create precondition failure");
          pending.forEach(({ path, data }) =>
            documents.set(path, structuredClone(data)),
          );
          mutations.commits += 1;
        },
      };
    },
  };
  return {
    auth,
    firestore,
    documents,
    users,
    reads,
    docPaths,
    creates,
    mutations,
  };
}

function externalJson(value: unknown) {
  const directory = mkdtempSync(join(tmpdir(), "staff-writer-"));
  const path = join(directory, "input.json");
  writeFileSync(path, JSON.stringify(value), "utf8");
  return { directory, path };
}

async function planWith(
  clients: ReturnType<typeof fakeClients>,
  selectedInventory = inventory(),
  expectedPrincipal = principalEmail,
) {
  return runAuthorizationWriter({
    projectId: productionProjectId,
    inventory: selectedInventory,
    mode: "plan",
    expectedPrincipal,
    auth: clients.auth,
    firestore: clients.firestore,
  });
}

async function applyWith(
  clients: ReturnType<typeof fakeClients>,
  approvedFingerprint: string,
  selectedInventory = inventory(),
  expectedPrincipal = principalEmail,
) {
  return runAuthorizationWriter({
    projectId: productionProjectId,
    inventory: selectedInventory,
    mode: "apply",
    confirmation: applyConfirmation,
    approvedFingerprint,
    expectedPrincipal,
    auth: clients.auth,
    firestore: clients.firestore,
  });
}

describe("Production Staff authorization inventory and fingerprints", () => {
  it("accepts exactly one ordinary and one capable mapping with exact schemas", () => {
    expect(validateInventory(inventory())).toEqual([
      {
        role: "ordinary",
        email: ordinaryEmail,
        uid: ordinaryUid,
        data: ordinaryAuthorization,
      },
      {
        role: "capable",
        email: capableEmail,
        uid: capableUid,
        data: capableAuthorization,
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
      "duplicate email",
      inventory({
        staff: [
          inventory().staff[0],
          { ...inventory().staff[1], email: ordinaryEmail.toUpperCase() },
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
      "placeholder email",
      inventory({
        staff: [
          { ...inventory().staff[0], email: "todo@greekyogurt-shop.co.th" },
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
    for (const projectId of [
      "greek-yogert-customer-uat-2026",
      "",
      "other-project",
    ])
      expect(() => validateProjectId(projectId)).toThrow("project-validation");
  });

  it("rejects credentials and principals outside the exact Production project", () => {
    expect(() =>
      validateServiceAccount(
        serviceAccount({ project_id: "greek-yogert-customer-uat-2026" }),
      ),
    ).toThrow("credential-validation");
    expect(() =>
      validateExpectedPrincipal(
        expectedPrincipal({ projectId: "greek-yogert-customer-uat-2026" }),
      ),
    ).toThrow("principal-validation");
  });

  it("creates a deterministic order-independent inventory fingerprint", () => {
    const first = createInventoryFingerprint(inventory());
    const reversed = createInventoryFingerprint(
      inventory({ staff: [...inventory().staff].reverse() }),
    );
    const normalizedEmail = createInventoryFingerprint(
      inventory({
        staff: [
          { ...inventory().staff[0], email: ordinaryEmail.toUpperCase() },
          inventory().staff[1],
        ],
      }),
    );
    expect(first).toMatch(
      new RegExp(`^${inventoryFingerprintSchema}-[a-f0-9]{64}$`),
    );
    expect(reversed).toBe(first);
    expect(normalizedEmail).toBe(first);
  });

  it("changes the inventory fingerprint for any approved identifier change", () => {
    const original = createInventoryFingerprint(inventory());
    const changedUid = inventory({
      staff: [
        { ...inventory().staff[0], uid: `${ordinaryUid}Z` },
        inventory().staff[1],
      ],
    });
    const changedEmail = inventory({
      staff: [
        {
          ...inventory().staff[0],
          email: "ordinary.changed@greekyogurt-shop.co.th",
        },
        inventory().staff[1],
      ],
    });
    expect(createInventoryFingerprint(changedUid)).not.toBe(original);
    expect(createInventoryFingerprint(changedEmail)).not.toBe(original);
  });
});

describe("Production Staff authorization external file boundary", () => {
  it("rejects an inventory path inside the repository", () => {
    expect(() =>
      readExternalInventory(resolve(process.cwd(), "package.json")),
    ).toThrow("inventory-location");
  });

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

  it("rejects a symlink into the repository where supported", () => {
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

  it("accepts valid external inventory, credential, and principal files", () => {
    const inventoryFile = externalJson(inventory());
    const credential = externalJson(serviceAccount());
    const principal = externalJson(expectedPrincipal());
    try {
      expect(readExternalInventory(inventoryFile.path)).toEqual(inventory());
      expect(readServiceAccount(credential.path)).toMatchObject({
        project_id: productionProjectId,
      });
      expect(readExpectedPrincipal(principal.path)).toBe(principalEmail);
    } finally {
      rmSync(inventoryFile.directory, { recursive: true, force: true });
      rmSync(credential.directory, { recursive: true, force: true });
      rmSync(principal.directory, { recursive: true, force: true });
    }
  });

  it("rejects project-mismatched external files", () => {
    const credential = externalJson(
      serviceAccount({ project_id: "greek-yogert-customer-uat-2026" }),
    );
    const principal = externalJson(
      expectedPrincipal({ projectId: "greek-yogert-customer-uat-2026" }),
    );
    try {
      expect(() => readServiceAccount(credential.path)).toThrow(
        "credential-validation",
      );
      expect(() => readExpectedPrincipal(principal.path)).toThrow(
        "principal-validation",
      );
    } finally {
      rmSync(credential.directory, { recursive: true, force: true });
      rmSync(principal.directory, { recursive: true, force: true });
    }
  });
});

describe("Production Staff authorization controlled online boundary", () => {
  it("is offline validation-only by default", async () => {
    await expect(
      runAuthorizationWriter({
        projectId: productionProjectId,
        inventory: inventory(),
      }),
    ).resolves.toMatchObject({
      status: "validation-only",
      approvedStaff: 2,
      authorizationDocumentsCreated: 0,
      identifiersLogged: false,
    });
  });

  it.each([
    ["FIRESTORE_EMULATOR_HOST", { FIRESTORE_EMULATOR_HOST: "localhost:8080" }],
    ["empty FIRESTORE_EMULATOR_HOST", { FIRESTORE_EMULATOR_HOST: "" }],
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
    ["conflicting GCLOUD_PROJECT", { GCLOUD_PROJECT: "other-project" }],
    [
      "conflicting GOOGLE_CLOUD_PROJECT",
      { GOOGLE_CLOUD_PROJECT: "other-project" },
    ],
    [
      "conflicting FIREBASE_CONFIG",
      { FIREBASE_CONFIG: JSON.stringify({ projectId: "other-project" }) },
    ],
    ["malformed FIREBASE_CONFIG", { FIREBASE_CONFIG: "not-json" }],
    [
      "conflicting FIREBASE_CONFIG project keys",
      {
        FIREBASE_CONFIG: JSON.stringify({
          projectId: productionProjectId,
          project_id: "other-project",
        }),
      },
    ],
  ])("blocks %s before credential reads", async (_label, environment) => {
    const loadService = vi.fn(() => serviceAccount());
    const loadPrincipal = vi.fn(() => principalEmail);
    const initializeClients = vi.fn(() => fakeClients());
    await expect(
      executeControlledAuthorizationWriter({
        projectId: productionProjectId,
        inventory: inventory(),
        mode: "plan",
        environment,
        loadServiceAccount: loadService,
        loadExpectedPrincipal: loadPrincipal,
        initializeClients,
      }),
    ).rejects.toMatchObject({ stage: "environment-validation" });
    expect(loadService).not.toHaveBeenCalled();
    expect(loadPrincipal).not.toHaveBeenCalled();
    expect(initializeClients).not.toHaveBeenCalled();
  });

  it.each([
    ["no project environment", {}],
    ["exact GCLOUD_PROJECT", { GCLOUD_PROJECT: productionProjectId }],
    [
      "exact GOOGLE_CLOUD_PROJECT",
      { GOOGLE_CLOUD_PROJECT: productionProjectId },
    ],
    [
      "exact FIREBASE_CONFIG",
      {
        FIREBASE_CONFIG: JSON.stringify({
          projectId: productionProjectId,
          project_id: productionProjectId,
        }),
      },
    ],
  ])("permits mocked initialization for %s", async (_label, environment) => {
    const clients = fakeClients();
    const initializeClients = vi.fn(() => clients);
    await expect(
      executeControlledAuthorizationWriter({
        projectId: productionProjectId,
        inventory: inventory(),
        mode: "plan",
        environment,
        loadServiceAccount: () => serviceAccount(),
        loadExpectedPrincipal: () => principalEmail,
        initializeClients,
      }),
    ).resolves.toMatchObject({ status: "planned", plannedCreates: 2 });
    expect(initializeClients).toHaveBeenCalledTimes(1);
  });

  it("reproduces the approval fingerprint for the same normalized principal and state", async () => {
    const firstClients = fakeClients();
    const first = await executeControlledAuthorizationWriter({
      projectId: productionProjectId,
      inventory: inventory(),
      mode: "plan",
      environment: {},
      loadServiceAccount: () => serviceAccount(),
      loadExpectedPrincipal: () => principalEmail,
      initializeClients: () => firstClients,
    });
    const repeatedClients = fakeClients();
    const repeated = await executeControlledAuthorizationWriter({
      projectId: productionProjectId,
      inventory: inventory(),
      mode: "plan",
      environment: {},
      loadServiceAccount: () => serviceAccount(),
      loadExpectedPrincipal: () => ` ${principalEmail.toUpperCase()} `,
      initializeClients: () => repeatedClients,
    });
    expect(repeated.approvalFingerprint).toBe(first.approvalFingerprint);
    expect(JSON.stringify([first, repeated])).not.toContain(principalEmail);
  });

  it("changes the approval fingerprint for a different matched principal", async () => {
    const first = await executeControlledAuthorizationWriter({
      projectId: productionProjectId,
      inventory: inventory(),
      mode: "plan",
      environment: {},
      loadServiceAccount: () => serviceAccount(),
      loadExpectedPrincipal: () => principalEmail,
      initializeClients: () => fakeClients(),
    });
    const alternate = await executeControlledAuthorizationWriter({
      projectId: productionProjectId,
      inventory: inventory(),
      mode: "plan",
      environment: {},
      loadServiceAccount: () =>
        serviceAccount({ client_email: alternatePrincipalEmail }),
      loadExpectedPrincipal: () => alternatePrincipalEmail,
      initializeClients: () => fakeClients(),
    });
    expect(alternate.approvalFingerprint).not.toBe(first.approvalFingerprint);
    const output = JSON.stringify([first, alternate]);
    expect(output).not.toContain(principalEmail);
    expect(output).not.toContain(alternatePrincipalEmail);
  });

  it("rejects principal A approval under matched principal B before batching", async () => {
    const approved = await executeControlledAuthorizationWriter({
      projectId: productionProjectId,
      inventory: inventory(),
      mode: "plan",
      environment: {},
      loadServiceAccount: () => serviceAccount(),
      loadExpectedPrincipal: () => principalEmail,
      initializeClients: () => fakeClients(),
    });
    const applyClients = fakeClients();
    await expect(
      executeControlledAuthorizationWriter({
        projectId: productionProjectId,
        inventory: inventory(),
        mode: "apply",
        confirmation: applyConfirmation,
        approvedFingerprint: approved.approvalFingerprint,
        environment: {},
        loadServiceAccount: () =>
          serviceAccount({ client_email: alternatePrincipalEmail }),
        loadExpectedPrincipal: () => alternatePrincipalEmail,
        initializeClients: () => applyClients,
      }),
    ).rejects.toMatchObject({ stage: "fingerprint-mismatch" });
    expect(applyClients.creates).toEqual([]);
    expect(applyClients.mutations.batchCalls).toBe(0);
  });

  it("requires the exact principal before Firebase initialization", async () => {
    for (const value of [
      undefined,
      "other@greek-yogert.iam.gserviceaccount.com",
    ]) {
      const initializeClients = vi.fn();
      await expect(
        executeControlledAuthorizationWriter({
          projectId: productionProjectId,
          inventory: inventory(),
          mode: "plan",
          environment: {},
          loadServiceAccount: () => serviceAccount(),
          loadExpectedPrincipal: () => value,
          initializeClients,
        }),
      ).rejects.toMatchObject({ stage: "principal-validation" });
      expect(initializeClients).not.toHaveBeenCalled();
    }
  });

  it("requires confirmation and a well-formed fingerprint before credentials", async () => {
    for (const entry of [
      { confirmation: undefined, approvedFingerprint: undefined },
      { confirmation: "wrong", approvedFingerprint: undefined },
      { confirmation: applyConfirmation, approvedFingerprint: "wrong" },
    ]) {
      const loadService = vi.fn(() => serviceAccount());
      await expect(
        executeControlledAuthorizationWriter({
          projectId: productionProjectId,
          inventory: inventory(),
          mode: "apply",
          environment: {},
          loadServiceAccount: loadService,
          loadExpectedPrincipal: () => principalEmail,
          initializeClients: () => fakeClients(),
          ...entry,
        }),
      ).rejects.toMatchObject({
        stage:
          entry.confirmation === applyConfirmation
            ? "fingerprint-validation"
            : "write-confirmation",
      });
      expect(loadService).not.toHaveBeenCalled();
    }
  });
});

describe("Production Staff authorization read-only planning", () => {
  it("plans exactly two creates when both documents are missing", async () => {
    const clients = fakeClients();
    const result = await planWith(clients);
    expect(result).toMatchObject({
      status: "planned",
      existingExactDocuments: 0,
      missingDocuments: 2,
      conflictingDocuments: 0,
      plannedCreates: 2,
      plannedCreateFields: [
        { role: "ordinary", fields: ["active", "role"] },
        {
          role: "capable",
          fields: ["active", "canManageCustomerOrdering", "role"],
        },
      ],
      identifiersLogged: false,
    });
    expect(result.approvalFingerprint).toMatch(
      new RegExp(`^${approvalFingerprintSchema}-[a-f0-9]{64}$`),
    );
    expect(clients.auth.getUser).toHaveBeenCalledTimes(2);
    expect(clients.reads).toEqual([ordinaryPath, capablePath]);
    expect(clients.creates).toEqual([]);
    expect(clients.mutations.batchCalls).toBe(0);
  });

  it.each([
    ["ordinary exact", { [ordinaryPath]: ordinaryAuthorization }, 1, 1],
    ["capable exact", { [capablePath]: capableAuthorization }, 1, 1],
    ["both exact", exactDocuments(), 2, 0],
  ])(
    "plans safely when %s",
    async (_label, initialDocuments, exactCount, missingCount) => {
      const clients = fakeClients({ initialDocuments });
      await expect(planWith(clients)).resolves.toMatchObject({
        existingExactDocuments: exactCount,
        missingDocuments: missingCount,
        conflictingDocuments: 0,
        plannedCreates: missingCount,
      });
      expect(clients.mutations.batchCalls).toBe(0);
    },
  );

  it.each([
    ["partial ordinary", { [ordinaryPath]: { role: "staff" } }],
    [
      "wrong capable value",
      {
        [capablePath]: {
          ...capableAuthorization,
          canManageCustomerOrdering: false,
        },
      },
    ],
    [
      "extra ordinary field",
      { [ordinaryPath]: { ...ordinaryAuthorization, unapproved: true } },
    ],
  ])("fails closed for a %s document", async (_label, initialDocuments) => {
    const clients = fakeClients({ initialDocuments });
    await expect(planWith(clients)).rejects.toMatchObject({
      stage: "authorization-document-conflict",
      details: {
        conflictingDocuments: 1,
        plannedCreates: 0,
      },
    });
    expect(clients.creates).toEqual([]);
    expect(clients.mutations.batchCalls).toBe(0);
  });

  it("fails closed on a Firestore read error", async () => {
    const clients = fakeClients({ readFailure: true });
    await expect(planWith(clients)).rejects.toMatchObject({
      stage: "authorization-document-read",
    });
    expect(clients.mutations.batchCalls).toBe(0);
  });

  it.each([
    ["lookup error", { authFailure: true }],
    [
      "disabled user",
      {
        authOverrides: {
          [ordinaryUid]: { disabled: true, email: ordinaryEmail },
        },
      },
    ],
    [
      "email mismatch",
      {
        authOverrides: {
          [capableUid]: {
            disabled: false,
            email: "different.operator@greekyogurt-shop.co.th",
          },
        },
      },
    ],
    ["missing user", { missingAuthUid: ordinaryUid }],
  ])(
    "stops before Firestore for Authentication %s",
    async (_label, options) => {
      const clients = fakeClients(options);
      await expect(planWith(clients)).rejects.toMatchObject({
        stage: "authentication-verification",
      });
      expect(clients.reads).toEqual([]);
      expect(clients.creates).toEqual([]);
    },
  );

  it("binds the approval fingerprint to the freshly observed state", async () => {
    const missing = await planWith(fakeClients());
    const oneExact = await planWith(
      fakeClients({
        initialDocuments: { [ordinaryPath]: ordinaryAuthorization },
      }),
    );
    const allExact = await planWith(
      fakeClients({ initialDocuments: exactDocuments() }),
    );
    expect(
      new Set([
        missing.approvalFingerprint,
        oneExact.approvalFingerprint,
        allExact.approvalFingerprint,
      ]),
    ).toHaveLength(3);
  });

  it("creates a deterministic order-independent approval fingerprint", async () => {
    const first = await planWith(fakeClients());
    const repeated = await planWith(fakeClients());
    const reversed = await planWith(
      fakeClients(),
      inventory({ staff: [...inventory().staff].reverse() }),
    );
    expect(repeated.approvalFingerprint).toBe(first.approvalFingerprint);
    expect(reversed.approvalFingerprint).toBe(first.approvalFingerprint);
  });
});

describe("Production Staff authorization approved apply", () => {
  it.each([
    ["two", {}, 2],
    ["one", { [ordinaryPath]: ordinaryAuthorization }, 1],
    ["zero", exactDocuments(), 0],
  ])("executes the approved %s-create path", async (_label, initial, count) => {
    const clients = fakeClients({ initialDocuments: initial });
    const plan = await planWith(clients);
    const result = await applyWith(clients, plan.approvalFingerprint);
    expect(result).toMatchObject({
      status: count === 0 ? "already-current" : "applied",
      plannedCreates: count,
      authorizationDocumentsCreated: count,
      postWriteVerification: "passed",
      postApplyPlannedCreates: 0,
      idempotencyVerification: "passed",
      identifiersLogged: false,
    });
    expect(clients.creates).toHaveLength(count);
    expect(clients.mutations.batchCalls).toBe(count === 0 ? 0 : 1);
    expect(clients.mutations.commitAttempts).toBe(count === 0 ? 0 : 1);
    expect(clients.mutations.commits).toBe(count === 0 ? 0 : 1);
    expect(clients.documents).toEqual(
      new Map(Object.entries(exactDocuments())),
    );
  });

  it("creates only the exact approved schemas and touches no unrelated APIs", async () => {
    const clients = fakeClients();
    const plan = await planWith(clients);
    await applyWith(clients, plan.approvalFingerprint);
    expect(clients.creates).toEqual([
      { path: ordinaryPath, data: ordinaryAuthorization },
      { path: capablePath, data: capableAuthorization },
    ]);
    expect(new Set(clients.docPaths)).toEqual(
      new Set([ordinaryPath, capablePath]),
    );
    expect(clients.auth.getUser).toHaveBeenCalledTimes(4);
    expect(clients.auth.updateUser).not.toHaveBeenCalled();
    expect(clients.auth.deleteUser).not.toHaveBeenCalled();
    expect(clients.auth.createUser).not.toHaveBeenCalled();
    expect(clients.auth.listUsers).not.toHaveBeenCalled();
    expect(clients.mutations).toMatchObject({
      authUpdates: 0,
      authDeletes: 0,
      authCreates: 0,
      sets: 0,
      updates: 0,
      deletes: 0,
    });
  });

  it("rejects a well-formed but unapproved fingerprint without writes", async () => {
    const clients = fakeClients();
    const differentFingerprint = `${approvalFingerprintSchema}-${"0".repeat(64)}`;
    await expect(
      applyWith(clients, differentFingerprint),
    ).rejects.toMatchObject({
      stage: "fingerprint-mismatch",
    });
    expect(clients.creates).toEqual([]);
    expect(clients.mutations.batchCalls).toBe(0);
  });

  it("re-reads state and rejects stale approval after an exact state change", async () => {
    const clients = fakeClients();
    const plan = await planWith(clients);
    clients.documents.set(ordinaryPath, structuredClone(ordinaryAuthorization));
    await expect(
      applyWith(clients, plan.approvalFingerprint),
    ).rejects.toMatchObject({
      stage: "fingerprint-mismatch",
    });
    expect(clients.creates).toEqual([]);
    expect(clients.mutations.batchCalls).toBe(0);
  });

  it("re-reads state and fails closed when a document becomes conflicting", async () => {
    const clients = fakeClients();
    const plan = await planWith(clients);
    clients.documents.set(ordinaryPath, { role: "staff" });
    await expect(
      applyWith(clients, plan.approvalFingerprint),
    ).rejects.toMatchObject({
      stage: "authorization-document-conflict",
    });
    expect(clients.creates).toEqual([]);
    expect(clients.mutations.batchCalls).toBe(0);
  });

  it("fails atomically on a create-precondition race and never retries", async () => {
    const clients = fakeClients({ racePath: ordinaryPath });
    const plan = await planWith(clients);
    await expect(
      applyWith(clients, plan.approvalFingerprint),
    ).rejects.toMatchObject({
      stage: "authorization-write",
    });
    expect(clients.creates).toHaveLength(2);
    expect(clients.mutations).toMatchObject({
      batchCalls: 1,
      commitAttempts: 1,
      commits: 0,
    });
    expect(clients.documents.has(capablePath)).toBe(false);
  });

  it("does not accept partial success when the atomic batch fails", async () => {
    const clients = fakeClients({ commitFailure: true });
    const plan = await planWith(clients);
    await expect(
      applyWith(clients, plan.approvalFingerprint),
    ).rejects.toMatchObject({
      stage: "authorization-write",
    });
    expect(clients.creates).toHaveLength(2);
    expect(clients.documents).toEqual(new Map());
    expect(clients.mutations).toMatchObject({ commitAttempts: 1, commits: 0 });
  });

  it.each(["read", "missing", "mismatch", "extra"] as const)(
    "stops without repair after post-write %s verification failure",
    async (postCommitFailure) => {
      const clients = fakeClients({ postCommitFailure });
      const plan = await planWith(clients);
      await expect(
        applyWith(clients, plan.approvalFingerprint),
      ).rejects.toMatchObject({ stage: "post-write-verification" });
      expect(clients.creates).toHaveLength(2);
      expect(clients.mutations).toMatchObject({
        batchCalls: 1,
        commitAttempts: 1,
        commits: 1,
        sets: 0,
        updates: 0,
        deletes: 0,
      });
    },
  );

  it("proves zero-write idempotency with a fresh exact-state approval", async () => {
    const clients = fakeClients();
    const firstPlan = await planWith(clients);
    const firstApply = await applyWith(clients, firstPlan.approvalFingerprint);
    const secondPlan = await planWith(clients);
    expect(secondPlan).toMatchObject({
      existingExactDocuments: 2,
      missingDocuments: 0,
      plannedCreates: 0,
    });
    expect(firstApply.postApplyApprovalFingerprint).toBe(
      secondPlan.approvalFingerprint,
    );
    const beforeSecondApply = structuredClone(clients.mutations);
    const secondApply = await applyWith(
      clients,
      secondPlan.approvalFingerprint,
    );
    expect(secondApply).toMatchObject({
      status: "already-current",
      plannedCreates: 0,
      authorizationDocumentsCreated: 0,
      postApplyPlannedCreates: 0,
    });
    expect(clients.mutations).toEqual(beforeSecondApply);
    expect(clients.creates).toHaveLength(2);
  });
});

describe("Production Staff authorization sanitized command surface", () => {
  const inventoryPath = "C:\\secure\\inventory.json";
  const principalPath = "C:\\secure\\principal.json";
  const fingerprint = `${approvalFingerprintSchema}-${"a".repeat(64)}`;

  it("accepts only offline validation, online plan, and approved apply", () => {
    expect(
      parseCommandArguments([
        "--project",
        productionProjectId,
        "--inventory",
        inventoryPath,
      ]),
    ).toMatchObject({ mode: "validate", projectId: productionProjectId });
    expect(
      parseCommandArguments([
        "--plan",
        "--project",
        productionProjectId,
        "--inventory",
        inventoryPath,
        "--expected-principal",
        principalPath,
      ]),
    ).toMatchObject({ mode: "plan", expectedPrincipalPath: principalPath });
    expect(
      parseCommandArguments([
        "--apply",
        "--project",
        productionProjectId,
        "--inventory",
        inventoryPath,
        "--expected-principal",
        principalPath,
        "--confirm",
        applyConfirmation,
        "--approved-fingerprint",
        fingerprint,
      ]),
    ).toMatchObject({
      mode: "apply",
      confirmation: applyConfirmation,
      approvedFingerprint: fingerprint,
    });
  });

  it.each([
    ["legacy execute", ["--execute"]],
    ["plan and apply", ["--plan", "--apply"]],
    ["unknown option", ["--unknown"]],
    ["duplicate project", ["--project", productionProjectId]],
    ["stray value", ["stray"]],
  ])("rejects %s", (_label, extra) => {
    expect(() =>
      parseCommandArguments([
        "--project",
        productionProjectId,
        "--inventory",
        inventoryPath,
        ...extra,
      ]),
    ).toThrow("command-validation");
  });

  it.each([
    [
      "plan without principal",
      [
        "--plan",
        "--project",
        productionProjectId,
        "--inventory",
        inventoryPath,
      ],
    ],
    [
      "plan with confirmation",
      [
        "--plan",
        "--project",
        productionProjectId,
        "--inventory",
        inventoryPath,
        "--expected-principal",
        principalPath,
        "--confirm",
        applyConfirmation,
      ],
    ],
    [
      "apply without fingerprint",
      [
        "--apply",
        "--project",
        productionProjectId,
        "--inventory",
        inventoryPath,
        "--expected-principal",
        principalPath,
        "--confirm",
        applyConfirmation,
      ],
    ],
    [
      "apply without confirmation",
      [
        "--apply",
        "--project",
        productionProjectId,
        "--inventory",
        inventoryPath,
        "--expected-principal",
        principalPath,
        "--approved-fingerprint",
        fingerprint,
      ],
    ],
  ])("rejects %s", (_label, argumentsList) => {
    expect(() => parseCommandArguments(argumentsList)).toThrow(
      "command-validation",
    );
  });

  it("never logs identifiers, principals, or underlying error details", async () => {
    const output: string[] = [];
    const successClients = fakeClients();
    await runSanitizedWriter(
      {
        projectId: productionProjectId,
        inventory: inventory(),
        mode: "plan",
        expectedPrincipal: principalEmail,
        auth: successClients.auth,
        firestore: successClients.firestore,
      },
      (message: string) => output.push(message),
    );
    const failedClients = fakeClients({ authFailure: true });
    await expect(
      runSanitizedWriter(
        {
          projectId: productionProjectId,
          inventory: inventory(),
          mode: "plan",
          expectedPrincipal: principalEmail,
          auth: failedClients.auth,
          firestore: failedClients.firestore,
        },
        (message: string) => output.push(message),
      ),
    ).rejects.toThrow();
    const principalAPlan = await planWith(fakeClients());
    const mismatchClients = fakeClients();
    await expect(
      runSanitizedWriter(
        {
          projectId: productionProjectId,
          inventory: inventory(),
          mode: "apply",
          confirmation: applyConfirmation,
          approvedFingerprint: principalAPlan.approvalFingerprint,
          expectedPrincipal: alternatePrincipalEmail,
          auth: mismatchClients.auth,
          firestore: mismatchClients.firestore,
        },
        (message: string) => output.push(message),
      ),
    ).rejects.toMatchObject({ stage: "fingerprint-mismatch" });
    expect(mismatchClients.mutations.batchCalls).toBe(0);
    const logs = output.join("\n");
    for (const sensitive of [
      ordinaryUid,
      capableUid,
      ordinaryEmail,
      capableEmail,
      principalEmail,
      alternatePrincipalEmail,
      "sensitive credential failure",
    ])
      expect(logs).not.toContain(sensitive);
    expect(logs).toContain('"identifiersLogged":false');
  });

  it("reports only safe counts when a conflicting document blocks planning", async () => {
    const output: string[] = [];
    const clients = fakeClients({
      initialDocuments: { [ordinaryPath]: { role: "staff" } },
    });
    await expect(
      runSanitizedWriter(
        {
          projectId: productionProjectId,
          inventory: inventory(),
          mode: "plan",
          expectedPrincipal: principalEmail,
          auth: clients.auth,
          firestore: clients.firestore,
        },
        (message: string) => output.push(message),
      ),
    ).rejects.toThrow();
    expect(JSON.parse(output[0])).toEqual({
      status: "failed",
      stage: "authorization-document-conflict",
      existingExactDocuments: 0,
      missingDocuments: 1,
      conflictingDocuments: 1,
      plannedCreates: 0,
      identifiersLogged: false,
    });
  });
});
