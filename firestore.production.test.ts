import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

let environment: RulesTestEnvironment;
const passwordToken = { firebase: { sign_in_provider: "password" } };
const anonymousToken = { firebase: { sign_in_provider: "anonymous" } };
const waitingForShop = "รอร้านยืนยัน";
const acceptedByShop = "ร้านรับออเดอร์แล้ว";
const rejectedByShop = "ปฏิเสธ";

const item = (id = "line-1", overrides: Record<string, unknown> = {}) => ({
  id,
  productId: "plain-greek",
  productName: "Plain Greek",
  basePrice: 59,
  selectedOptions: [],
  selectedOptionIds: [],
  quantity: 1,
  unitPrice: 59,
  selectedChannel: "หน้าร้าน",
  priceBreakdown: {
    basePrice: 59,
    premiumIncludedSurcharge: 0,
    extraToppingCharges: 0,
    unitPrice: 59,
  },
  lineTotal: 59,
  toppingPackaging: "included",
  toppingPackagingLabel: "ใส่ท็อปปิ้งเลย",
  packagingSurchargePerUnit: 0,
  packagingSurchargeTotal: 0,
  ...overrides,
});

const request = (
  id = "request-a",
  ownerUid = "customer-a",
  overrides: Record<string, unknown> = {},
) => ({
  schemaVersion: 2,
  id,
  retryId: id,
  ownerUid,
  status: waitingForShop,
  channel: "หน้าร้าน",
  customerName: "ลูกค้าทดสอบ",
  customerNote: "",
  items: [item()],
  subtotal: 59,
  total: 59,
  itemCount: 1,
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z",
  submittedAt: serverTimestamp(),
  ...overrides,
});

const storedRequest = (
  id = "request-a",
  ownerUid = "customer-a",
  overrides: Record<string, unknown> = {},
) => ({
  ...request(id, ownerUid, overrides),
  submittedAt: new Date("2026-07-14T00:00:00.000Z"),
});

const order = (overrides: Record<string, unknown> = {}) => ({
  id: "20260714-001",
  queueNumber: "Q001",
  businessDate: "2026-07-14",
  customerName: "ลูกค้าทดสอบ",
  items: [{ id: "line-1" }],
  subtotal: 59,
  discount: 0,
  total: 59,
  status: "pending",
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z",
  ...overrides,
});

const publicProduct = (id = "plain-greek") => ({
  id,
  name: "Plain Greek",
  emoji: "🥣",
  description: [],
  active: true,
  storefrontPrice: 59,
  optionMode: "none",
  includedToppings: 0,
  maxSelectedOptions: 0,
  granolaOptions: [],
  availableToppingIds: [],
  premiumIncludedSurcharge: 0,
  extraNormalPrice: 0,
  extraPremiumPrice: 0,
  supportsSeparatedToppingPackaging: true,
});

const seed = async (data: Record<string, unknown>) =>
  environment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    await Promise.all(
      Object.entries(data).map(([path, value]) =>
        setDoc(doc(database, path), value),
      ),
    );
  });

const seedRuntime = async (enabled = true) =>
  seed({
    "settings/customerOrdering": {
      schemaVersion: 1,
      enabled,
      message: enabled ? "" : "ปิดชั่วคราว",
      reason: "test baseline",
      updatedAt: new Date("2026-07-14T00:00:00.000Z"),
      updatedBy: "seed",
      changeId: "seed-change",
      disabledAt: enabled ? null : new Date("2026-07-14T00:00:00.000Z"),
    },
    "publicSettings/customerOrdering": {
      schemaVersion: 1,
      enabled,
      message: enabled ? "" : "ปิดชั่วคราว",
      updatedAt: new Date("2026-07-14T00:00:00.000Z"),
      changeId: "seed-change",
    },
    "publicSettings/customerRequestPolicy": {
      schemaVersion: 2,
      fingerprint: "wp4-test",
      productLimits: {
        "plain-greek": {
          minimum: 0,
          maximum: 0,
          allowedIds: [],
          allowedLabels: [],
        },
      },
    },
    "publicProjectionControl/current": {
      schemaVersion: 2,
      fingerprint: "wp4-test",
      menuIds: ["plain-greek"],
    },
  });

const normalizedRequestParts = (value: ReturnType<typeof request>) => {
  const { items, submittedAt: _submittedAt, ...fields } = value;
  void _submittedAt;
  const itemDocuments = items.map((entry, index) => ({
    id: String(index).padStart(2, "0"),
    value: {
      schemaVersion: 2,
      requestId: value.id,
      ownerUid: value.ownerUid,
      itemIndex: index,
      item: entry,
      quantity: entry.quantity,
      lineTotal: entry.lineTotal,
    },
  }));
  const groups = [] as Array<{ id: string; value: Record<string, unknown> }>;
  for (let index = 0; index < itemDocuments.length; index += 6) {
    const groupItems = itemDocuments.slice(index, index + 6);
    groups.push({
      id: String(groups.length),
      value: {
        schemaVersion: 2,
        requestId: value.id,
        ownerUid: value.ownerUid,
        groupIndex: groups.length,
        itemIds: groupItems.map((entry) => entry.id),
        lineCount: groupItems.length,
        itemCount: groupItems.reduce(
          (sum, entry) => sum + Number(entry.value.quantity),
          0,
        ),
        subtotal: groupItems.reduce(
          (sum, entry) => sum + Number(entry.value.lineTotal),
          0,
        ),
      },
    });
  }
  const parent = {
    ...fields,
    lineCount: items.length,
    itemIds: itemDocuments.map((entry) => entry.id),
    itemGroupIds: groups.map((entry) => entry.id),
  };
  return { parent, itemDocuments, groups };
};

const writeCustomerRequest = (
  database: Firestore,
  value: ReturnType<typeof request>,
) => {
  const { parent, itemDocuments, groups } = normalizedRequestParts(value);
  const batch = writeBatch(database);
  batch.set(doc(database, "customerOrderRequests", value.id as string), {
    ...parent,
    submittedAt: serverTimestamp(),
  });
  itemDocuments.forEach((entry) =>
    batch.set(
      doc(
        database,
        "customerOrderRequests",
        value.id as string,
        "items",
        entry.id,
      ),
      entry.value,
    ),
  );
  groups.forEach((entry) =>
    batch.set(
      doc(
        database,
        "customerOrderRequests",
        value.id as string,
        "itemGroups",
        entry.id,
      ),
      entry.value,
    ),
  );
  return batch.commit();
};

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: "production-security-rules",
    firestore: { rules: readFileSync("firestore.production.rules", "utf8") },
  });
});
beforeEach(async () => environment.clearFirestore());
afterAll(async () => environment?.cleanup());

describe("WP4 Production-candidate Firestore authorization", () => {
  it("denies unauthenticated access and all anonymous private access", async () => {
    const unauthenticated = environment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(unauthenticated, "publicMenu/plain-greek")));
    await assertFails(writeCustomerRequest(unauthenticated, request("x")));
    const customer = environment
      .authenticatedContext("customer-a", anonymousToken)
      .firestore();
    await assertFails(getDoc(doc(customer, "products/plain-greek")));
    await assertFails(getDoc(doc(customer, "settings/customerOrdering")));
    await assertFails(getDoc(doc(customer, "users/customer-a")));
  });

  it("allows bounded anonymous public reads and an exact owned V2 request", async () => {
    await seedRuntime();
    await seed({
      "publicMenu/plain-greek": publicProduct(),
      "publicSettings/toppingAvailability": { availability: {} },
      "customerOrderRequests/request-a": storedRequest(),
    });
    const customer = environment
      .authenticatedContext("customer-a", anonymousToken)
      .firestore();
    const other = environment
      .authenticatedContext("customer-b", anonymousToken)
      .firestore();
    await assertSucceeds(getDoc(doc(customer, "publicMenu/plain-greek")));
    await assertSucceeds(
      getDocs(query(collection(customer, "publicMenu"), limit(100))),
    );
    await assertFails(getDocs(collection(customer, "publicMenu")));
    await assertSucceeds(
      writeCustomerRequest(customer, request("request-new")),
    );
    await assertSucceeds(
      getDoc(doc(customer, "customerOrderRequests/request-a")),
    );
    await assertFails(
      getDocs(query(collection(customer, "customerOrderRequests"), limit(1))),
    );
    await assertFails(getDoc(doc(other, "customerOrderRequests/request-a")));
  });

  it("fails closed when runtime control is missing, malformed, or disabled", async () => {
    const customer = environment
      .authenticatedContext("customer-a", anonymousToken)
      .firestore();
    await seedRuntime();
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "settings/customerOrdering"), {
        schemaVersion: 1,
        enabled: true,
      });
    });
    await assertFails(writeCustomerRequest(customer, request("a")));
    await environment.clearFirestore();
    await seedRuntime(false);
    await assertFails(writeCustomerRequest(customer, request("b")));
    await environment.clearFirestore();
    await seed({
      "publicSettings/customerRequestPolicy": {
        schemaVersion: 2,
        fingerprint: "wp4-test",
        productLimits: {
          "plain-greek": {
            minimum: 0,
            maximum: 0,
            allowedIds: [],
            allowedLabels: [],
          },
        },
      },
      "publicProjectionControl/current": {
        schemaVersion: 2,
        fingerprint: "wp4-test",
      },
    });
    await assertFails(writeCustomerRequest(customer, request("c")));
  });

  it("makes normalized creation atomic and rejects missing item or summary writes", async () => {
    await seedRuntime();
    const customer = environment
      .authenticatedContext("customer-a", anonymousToken)
      .firestore();
    const value = request("partial");
    const { parent, itemDocuments, groups } = normalizedRequestParts(value);
    const missingItem = writeBatch(customer);
    missingItem.set(doc(customer, "customerOrderRequests/partial"), {
      ...parent,
      submittedAt: serverTimestamp(),
    });
    groups.forEach((entry) =>
      missingItem.set(
        doc(customer, `customerOrderRequests/partial/itemGroups/${entry.id}`),
        entry.value,
      ),
    );
    await assertFails(missingItem.commit());

    const missingSummary = writeBatch(customer);
    missingSummary.set(doc(customer, "customerOrderRequests/partial"), {
      ...parent,
      submittedAt: serverTimestamp(),
    });
    itemDocuments.forEach((entry) =>
      missingSummary.set(
        doc(customer, `customerOrderRequests/partial/items/${entry.id}`),
        entry.value,
      ),
    );
    await assertFails(missingSummary.commit());
    await environment.withSecurityRulesDisabled(async (context) => {
      const snapshot = await getDoc(
        doc(context.firestore(), "customerOrderRequests/partial"),
      );
      expect(snapshot.exists()).toBe(false);
    });
  });

  it("allows exact owned child gets but denies enumeration, cross-owner access, and mutation", async () => {
    await seedRuntime();
    await seed({ "users/staff": { role: "staff", active: true } });
    const customer = environment
      .authenticatedContext("customer-a", anonymousToken)
      .firestore();
    const other = environment
      .authenticatedContext("customer-b", anonymousToken)
      .firestore();
    const staff = environment
      .authenticatedContext("staff", passwordToken)
      .firestore();
    await assertSucceeds(writeCustomerRequest(customer, request("owned")));
    const itemRef = doc(customer, "customerOrderRequests/owned/items/00");
    await assertSucceeds(getDoc(itemRef));
    await assertFails(
      getDocs(
        query(
          collection(customer, "customerOrderRequests/owned/items"),
          limit(12),
        ),
      ),
    );
    await assertFails(
      getDoc(doc(other, "customerOrderRequests/owned/items/00")),
    );
    await assertFails(setDoc(itemRef, { changed: true }));
    await assertFails(deleteDoc(itemRef));
    await assertFails(
      setDoc(doc(customer, "customerOrderRequests/owned"), { changed: true }),
    );
    await assertFails(deleteDoc(doc(customer, "customerOrderRequests/owned")));
    await assertSucceeds(
      getDocs(
        query(
          collection(staff, "customerOrderRequests/owned/items"),
          limit(12),
        ),
      ),
    );
  });

  it("keeps owned status reads and Staff processing available while disabled", async () => {
    await seedRuntime(false);
    await seed({
      "users/staff": { role: "staff", active: true },
      "customerOrderRequests/request-a": storedRequest(),
    });
    const customer = environment
      .authenticatedContext("customer-a", anonymousToken)
      .firestore();
    const staff = environment
      .authenticatedContext("staff", passwordToken)
      .firestore();
    await assertSucceeds(
      getDoc(doc(customer, "customerOrderRequests/request-a")),
    );
    await assertSucceeds(
      setDoc(doc(staff, "customerOrderRequests/request-a"), {
        ...storedRequest(),
        status: rejectedByShop,
        rejectionReason: "ทดสอบ",
        rejectedAt: "2026-07-14T00:01:00.000Z",
        updatedAt: "2026-07-14T00:01:00.000Z",
      }),
    );
    await assertSucceeds(setDoc(doc(staff, "orders/20260714-001"), order()));
  });

  it.each([
    ["unknown top-level field", { unsupported: true }],
    ["wrong schema", { schemaVersion: 1 }],
    ["retry mismatch", { retryId: "other" }],
    ["fractional count", { itemCount: 1.5 }],
    ["negative total", { total: -1 }],
    ["over total", { total: 5001, subtotal: 5001 }],
  ])("rejects %s", async (_label, overrides) => {
    await seedRuntime();
    const customer = environment
      .authenticatedContext("customer-a", anonymousToken)
      .firestore();
    await assertFails(
      writeCustomerRequest(
        customer,
        request("request-a", "customer-a", overrides),
      ),
    );
  });

  it("enforces 12 lines, 10 per line, and 30 total units", async () => {
    await seedRuntime();
    const customer = environment
      .authenticatedContext("customer-a", anonymousToken)
      .firestore();
    const twelve = Array.from({ length: 12 }, (_, index) =>
      item(`line-${index}`),
    );
    await assertSucceeds(
      writeCustomerRequest(
        customer,
        request("twelve", "customer-a", {
          items: twelve,
          itemCount: 12,
          subtotal: 708,
          total: 708,
        }),
      ),
    );
    const thirteen = [...twelve, item("line-13")];
    await assertFails(
      writeCustomerRequest(
        customer,
        request("thirteen", "customer-a", {
          items: thirteen,
          itemCount: 13,
          subtotal: 767,
          total: 767,
        }),
      ),
    );
    await assertSucceeds(
      writeCustomerRequest(
        customer,
        request("ten", "customer-a", {
          items: [item("line", { quantity: 10, lineTotal: 590 })],
          itemCount: 10,
          subtotal: 590,
          total: 590,
        }),
      ),
    );
    await assertFails(
      writeCustomerRequest(
        customer,
        request("eleven", "customer-a", {
          items: [item("line", { quantity: 11, lineTotal: 649 })],
          itemCount: 11,
          subtotal: 649,
          total: 649,
        }),
      ),
    );
    await assertFails(
      writeCustomerRequest(
        customer,
        request("thirty-one", "customer-a", {
          items: [
            item("a", { quantity: 10, lineTotal: 590 }),
            item("b", { quantity: 10, lineTotal: 590 }),
            item("c", { quantity: 10, lineTotal: 590 }),
            item("d", { quantity: 1 }),
          ],
          itemCount: 31,
          subtotal: 1829,
          total: 1829,
        }),
      ),
    );
  });

  it("rejects nested unknown fields, fractional money, oversized options, and forged product limits", async () => {
    await seedRuntime();
    const customer = environment
      .authenticatedContext("customer-a", anonymousToken)
      .firestore();
    const probes = [
      item("a", { unknown: true }),
      item("a", { unitPrice: 59.5, lineTotal: 59.5 }),
      item("a", {
        selectedOptionIds: Array(11).fill("x"),
        selectedOptions: Array(11).fill("x"),
      }),
      item("a", { selectedOptionIds: ["x"], selectedOptions: ["x"] }),
    ];
    for (const [index, probe] of probes.entries())
      await assertFails(
        writeCustomerRequest(
          customer,
          request(`probe-${index}`, "customer-a", { items: [probe] }),
        ),
      );
  });

  it("rejects forged ownership and all customer-controlled Staff writes", async () => {
    await seedRuntime();
    const customer = environment
      .authenticatedContext("customer-a", anonymousToken)
      .firestore();
    await assertFails(
      writeCustomerRequest(customer, request("forged", "customer-b")),
    );
    await assertFails(setDoc(doc(customer, "orders/x"), order({ id: "x" })));
    await assertFails(
      setDoc(doc(customer, "users/customer-a"), {
        role: "staff",
        active: true,
      }),
    );
    await assertFails(
      setDoc(doc(customer, "publicSettings/customerOrdering"), {
        enabled: true,
      }),
    );
  });

  it("requires exact Staff authorization and bounded list queries", async () => {
    await seed({
      "users/staff": { role: "staff", active: true },
      "users/inactive": { role: "staff", active: false },
    });
    const staff = environment
      .authenticatedContext("staff", passwordToken)
      .firestore();
    const inactive = environment
      .authenticatedContext("inactive", passwordToken)
      .firestore();
    await assertSucceeds(
      getDocs(query(collection(staff, "orders"), limit(250))),
    );
    await assertFails(getDocs(collection(staff, "orders")));
    await assertFails(getDocs(query(collection(staff, "orders"), limit(251))));
    await assertFails(getDocs(query(collection(inactive, "orders"), limit(1))));
    await assertFails(
      setDoc(doc(staff, "users/staff"), { role: "staff", active: false }),
    );
  });

  it("allows exact public product writes but rejects private projection fields", async () => {
    await seed({ "users/staff": { role: "staff", active: true } });
    const staff = environment
      .authenticatedContext("staff", passwordToken)
      .firestore();
    await assertSucceeds(
      setDoc(doc(staff, "publicMenu/plain-greek"), publicProduct()),
    );
    await assertFails(
      setDoc(doc(staff, "publicMenu/plain-greek"), {
        ...publicProduct(),
        channelPrices: { Lineman: 99 },
      }),
    );
  });

  it("requires request-policy and projection-control fingerprints to change atomically", async () => {
    await seedRuntime();
    await seed({ "users/staff": { role: "staff", active: true } });
    const staff = environment
      .authenticatedContext("staff", passwordToken)
      .firestore();
    const batch = writeBatch(staff);
    batch.set(doc(staff, "publicSettings/customerRequestPolicy"), {
      schemaVersion: 2,
      fingerprint: "wp4-next",
      productLimits: {
        "plain-greek": {
          minimum: 0,
          maximum: 0,
          allowedIds: [],
          allowedLabels: [],
        },
      },
    });
    batch.set(doc(staff, "publicProjectionControl/current"), {
      schemaVersion: 2,
      fingerprint: "wp4-next",
      menuIds: ["plain-greek"],
    });
    await assertSucceeds(batch.commit());
    await assertFails(
      setDoc(doc(staff, "publicSettings/customerRequestPolicy"), {
        schemaVersion: 2,
        fingerprint: "wp4-standalone",
        productLimits: {},
      }),
    );
  });

  it("preserves Staff order validation and immutable request snapshots", async () => {
    await seed({
      "users/staff": { role: "staff", active: true },
      "customerOrderRequests/request-a": storedRequest(),
    });
    const staff = environment
      .authenticatedContext("staff", passwordToken)
      .firestore();
    await assertSucceeds(setDoc(doc(staff, "orders/20260714-001"), order()));
    await assertFails(
      setDoc(
        doc(staff, "orders/invalid"),
        order({ id: "invalid", items: [], total: -1 }),
      ),
    );
    await assertSucceeds(
      setDoc(doc(staff, "customerOrderRequests/request-a"), {
        ...storedRequest(),
        status: acceptedByShop,
        confirmedOrderId: "20260714-001",
        queueNumber: "Q001",
        paymentMethod: "สด",
        paymentMethods: ["สด"],
        linePaymentMethods: { "line-1": "สด" },
        confirmedAt: "2026-07-14T00:01:00.000Z",
        updatedAt: "2026-07-14T00:01:00.000Z",
      }),
    );
    await seed({ "customerOrderRequests/request-a": storedRequest() });
    await assertFails(
      setDoc(doc(staff, "customerOrderRequests/request-a"), {
        ...storedRequest(),
        customerName: "เปลี่ยน",
        status: rejectedByShop,
        rejectedAt: "2026-07-14T00:01:00.000Z",
        updatedAt: "2026-07-14T00:01:00.000Z",
      }),
    );
  });

  it("allows any active Staff to atomically disable and denies public-only changes", async () => {
    await seedRuntime(true);
    await seed({ "users/staff": { role: "staff", active: true } });
    const staff = environment
      .authenticatedContext("staff", passwordToken)
      .firestore();
    const changeId = "disable-change";
    const batch = writeBatch(staff);
    batch.set(doc(staff, "settings/customerOrdering"), {
      schemaVersion: 1,
      enabled: false,
      message: "ปิดชั่วคราว",
      reason: "เหตุฉุกเฉิน",
      updatedAt: serverTimestamp(),
      updatedBy: "staff",
      changeId,
      disabledAt: serverTimestamp(),
    });
    batch.set(doc(staff, "publicSettings/customerOrdering"), {
      schemaVersion: 1,
      enabled: false,
      message: "ปิดชั่วคราว",
      updatedAt: serverTimestamp(),
      changeId,
    });
    batch.set(doc(staff, `customerOrderingAuditEvents/${changeId}`), {
      eventType: "control_change",
      controlSchemaVersion: 1,
      previousState: "enabled",
      newState: "disabled",
      actorUid: "staff",
      reason: "เหตุฉุกเฉิน",
      occurredAt: serverTimestamp(),
      changeId,
    });
    await assertSucceeds(batch.commit());
    await assertFails(
      setDoc(doc(staff, "publicSettings/customerOrdering"), {
        schemaVersion: 1,
        enabled: true,
        message: "",
        updatedAt: serverTimestamp(),
        changeId: "public-only",
      }),
    );
  });

  it("requires the server-controlled capability to re-enable", async () => {
    await seedRuntime(false);
    await seed({
      "users/staff": { role: "staff", active: true },
      "users/capable": {
        role: "staff",
        active: true,
        canManageCustomerOrdering: true,
      },
    });
    const applyEnable = (uid: string) => {
      const database = environment
        .authenticatedContext(uid, passwordToken)
        .firestore();
      const changeId = `enable-${uid}`;
      const batch = writeBatch(database);
      batch.set(doc(database, "settings/customerOrdering"), {
        schemaVersion: 1,
        enabled: true,
        message: "",
        reason: "ตรวจสอบแล้ว",
        updatedAt: serverTimestamp(),
        updatedBy: uid,
        changeId,
        disabledAt: null,
      });
      batch.set(doc(database, "publicSettings/customerOrdering"), {
        schemaVersion: 1,
        enabled: true,
        message: "",
        updatedAt: serverTimestamp(),
        changeId,
      });
      batch.set(doc(database, `customerOrderingAuditEvents/${changeId}`), {
        eventType: "control_change",
        controlSchemaVersion: 1,
        previousState: "disabled",
        newState: "enabled",
        actorUid: uid,
        reason: "ตรวจสอบแล้ว",
        occurredAt: serverTimestamp(),
        changeId,
      });
      return batch.commit();
    };
    await assertFails(applyEnable("staff"));
    await assertSucceeds(applyEnable("capable"));
  });
});
