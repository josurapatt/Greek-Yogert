import { describe, expect, it } from "vitest";
import { defaultProducts } from "./data";
import { fallbackOptionGroups } from "./optionCatalogue";
import {
  assertPublicProjectionVersionTransition,
  buildPublicProjection,
  diffPublicProjection,
  normalizePublicCustomerRequestPolicy,
  projectionFingerprint,
} from "./publicProjection";

describe("public Customer projection", () => {
  it("whitelists only approved Customer menu fields and emits V3 policy/control", () => {
    const projection = buildPublicProjection(defaultProducts, {
      banana: false,
    });
    const product = projection.menu["size-s"];
    expect(Object.keys(product).sort()).toEqual([
      "active",
      "availableToppingIds",
      "description",
      "emoji",
      "extraNormalPrice",
      "extraPremiumPrice",
      "granolaOptions",
      "id",
      "includedToppings",
      "maxSelectedOptions",
      "name",
      "optionMode",
      "premiumIncludedSurcharge",
      "premiumToppingIds",
      "storefrontPrice",
      "supportsSeparatedToppingPackaging",
    ]);
    expect(product).not.toHaveProperty("channelPrices");
    expect(product).not.toHaveProperty("channelRules");
    expect(product).not.toHaveProperty("price");
    expect(projection.requestPolicy.schemaVersion).toBe(3);
    expect(projection.control).toEqual({
      schemaVersion: 3,
      fingerprint: projection.fingerprint,
      menuIds: Object.keys(projection.menu).sort(),
      optionGroupIds: ["granola-flavour", "toppings"],
    });
    expect(projection.requestPolicy.productLimits["size-s"].groups).toEqual([
      expect.objectContaining({
        groupId: "toppings",
        minimum: 3,
        maximum: 10,
        allowDuplicates: true,
      }),
    ]);
  });

  it("projects active groups without private lifecycle fields", () => {
    const projection = buildPublicProjection(
      defaultProducts,
      {},
      fallbackOptionGroups,
    );
    expect(Object.keys(projection.optionGroups).sort()).toEqual([
      "granola-flavour",
      "toppings",
    ]);
    expect(projection.optionGroups.toppings.choices).toHaveLength(14);
    expect(projection.optionGroups.toppings.choices[0]).not.toHaveProperty(
      "everUsed",
    );
    const withInactive = fallbackOptionGroups.map((group) =>
      group.id === "toppings"
        ? {
            ...group,
            choices: group.choices.map((choice) =>
              choice.id === "banana" ? { ...choice, active: false } : choice,
            ),
          }
        : group,
    );
    expect(
      buildPublicProjection(defaultProducts, {}, withInactive).optionGroups
        .toppings.choices,
    ).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "banana" })]),
    );
  });

  it("has a stable fingerprint independent of source and group order", () => {
    const first = buildPublicProjection(defaultProducts, { banana: false });
    const second = buildPublicProjection(
      [...defaultProducts].reverse(),
      { banana: false },
      [...fallbackOptionGroups].reverse(),
    );
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.fingerprint).not.toBe(
      buildPublicProjection(defaultProducts, { banana: true }).fingerprint,
    );
    expect(projectionFingerprint({ b: 1, a: [2] })).toBe(
      projectionFingerprint({ a: [2], b: 1 }),
    );
    expect(first.fingerprint).toMatch(/^cc3-[a-f0-9]{16}$/);
  });

  it("rejects ambiguous private product identities", () => {
    expect(() =>
      buildPublicProjection(
        [
          defaultProducts[0],
          { ...defaultProducts[1], id: defaultProducts[0].id },
        ],
        {},
      ),
    ).toThrow("duplicate product IDs");
    expect(() =>
      buildPublicProjection([{ ...defaultProducts[0], id: "" }], {}),
    ).toThrow("empty product ID");
  });

  it("reports menu and option-group create/current/update/stale state without mutation", () => {
    const projection = buildPublicProjection(defaultProducts.slice(0, 2), {});
    const current = projection.menu["apple-ohlala"];
    const changed = {
      ...projection.menu["healthy-banana"],
      storefrontPrice: 1,
    };
    const existing = {
      "apple-ohlala": current,
      "healthy-banana": changed,
      stale: { id: "stale" },
    };
    const diff = diffPublicProjection(projection, existing);
    expect(diff.current).toEqual(["apple-ohlala"]);
    expect(diff.update).toEqual(["healthy-banana"]);
    expect(diff.stale).toEqual(["stale"]);
    expect(diff.create).toEqual([]);
    expect(diff.groupsCreate).toEqual(["granola-flavour", "toppings"]);
    const currentGroups = diffPublicProjection(
      projection,
      existing,
      projection.optionGroups,
    );
    expect(currentGroups.groupsCurrent).toEqual([
      "granola-flavour",
      "toppings",
    ]);
    expect(currentGroups.groupsCreate).toEqual([]);
    expect(existing.stale).toEqual({ id: "stale" });
  });

  it("reads V2 and V3 policies but prevents a V3-to-V2 transition", () => {
    expect(
      normalizePublicCustomerRequestPolicy({
        schemaVersion: 2,
        fingerprint: "wp4-legacy",
        productLimits: {},
      }).schemaVersion,
    ).toBe(2);
    expect(
      normalizePublicCustomerRequestPolicy({
        schemaVersion: 3,
        fingerprint: "cc3-current",
        productLimits: {},
      }).schemaVersion,
    ).toBe(3);
    expect(() => assertPublicProjectionVersionTransition(3, 2)).toThrow(
      "cannot be downgraded",
    );
    expect(() => assertPublicProjectionVersionTransition(2, 3)).not.toThrow();
  });
});
