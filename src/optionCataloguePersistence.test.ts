import { describe, expect, it } from "vitest";
import {
  normalizeLegacyPrivateOptionGroupDocument,
  normalizePrivateOptionChoiceDocument,
  normalizePrivateOptionGroupDocument,
  serializePrivateOptionChoice,
  serializePrivateOptionGroup,
} from "./optionCataloguePersistence";
import type { OptionGroup } from "./types";

const group: OptionGroup = {
  id: "sauce",
  displayName: "Sauce",
  active: true,
  displayOrder: 30,
  required: false,
  minSelections: 0,
  maxSelections: 2,
  allowDuplicates: false,
  pricingMode: "choice-surcharge",
  choices: [
    {
      id: "honey",
      name: "Honey",
      active: true,
      displayOrder: 10,
      classification: "premium",
      surcharge: 15,
      availabilityId: "honey-stock",
      everUsed: true,
    },
  ],
};

describe("private option catalogue persistence", () => {
  it("stores group metadata without a mutable embedded Choice authority", () => {
    const persisted = serializePrivateOptionGroup(group);
    expect(persisted).toEqual({
      id: "sauce",
      displayName: "Sauce",
      active: true,
      displayOrder: 30,
      required: false,
      minSelections: 0,
      maxSelections: 2,
      allowDuplicates: false,
      pricingMode: "choice-surcharge",
    });
    expect(persisted).not.toHaveProperty("choices");
  });

  it("uses the Choice document path as identity and keeps lifecycle fields", () => {
    const persisted = serializePrivateOptionChoice(group.choices[0]);
    expect(persisted).not.toHaveProperty("id");
    expect(normalizePrivateOptionChoiceDocument("honey", persisted)).toEqual(
      group.choices[0],
    );
    expect(() =>
      normalizePrivateOptionChoiceDocument("honey", {
        ...persisted,
        id: "forged",
      }),
    ).toThrow("document ID as identity");
  });

  it("combines metadata and deterministically ordered Choice documents", () => {
    const metadata = serializePrivateOptionGroup(group);
    const first = normalizePrivateOptionChoiceDocument("z-last", {
      ...serializePrivateOptionChoice(group.choices[0]),
      displayOrder: 5,
    });
    const second = normalizePrivateOptionChoiceDocument("a-first", {
      ...serializePrivateOptionChoice(group.choices[0]),
      displayOrder: 5,
    });
    expect(
      normalizePrivateOptionGroupDocument("sauce", metadata, [
        first,
        second,
      ]).choices.map((choice) => choice.id),
    ).toEqual(["a-first", "z-last"]);
  });

  it("accepts the pre-release embedded shape only through an explicit legacy read adapter", () => {
    expect(normalizeLegacyPrivateOptionGroupDocument("sauce", group)).toEqual(
      group,
    );
    expect(() =>
      normalizePrivateOptionGroupDocument("sauce", group, []),
    ).toThrow("must not embed");
  });
});
