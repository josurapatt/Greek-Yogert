import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";

const projectId = "catalogue-storage-rules";
const bucket = `gs://${projectId}.appspot.com`;
const passwordToken = { firebase: { sign_in_provider: "password" } };
const anonymousToken = { firebase: { sign_in_provider: "anonymous" } };
const publishedPath = "product-images/plain-greek/published.jpg";

let environment: RulesTestEnvironment;

function imageBytes(size = 1) {
  return new Uint8Array(size);
}

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync("firestore.production.rules", "utf8"),
    },
    storage: {
      rules: readFileSync("storage.rules", "utf8"),
    },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.clearStorage();
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await Promise.all([
      setDoc(doc(firestore, "users/staff"), {
        role: "staff",
        active: true,
      }),
      setDoc(doc(firestore, "users/inactive"), {
        role: "staff",
        active: false,
      }),
      setDoc(doc(firestore, "publicMenu/plain-greek"), {
        imagePath: publishedPath,
      }),
    ]);
    await context
      .storage(bucket)
      .ref(publishedPath)
      .put(imageBytes(), { contentType: "image/jpeg" });
  });
});

afterAll(async () => environment.cleanup());

describe("product image Storage Rules", () => {
  it("allows active Staff to write the allowlisted path and accepted MIME types", async () => {
    const storage = environment
      .authenticatedContext("staff", passwordToken)
      .storage(bucket);

    await assertSucceeds(
      storage
        .ref("product-images/plain-greek/staff.jpg")
        .put(imageBytes(), { contentType: "image/jpeg" }),
    );
    await assertSucceeds(
      storage
        .ref("product-images/plain-greek/staff.png")
        .put(imageBytes(), { contentType: "image/png" }),
    );
    await assertSucceeds(
      storage
        .ref("product-images/plain-greek/staff.webp")
        .put(imageBytes(), { contentType: "image/webp" }),
    );
    await assertSucceeds(
      storage.ref("product-images/plain-greek/staff.webp").delete(),
    );
  });

  it("denies unauthorized, inactive, malformed, oversized, and unsupported writes", async () => {
    const anonymous = environment
      .authenticatedContext("customer", anonymousToken)
      .storage(bucket);
    const unauthorized = environment
      .authenticatedContext("outsider", passwordToken)
      .storage(bucket);
    const inactive = environment
      .authenticatedContext("inactive", passwordToken)
      .storage(bucket);
    const staff = environment
      .authenticatedContext("staff", passwordToken)
      .storage(bucket);

    await assertFails(
      anonymous
        .ref("product-images/plain-greek/customer.jpg")
        .put(imageBytes(), { contentType: "image/jpeg" }),
    );
    await assertFails(
      unauthorized
        .ref("product-images/plain-greek/outsider.jpg")
        .put(imageBytes(), { contentType: "image/jpeg" }),
    );
    await assertFails(
      inactive
        .ref("product-images/plain-greek/inactive.jpg")
        .put(imageBytes(), { contentType: "image/jpeg" }),
    );
    await assertFails(
      staff
        .ref("other/plain-greek.jpg")
        .put(imageBytes(), { contentType: "image/jpeg" }),
    );
    await assertFails(
      staff
        .ref("product-images/plain-greek/unsupported.gif")
        .put(imageBytes(), { contentType: "image/gif" }),
    );
    await assertFails(
      staff
        .ref("product-images/plain-greek/oversized.jpg")
        .put(imageBytes(5 * 1024 * 1024 + 1), {
          contentType: "image/jpeg",
        }),
    );
  });

  it("allows only authenticated reads of the exact published image path", async () => {
    const anonymous = environment
      .authenticatedContext("customer", anonymousToken)
      .storage(bucket);
    const staff = environment
      .authenticatedContext("staff", passwordToken)
      .storage(bucket);
    const unauthenticated = environment
      .unauthenticatedContext()
      .storage(bucket);

    await assertSucceeds(anonymous.ref(publishedPath).getMetadata());
    await assertSucceeds(staff.ref(publishedPath).getMetadata());
    await assertFails(unauthenticated.ref(publishedPath).getMetadata());
    await assertFails(
      anonymous
        .ref("product-images/plain-greek/not-published.jpg")
        .getMetadata(),
    );
    expect(publishedPath).toContain("plain-greek");
  });
});
