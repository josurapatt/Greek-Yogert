import { describe, expect, it, vi } from "vitest";
import {
  parseCommandArguments,
  productionProjectId,
  readExternalInventory,
  runAuthorizationWriter,
  runSanitizedWriter,
  validateInventory,
  validateProjectId,
  validateServiceAccount,
  writeConfirmation,
} from "./productionStaffAuthorizationWriter.mjs";

const ordinaryUid = "ordinary-staff-test-uid";
const capableUid = "capable-staff-test-uid";
const ordinaryEmail = "ordinary.staff@fixture.invalid";
const capableEmail = "capable.staff@fixture.invalid";

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

function fakeClients({
  existing = [] as string[],
  authFailure = false,
  commitFailure = false,
} = {}) {
  const documents = new Map<string, Record<string, unknown>>();
  existing.forEach((path) => documents.set(path, { existing: true }));
  const reads: string[] = [];
  const creates: Array<{ path: string; data: Record<string, unknown> }> = [];
  const auth = {
    getUser: vi.fn(async (uid: string) => {
      if (authFailure) throw new Error("sensitive credential failure");
      if (uid === ordinaryUid) return { disabled: false, email: ordinaryEmail };
      if (uid === capableUid) return { disabled: false, email: capableEmail };
      throw new Error("unexpected test identifier");
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
          return {
            exists: documents.has(path),
            data: () => documents.get(path),
          };
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
        },
      };
    },
  };
  return { auth, firestore, documents, reads, creates };
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
          { ...inventory().staff[0], uid: "<replace-uid>" },
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
    const privateKeyField = ["private", "key"].join("_");
    expect(() =>
      validateServiceAccount({
        type: "service_account",
        project_id: "greek-yogert-customer-uat-2026",
        client_email: "writer@greek-yogert.iam.gserviceaccount.com",
        [privateKeyField]: "not-a-real-key",
      }),
    ).toThrow("credential-validation");
  });

  it("rejects an inventory path inside the repository", () => {
    expect(() => readExternalInventory(process.cwd())).toThrow(
      "inventory-location",
    );
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
  });
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
        "--unknown",
      ]),
    ).toThrow("command-validation");
    expect(() =>
      parseCommandArguments([
        "--project",
        productionProjectId,
        "--inventory",
        "C:\\secure\\inventory.json",
        "unexpected-positional-value",
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
    expect(logs).not.toContain("sensitive credential failure");
  });
});
