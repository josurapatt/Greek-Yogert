import { describe, expect, it } from "vitest";
import {
  isAutomatedUatRecord,
  timestampMillis,
  validateExactHumanUatChain,
} from "./appCheckHumanUatCleanupPolicy.mjs";

const exactChain = {
  requestId: "human-request",
  request: {
    id: "human-request",
    retryId: "human-request",
    customerName: "Human UAT",
    ownerUid: "anonymous-customer",
    submittedAt: "2026-07-17T08:15:00.000Z",
    confirmedOrderId: "20260717-008",
    queueNumber: "Q008",
    itemIds: ["00"],
    itemGroupIds: ["0"],
  },
  orderId: "20260717-008",
  order: {
    id: "20260717-008",
    customerName: "Human UAT",
    queueNumber: "Q008",
  },
  submittedAfterMillis: Date.parse("2026-07-17T08:08:06.000Z"),
  itemIds: ["00"],
  groupIds: ["0"],
  itemDocuments: [
    { requestId: "human-request", ownerUid: "anonymous-customer" },
  ],
  groupDocuments: [
    { requestId: "human-request", ownerUid: "anonymous-customer" },
  ],
  designatedStaffUids: ["capable", "ordinary"],
  ownerIsAnonymous: true,
  ownerAuthorizationExists: false,
};

describe("App Check Human-UAT cleanup policy", () => {
  it("accepts only a complete exact anonymous request-to-Order chain", () => {
    expect(validateExactHumanUatChain(exactChain)).toMatchObject({
      valid: true,
      errors: [],
    });
  });

  it("rejects automated records and mismatched normalized children", () => {
    const result = validateExactHumanUatChain({
      ...exactChain,
      requestId: "APP-CHECK-AUTO-123",
      request: {
        ...exactChain.request,
        id: "APP-CHECK-AUTO-123",
        retryId: "APP-CHECK-AUTO-123",
      },
      itemDocuments: [
        { requestId: "another-request", ownerUid: "anonymous-customer" },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "automated UAT records cannot use the Human-UAT cleanup path",
    );
    expect(result.errors).toContain(
      "normalized child ownership is inconsistent",
    );
  });

  it("normalizes supported timestamps and recognizes automated markers", () => {
    expect(timestampMillis("2026-07-17T08:15:00.000Z")).toBe(
      Date.parse("2026-07-17T08:15:00.000Z"),
    );
    expect(timestampMillis({ toMillis: () => 123 })).toBe(123);
    expect(
      isAutomatedUatRecord("request", { customerNote: "isolated browser UAT" }),
    ).toBe(true);
  });
});
