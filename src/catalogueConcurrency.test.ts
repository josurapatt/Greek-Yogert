import { describe, expect, it } from "vitest";
import {
  assertCatalogueControlUnchanged,
  catalogueControlVersion,
  prepareOptionGroupSave,
} from "./catalogueAdmin";
import {
  normalizePrivateOptionChoiceDocument,
  normalizePrivateOptionGroupDocument,
  serializePrivateOptionChoice,
  serializePrivateOptionGroup,
} from "./optionCataloguePersistence";
import { fallbackOptionGroups } from "./optionCatalogue";
import type { OptionChoice, OptionGroup } from "./types";

const choice = (id: string, displayOrder: number): OptionChoice => ({
  id,
  name: id === "choice-uat-2" ? "ทดสอบ UAT 2" : `ตัวเลือก ${displayOrder}`,
  active: true,
  displayOrder,
  classification: "normal",
  surcharge: 0,
  everUsed: false,
});

const group = (choices: OptionChoice[]): OptionGroup => ({
  id: "group-uat-2",
  displayName: "ทดสอบ UAT 2",
  active: true,
  displayOrder: 90,
  required: false,
  minSelections: 0,
  maxSelections: Math.min(choices.length, 2),
  allowDuplicates: false,
  pricingMode: "choice-surcharge",
  choices,
});

function roundTrip(value: OptionGroup): OptionGroup {
  return normalizePrivateOptionGroupDocument(
    value.id,
    serializePrivateOptionGroup(value),
    value.choices.map((entry) =>
      normalizePrivateOptionChoiceDocument(
        entry.id,
        serializePrivateOptionChoice(entry),
      ),
    ),
  );
}

describe("Catalogue save concurrency", () => {
  it.each([
    ["one Choice", [choice("choice-uat-2", 1)]],
    [
      "multiple Choices",
      [choice("choice-first", 1), choice("choice-second", 2)],
    ],
  ])(
    "allows the first save with %s to repair a stale but unchanged projection",
    (_label, choices) => {
      const staleControl = {
        schemaVersion: 2,
        fingerprint: "cc2-stale-but-unchanged",
        menuIds: ["legacy-product"],
      };
      const baseline = catalogueControlVersion(true, staleControl);

      expect(() =>
        assertCatalogueControlUnchanged(baseline, true, staleControl),
      ).not.toThrow();

      const prepared = prepareOptionGroupSave({
        next: group(choices),
        catalogue: fallbackOptionGroups,
        products: [],
      });
      expect(roundTrip(prepared.group)).toEqual(prepared.group);
    },
  );

  it.each([
    ["group metadata", "cc3-metadata-writer"],
    ["Choice content", "cc3-choice-writer"],
  ])("rejects a real concurrent %s update", (_label, concurrentFingerprint) => {
    const baseline = catalogueControlVersion(true, {
      fingerprint: "cc3-before-edit",
    });

    expect(() =>
      assertCatalogueControlUnchanged(baseline, true, {
        fingerprint: concurrentFingerprint,
      }),
    ).toThrow("Catalogue changed concurrently. Reload Products and try again.");
  });

  it("allows reload and retry after a genuine conflict", () => {
    const staleBaseline = catalogueControlVersion(true, {
      fingerprint: "cc3-before-edit",
    });
    const currentControl = { fingerprint: "cc3-concurrent-edit" };

    expect(() =>
      assertCatalogueControlUnchanged(staleBaseline, true, currentControl),
    ).toThrow(/changed concurrently/);

    const reloadedBaseline = catalogueControlVersion(true, currentControl);
    expect(() =>
      assertCatalogueControlUnchanged(reloadedBaseline, true, currentControl),
    ).not.toThrow();
  });

  it("supports an unchanged edit and detects control creation after a missing baseline", () => {
    const current = group([choice("choice-uat-2", 1)]);
    const prepared = prepareOptionGroupSave({
      previous: current,
      next: current,
      catalogue: [...fallbackOptionGroups, current],
      products: [],
    });
    expect(prepared.group).toEqual(current);

    const missingBaseline = catalogueControlVersion(false, undefined);
    expect(() =>
      assertCatalogueControlUnchanged(missingBaseline, false, undefined),
    ).not.toThrow();
    expect(() =>
      assertCatalogueControlUnchanged(missingBaseline, true, {
        fingerprint: "cc3-created-by-another-writer",
      }),
    ).toThrow(/changed concurrently/);
  });
});
