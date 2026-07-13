import { describe, expect, it } from "vitest";
import { defaultProducts } from "./data";
import {
  buildPublicProjection,
  diffPublicProjection,
  projectionFingerprint,
} from "./publicProjection";

describe("public Customer projection", () => {
  it("whitelists only approved Customer menu fields", () => {
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
  });

  it("has a stable fingerprint independent of source order", () => {
    const first = buildPublicProjection(defaultProducts, { banana: false });
    const second = buildPublicProjection([...defaultProducts].reverse(), {
      banana: false,
    });
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.fingerprint).not.toBe(
      buildPublicProjection(defaultProducts, { banana: true }).fingerprint,
    );
    expect(projectionFingerprint({ b: 1, a: [2] })).toBe(
      projectionFingerprint({ a: [2], b: 1 }),
    );
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

  it("reports create, current, update, and stale public IDs without mutation", () => {
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
    expect(existing.stale).toEqual({ id: "stale" });
  });
});
