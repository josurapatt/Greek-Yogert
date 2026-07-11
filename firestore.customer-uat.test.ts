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
const request = (ownerUid = "customer-a") => ({
  id: "request-a",
  ownerUid,
  status: "รอร้านยืนยัน",
  channel: "หน้าร้าน",
  items: [{ id: "line-1" }],
  subtotal: 69,
  total: 69,
  itemCount: 1,
  createdAt: "2026-07-11T00:00:00.000Z",
  updatedAt: "2026-07-11T00:00:00.000Z",
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
    projectId: "customer-qr-uat-rules",
    firestore: { rules: readFileSync("firestore.customer-uat.rules", "utf8") },
  });
});
beforeEach(async () => environment.clearFirestore());
afterAll(async () => environment.cleanup());

describe("Customer QR UAT Firestore authorization", () => {
  it("keeps anonymous users out of staff data and allows only valid owned requests", async () => {
    const anonymous = environment
      .authenticatedContext("customer-a", anonymousToken)
      .firestore();
    await assertSucceeds(
      setDoc(doc(anonymous, "customerOrderRequests/request-a"), request()),
    );
    await assertFails(getDoc(doc(anonymous, "users/customer-a")));
    await assertFails(getDocs(collection(anonymous, "customerOrderRequests")));
    await assertFails(getDoc(doc(anonymous, "counters/2026-07-11")));
    await assertFails(
      setDoc(doc(anonymous, "orders/order-a"), { id: "order-a" }),
    );
  });

  it("rejects forged owners and all staff access without an explicit document", async () => {
    const customer = environment
      .authenticatedContext("customer-a", anonymousToken)
      .firestore();
    const emailUser = environment
      .authenticatedContext("email-user", passwordToken)
      .firestore();
    await assertFails(
      setDoc(
        doc(customer, "customerOrderRequests/forged"),
        request("another-user"),
      ),
    );
    await assertFails(getDocs(collection(emailUser, "customerOrderRequests")));
    await assertFails(
      setDoc(doc(emailUser, "publicMenu/menu"), { id: "menu" }),
    );
    await assertFails(
      setDoc(doc(emailUser, "users/email-user"), {
        role: "staff",
        active: true,
      }),
    );
    await assertSucceeds(getDoc(doc(emailUser, "users/email-user")));
  });

  it.each([
    undefined,
    {},
    { role: "owner", active: true },
    { role: "staff", active: false },
  ])(
    "denies incomplete staff authorization documents: %o",
    async (authorization) => {
      if (authorization) await seed({ "users/email-user": authorization });
      const user = environment
        .authenticatedContext("email-user", passwordToken)
        .firestore();
      await assertFails(getDocs(collection(user, "customerOrderRequests")));
    },
  );

  it("authorizes only a staff role with boolean active true and preserves request ownership", async () => {
    await seed({
      "users/staff-user": { role: "staff", active: true },
      "customerOrderRequests/request-a": request(),
      "users/customer-b": { role: "staff", active: true },
    });
    const staff = environment
      .authenticatedContext("staff-user", passwordToken)
      .firestore();
    const customer = environment
      .authenticatedContext("customer-a", anonymousToken)
      .firestore();
    const otherCustomer = environment
      .authenticatedContext("customer-b", anonymousToken)
      .firestore();
    await assertSucceeds(getDocs(collection(staff, "customerOrderRequests")));
    await assertSucceeds(
      setDoc(doc(staff, "orders/order-a"), { id: "order-a" }),
    );
    await assertSucceeds(
      setDoc(doc(staff, "counters/2026-07-11"), { lastSequence: 1 }),
    );
    await assertSucceeds(
      getDoc(doc(customer, "customerOrderRequests/request-a")),
    );
    await assertFails(
      getDoc(doc(otherCustomer, "customerOrderRequests/request-a")),
    );
    await assertFails(getDoc(doc(staff, "users/customer-b")));
  });
});
