import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";

let environment: RulesTestEnvironment;
const passwordToken = { firebase: { sign_in_provider: "password" } };
const anonymousToken = { firebase: { sign_in_provider: "anonymous" } };
const waitingForShop = "รอร้านยืนยัน";
const acceptedByShop = "ร้านรับออเดอร์แล้ว";
const rejectedByShop = "ปฏิเสธ";

const request = (ownerUid = "customer-a") => ({
  id: "request-a",
  ownerUid,
  status: waitingForShop,
  channel: "หน้าร้าน",
  customerName: "ลูกค้าทดสอบ",
  customerNote: "",
  items: [{ id: "line-1", quantity: 1 }],
  subtotal: 69,
  total: 69,
  itemCount: 1,
  createdAt: "2026-07-13T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z",
});

const order = (overrides: Record<string, unknown> = {}) => ({
  id: "20260713-001",
  queueNumber: "Q001",
  businessDate: "2026-07-13",
  customerName: "ลูกค้าทดสอบ",
  items: [{ id: "line-1" }],
  subtotal: 69,
  discount: 0,
  total: 69,
  status: "pending",
  createdAt: "2026-07-13T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z",
  ...overrides,
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

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: "production-security-rules",
    firestore: { rules: readFileSync("firestore.production.rules", "utf8") },
  });
});
beforeEach(async () => environment.clearFirestore());
afterAll(async () => environment.cleanup());

describe("Production candidate Firestore authorization", () => {
  it("denies unauthenticated access, including public data", async () => {
    const unauthenticated = environment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(unauthenticated, "publicMenu/plain-greek")));
    await assertFails(getDoc(doc(unauthenticated, "products/plain-greek")));
    await assertFails(
      setDoc(doc(unauthenticated, "customerOrderRequests/request-a"), request()),
    );
  });

  it("allows anonymous public reads and only an owned customer request", async () => {
    await seed({
      "publicMenu/plain-greek": { id: "plain-greek", active: true },
      "publicSettings/toppingAvailability": { availability: {} },
      "customerOrderRequests/request-a": request(),
    });
    const customer = environment
      .authenticatedContext("customer-a", anonymousToken)
      .firestore();
    const otherCustomer = environment
      .authenticatedContext("customer-b", anonymousToken)
      .firestore();

    await assertSucceeds(getDoc(doc(customer, "publicMenu/plain-greek")));
    await assertSucceeds(
      getDoc(doc(customer, "publicSettings/toppingAvailability")),
    );
    await assertSucceeds(
      setDoc(doc(customer, "customerOrderRequests/request-new"), {
        ...request(),
        id: "request-new",
      }),
    );
    await assertSucceeds(
      getDoc(doc(customer, "customerOrderRequests/request-a")),
    );
    await assertFails(getDocs(collection(customer, "customerOrderRequests")));
    await assertFails(
      getDoc(doc(otherCustomer, "customerOrderRequests/request-a")),
    );
  });

  it("rejects anonymous writes, forged ownership, and customer controlled staff fields", async () => {
    const customer = environment
      .authenticatedContext("customer-a", anonymousToken)
      .firestore();
    await assertFails(
      setDoc(doc(customer, "customerOrderRequests/forged"), {
        ...request("customer-b"),
        id: "forged",
      }),
    );
    await assertFails(
      setDoc(doc(customer, "customerOrderRequests/request-a"), {
        ...request(),
        paymentMethod: "สด",
      }),
    );
    await assertFails(
      setDoc(doc(customer, "publicMenu/plain-greek"), { active: false }),
    );
    await assertFails(
      setDoc(doc(customer, "products/plain-greek"), { active: false }),
    );
    await assertFails(setDoc(doc(customer, "orders/order-a"), order()));
    await assertFails(
      setDoc(doc(customer, "counters/2026-07-13"), { lastSequence: 1 }),
    );
    await assertFails(
      setDoc(doc(customer, "users/customer-a"), {
        role: "staff",
        active: true,
      }),
    );
  });

  it("denies all private Staff access to non-Staff email accounts", async () => {
    const emailUser = environment
      .authenticatedContext("email-user", passwordToken)
      .firestore();
    await assertSucceeds(getDoc(doc(emailUser, "users/email-user")));
    await assertFails(getDocs(collection(emailUser, "products")));
    await assertFails(getDocs(collection(emailUser, "orders")));
    await assertFails(getDoc(doc(emailUser, "settings/toppingAvailability")));
    await assertFails(getDocs(collection(emailUser, "customerOrderRequests")));
    await assertFails(
      setDoc(doc(emailUser, "publicMenu/plain-greek"), { active: true }),
    );
    await assertFails(
      setDoc(doc(emailUser, "users/email-user"), {
        role: "staff",
        active: true,
      }),
    );
  });

  it.each([
    undefined,
    {},
    { role: "owner", active: true },
    { role: "staff", active: false },
    { role: "staff", active: "true" },
  ])("denies incomplete Staff authorization: %o", async (authorization) => {
    if (authorization) await seed({ "users/email-user": authorization });
    const emailUser = environment
      .authenticatedContext("email-user", passwordToken)
      .firestore();
    await assertFails(getDocs(collection(emailUser, "customerOrderRequests")));
  });

  it("allows only exact active Staff authorization and protects other user documents", async () => {
    await seed({
      "users/staff-user": { role: "staff", active: true },
      "users/customer-b": { role: "staff", active: true },
      "customerOrderRequests/request-a": request(),
    });
    const staff = environment
      .authenticatedContext("staff-user", passwordToken)
      .firestore();
    await assertSucceeds(getDocs(collection(staff, "products")));
    await assertSucceeds(getDocs(collection(staff, "orders")));
    await assertSucceeds(getDoc(doc(staff, "settings/toppingAvailability")));
    await assertSucceeds(getDocs(collection(staff, "customerOrderRequests")));
    await assertSucceeds(
      setDoc(doc(staff, "publicMenu/plain-greek"), { active: true }),
    );
    await assertFails(getDoc(doc(staff, "users/customer-b")));
    await assertFails(getDocs(collection(staff, "users")));
    await assertFails(
      setDoc(doc(staff, "users/staff-user"), { role: "staff", active: false }),
    );
  });

  it("preserves detailed Staff order validation", async () => {
    await seed({ "users/staff-user": { role: "staff", active: true } });
    const staff = environment
      .authenticatedContext("staff-user", passwordToken)
      .firestore();
    await assertSucceeds(setDoc(doc(staff, "orders/20260713-001"), order()));
    await assertFails(
      setDoc(
        doc(staff, "orders/20260713-invalid"),
        order({ id: "20260713-invalid", items: [], total: -1 }),
      ),
    );
  });

  it("permits only the Staff confirmation transition and keeps the request snapshot immutable", async () => {
    const current = request();
    await seed({
      "users/staff-user": { role: "staff", active: true },
      "customerOrderRequests/request-a": current,
    });
    const staff = environment
      .authenticatedContext("staff-user", passwordToken)
      .firestore();
    await assertSucceeds(
      setDoc(doc(staff, "customerOrderRequests/request-a"), {
        ...current,
        status: acceptedByShop,
        confirmedOrderId: "20260713-001",
        queueNumber: "Q001",
        paymentMethod: "สด",
        paymentMethods: ["สด"],
        linePaymentMethods: { "line-1": "สด" },
        confirmedAt: "2026-07-13T00:01:00.000Z",
        updatedAt: "2026-07-13T00:01:00.000Z",
      }),
    );

    await seed({ "customerOrderRequests/request-a": current });
    await assertFails(
      setDoc(doc(staff, "customerOrderRequests/request-a"), {
        ...current,
        customerName: "เปลี่ยนข้อมูลลูกค้า",
        status: acceptedByShop,
        confirmedOrderId: "20260713-001",
        queueNumber: "Q001",
        paymentMethod: "สด",
        paymentMethods: ["สด"],
        linePaymentMethods: { "line-1": "สด" },
        confirmedAt: "2026-07-13T00:01:00.000Z",
        updatedAt: "2026-07-13T00:01:00.000Z",
      }),
    );
  });

  it("permits only the Staff rejection transition from a pending request", async () => {
    const current = request();
    await seed({
      "users/staff-user": { role: "staff", active: true },
      "customerOrderRequests/request-a": current,
    });
    const staff = environment
      .authenticatedContext("staff-user", passwordToken)
      .firestore();
    await assertSucceeds(
      setDoc(doc(staff, "customerOrderRequests/request-a"), {
        ...current,
        status: rejectedByShop,
        rejectionReason: "สินค้าไม่พร้อม",
        rejectedAt: "2026-07-13T00:01:00.000Z",
        updatedAt: "2026-07-13T00:01:00.000Z",
      }),
    );

    await seed({
      "customerOrderRequests/request-a": {
        ...current,
        status: acceptedByShop,
      },
    });
    await assertFails(
      setDoc(doc(staff, "customerOrderRequests/request-a"), {
        ...current,
        status: rejectedByShop,
        rejectedAt: "2026-07-13T00:01:00.000Z",
        updatedAt: "2026-07-13T00:01:00.000Z",
      }),
    );
  });
});
