import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCustomerRequest } from "./customerOrder";
import {
  hydrateCustomerRequestDocuments,
  splitCustomerRequestForWrite,
  type PersistedCustomerRequestV2,
} from "./customerRequestChunks";
import {
  assertCustomerRequestPolicy,
  customerRequestLimits,
  productSelectedOptionLimits,
} from "./customerRequestPolicy";
import {
  disabledForReview,
  parsePublicCustomerOrderingControl,
} from "./customerOrderingControl";
import {
  assertCustomerProfileSubmissionAvailable,
  assertCustomerSubmissionCooldown,
  clearCustomerSubmissionEnvelope,
  loadCustomerActiveRequestId,
  loadCustomerProfileActiveRequest,
  loadCustomerSubmissionEnvelope,
  markCustomerSubmissionUncertain,
  markCustomerSubmissionSubmitted,
  prepareCustomerSubmissionEnvelope,
  recordCustomerSubmissionAccepted,
  withCustomerSubmissionLock,
} from "./customerSubmissionRetry";
import { defaultProducts } from "./data";
import { evaluateOperationalIndicators } from "./operationalMonitoring";
import { buildPublicProjection } from "./publicProjection";
import type { CartItem, CustomerOrderRequest } from "./types";

const product = defaultProducts.find((entry) => entry.id === "plain-greek")!;

function item(id: string, quantity = 1): CartItem {
  return {
    id,
    productId: product.id,
    productName: product.name,
    basePrice: product.price,
    selectedOptions: [],
    selectedOptionIds: [],
    quantity,
    unitPrice: product.price,
    selectedChannel: "หน้าร้าน",
    priceBreakdown: {
      basePrice: product.price,
      premiumIncludedSurcharge: 0,
      extraToppingCharges: 0,
      unitPrice: product.price,
    },
    lineTotal: product.price * quantity,
    toppingPackaging: "included",
    toppingPackagingLabel: "ใส่ท็อปปิ้งเลย",
    packagingSurchargePerUnit: 0,
    packagingSurchargeTotal: 0,
  };
}

function request(items = [item("line-0")]) {
  return createCustomerRequest(
    "request-wp4",
    "anonymous-owner",
    items,
    defaultProducts,
    {},
  );
}

describe("WP4 balanced request policy and normalized representation", () => {
  it("uses exactly 15 atomic writes at the approved 12-line boundary", () => {
    const value = request(
      Array.from(
        { length: customerRequestLimits.maxProductLines },
        (_, index) => item(`line-${index}`),
      ),
    );
    const parts = splitCustomerRequestForWrite(value);
    expect(parts.itemDocuments.map((entry) => entry.id)).toEqual([
      "00",
      "01",
      "02",
      "03",
      "04",
      "05",
      "06",
      "07",
      "08",
      "09",
      "10",
      "11",
    ]);
    expect(parts.groups.map((entry) => entry.value.lineCount)).toEqual([6, 6]);
    expect(1 + parts.itemDocuments.length + parts.groups.length).toBe(15);
    expect(parts.parent).not.toHaveProperty("items");
  });

  it("hydrates in deterministic order and rejects missing or mismatched child metadata", () => {
    const value = request([item("first"), item("second", 2)]);
    const parts = splitCustomerRequestForWrite(value);
    const parent = {
      ...parts.parent,
      submittedAt: { toMillis: () => Date.now() },
    } as PersistedCustomerRequestV2;
    const reversed = [...parts.itemDocuments].reverse();
    expect(
      hydrateCustomerRequestDocuments(parent, reversed).items.map(
        (entry) => entry.id,
      ),
    ).toEqual(["first", "second"]);
    expect(() =>
      hydrateCustomerRequestDocuments(parent, reversed.slice(1)),
    ).toThrow();
    expect(() =>
      hydrateCustomerRequestDocuments(parent, [
        {
          ...parts.itemDocuments[0],
          value: { ...parts.itemDocuments[0].value, ownerUid: "other" },
        },
        parts.itemDocuments[1],
      ]),
    ).toThrow("ไม่ตรงกับคำขอ");
  });

  it("rejects unknown fields and over-limit values without correction", () => {
    const value = request();
    expect(() =>
      assertCustomerRequestPolicy(
        { ...value, unsupported: true } as CustomerOrderRequest,
        defaultProducts,
      ),
    ).toThrow();
    const excessive = structuredClone(value);
    excessive.items[0].quantity = 11;
    excessive.items[0].lineTotal = excessive.items[0].unitPrice * 11;
    excessive.itemCount = 11;
    excessive.subtotal = excessive.items[0].lineTotal;
    excessive.total = excessive.subtotal;
    expect(() =>
      assertCustomerRequestPolicy(excessive, defaultProducts),
    ).toThrow("1-10");
  });

  it("keeps legacy parent-embedded pending requests valid and unchanged", () => {
    const value = request();
    const { schemaVersion: _schema, retryId: _retry, ...legacy } = value;
    expect(() =>
      assertCustomerRequestPolicy(legacy, defaultProducts, {
        allowLegacyPending: true,
      }),
    ).not.toThrow();
    expect(legacy.items).toEqual(value.items);
  });

  it("projects the stricter product-specific maximum with hard caps", () => {
    const toppingProduct = {
      ...defaultProducts.find((entry) => entry.optionMode === "toppings")!,
      maxSelectedOptions: 4,
    };
    expect(productSelectedOptionLimits(toppingProduct)).toEqual({
      minimum: toppingProduct.includedToppings,
      maximum: 4,
    });
    const projection = buildPublicProjection([toppingProduct], {});
    expect(projection.menu[toppingProduct.id].maxSelectedOptions).toBe(4);
    expect(
      projection.requestPolicy.productLimits[toppingProduct.id].maximum,
    ).toBe(4);
    expect(() =>
      productSelectedOptionLimits({
        ...toppingProduct,
        maxSelectedOptions: 11,
      }),
    ).toThrow();
  });
});

describe("WP4 stable retry envelope", () => {
  beforeEach(() => localStorage.clear());

  it("reuses one stable request ID across uncertainty and retry", () => {
    const first = prepareCustomerSubmissionEnvelope("owner", [item("line")], {
      customerName: "ทดสอบ",
    });
    markCustomerSubmissionUncertain(first);
    const second = prepareCustomerSubmissionEnvelope("owner", [item("line")], {
      customerName: "ทดสอบ",
    });
    expect(second.retryId).toBe(first.retryId);
    expect(loadCustomerSubmissionEnvelope("owner")?.state).toBe("uncertain");
    clearCustomerSubmissionEnvelope("owner");
    expect(loadCustomerSubmissionEnvelope("owner")).toBeNull();
  });

  it("enforces the five-second client cooldown without changing values", () => {
    recordCustomerSubmissionAccepted("owner", 10_000);
    expect(() => assertCustomerSubmissionCooldown("owner", 14_999)).toThrow(
      "5 วินาที",
    );
    expect(() =>
      assertCustomerSubmissionCooldown("owner", 15_000),
    ).not.toThrow();
  });

  it("keeps one active request after cooldown expiry and across a corrupted envelope", () => {
    const first = prepareCustomerSubmissionEnvelope("owner", [item("first")], {
      customerName: "คำขอแรก",
    });
    const secondTab = prepareCustomerSubmissionEnvelope(
      "owner",
      [item("different")],
      { customerName: "คำขอใหม่" },
    );
    expect(secondTab.retryId).toBe(first.retryId);
    markCustomerSubmissionSubmitted(first);
    recordCustomerSubmissionAccepted("owner", 10_000);
    expect(() =>
      assertCustomerSubmissionCooldown("owner", 15_000),
    ).not.toThrow();
    expect(loadCustomerActiveRequestId("owner")).toBe(first.retryId);

    const envelopeStorageKey = Object.keys(localStorage).find((key) =>
      key.startsWith("greek-more-customer-submit-v2:"),
    )!;
    localStorage.setItem(envelopeStorageKey, "{corrupted");
    expect(loadCustomerSubmissionEnvelope("owner")).toBeNull();
    expect(loadCustomerActiveRequestId("owner")).toBe(first.retryId);
    expect(loadCustomerActiveRequestId("different-owner")).toBeNull();

    clearCustomerSubmissionEnvelope("owner", "different-terminal-request");
    expect(loadCustomerActiveRequestId("owner")).toBe(first.retryId);
    clearCustomerSubmissionEnvelope("owner", first.retryId);
    expect(loadCustomerActiveRequestId("owner")).toBeNull();
  });

  it("fails closed when the browser-profile identity changes", () => {
    const first = prepareCustomerSubmissionEnvelope(
      "owner",
      [item("first")],
      {},
    );
    markCustomerSubmissionSubmitted(first);

    expect(loadCustomerProfileActiveRequest("different-owner")).toEqual({
      status: "blocked",
      requestId: first.retryId,
    });
    expect(() =>
      assertCustomerProfileSubmissionAvailable("different-owner"),
    ).toThrow("ไม่สร้างคำขอใหม่");
    clearCustomerSubmissionEnvelope("different-owner");
    expect(loadCustomerActiveRequestId("owner")).toBe(first.retryId);
  });

  it("queues browser-profile submissions behind one shared lock", async () => {
    const requestLock = vi.fn(
      async (_name: string, callback: () => Promise<unknown>) => callback(),
    );
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: { request: requestLock },
    });
    await expect(
      withCustomerSubmissionLock("owner", async () => "completed"),
    ).resolves.toBe("completed");
    expect(requestLock.mock.calls[0][0]).toBe(
      "greek-more-customer-submit:profile-v1",
    );
    expect(requestLock.mock.calls[0]).toHaveLength(2);
    Reflect.deleteProperty(navigator, "locks");
  });
});

describe("WP4 operational controls and balanced indicators", () => {
  const now = Date.parse("2026-07-15T00:00:00.000Z");
  const at = (millis: number) => ({ toMillis: () => millis });
  const pending = (count: number, oldestMinutes = 0) =>
    Array.from({ length: count }, (_, index) => ({
      ...request(),
      id: `request-${index}`,
      ownerUid: `owner-${index}`,
      submittedAt: at(now - (index === 0 ? oldestMinutes : 0) * 60_000),
    }));
  const evaluate = (
    overrides: Partial<
      Parameters<typeof evaluateOperationalIndicators>[0]
    > = {},
  ) =>
    evaluateOperationalIndicators({
      now,
      pending: [],
      latestRequests: [],
      confirmationAttempts: [],
      decisions: [],
      controlHealthy: true,
      projectionHealthy: true,
      disabledSince: null,
      ...overrides,
    });
  const severity = (rows: ReturnType<typeof evaluate>, id: string) =>
    rows.find((entry) => entry.id === id)?.severity;

  it("applies the exact backlog, age, owner, and burst thresholds", () => {
    expect(
      severity(evaluate({ pending: pending(10) }), "pending-backlog"),
    ).toBe("warning");
    expect(
      severity(evaluate({ pending: pending(20) }), "pending-backlog"),
    ).toBe("critical");
    expect(
      severity(evaluate({ pending: pending(1, 16) }), "oldest-pending"),
    ).toBe("warning");
    expect(
      severity(evaluate({ pending: pending(1, 31) }), "oldest-pending"),
    ).toBe("critical");
    const recent = pending(40).map((entry) => ({ ...entry, ownerUid: "same" }));
    expect(
      severity(
        evaluate({ latestRequests: recent.slice(0, 3) }),
        "repeated-owner",
      ),
    ).toBe("warning");
    expect(
      severity(
        evaluate({ latestRequests: recent.slice(0, 5) }),
        "repeated-owner",
      ),
    ).toBe("critical");
    expect(
      severity(
        evaluate({ latestRequests: recent.slice(0, 20) }),
        "intake-burst",
      ),
    ).toBe("warning");
    expect(severity(evaluate({ latestRequests: recent }), "intake-burst")).toBe(
      "critical",
    );
  });

  it("applies mismatch, rejection, integrity, and extended-disable thresholds", () => {
    const attempts = Array.from({ length: 20 }, (_, index) => ({
      eventType: "confirmation_attempt",
      outcome: index < 4 ? "trusted_mismatch" : "confirmed",
      occurredAt: at(now),
    }));
    const decisions = Array.from({ length: 20 }, (_, index) => ({
      eventType: "request_decision",
      outcome: index < 10 ? "rejected" : "confirmed",
      occurredAt: at(now),
    }));
    const rows = evaluate({
      confirmationAttempts: attempts,
      decisions,
      controlHealthy: false,
      projectionHealthy: false,
      disabledSince: now - 31 * 60_000,
    });
    expect(severity(rows, "confirmation-mismatch")).toBe("warning");
    expect(severity(rows, "rejection-rate")).toBe("critical");
    expect(severity(rows, "control-health")).toBe("critical");
    expect(severity(rows, "projection-health")).toBe("critical");
    expect(severity(rows, "extended-disable")).toBe("reminder");
  });

  it("fails closed on malformed public controls and recognizes extended disablement", () => {
    expect(parsePublicCustomerOrderingControl(null).enabled).toBe(false);
    expect(
      parsePublicCustomerOrderingControl({ schemaVersion: 1, enabled: true })
        .status,
    ).toBe("invalid");
    expect(
      parsePublicCustomerOrderingControl({
        schemaVersion: 1,
        enabled: true,
        message: "",
        updatedAt: at(now),
        changeId: "change",
      }).enabled,
    ).toBe(true);
    expect(
      disabledForReview(
        {
          schemaVersion: 1,
          enabled: false,
          message: "",
          reason: "review",
          updatedAt: at(now - 31 * 60_000),
          updatedBy: "staff",
          changeId: "change",
          disabledAt: at(now - 31 * 60_000),
        },
        now,
      ),
    ).toBe(true);
  });
});
