import { describe, expect, it } from "vitest";
import { defaultProducts, granolaFlavorIdsByName, toppings } from "./data";
import {
  calculatePriceBreakdown,
  getChannelRules,
  prepareOrderItems,
  validateSelection,
} from "./lib";
import {
  allowedProductOptionChoices,
  effectiveProductOptionGroups,
  effectiveProductSelectionLimits,
  fallbackOptionGroups,
  granolaFlavourOptionGroupId,
  legacyProductOptionGroupAssignments,
  mergeOptionGroupsWithFallback,
  normalizeOptionCatalogue,
  productOptionGroupAssignments,
  selectedOptionLabels,
  toppingsOptionGroupId,
  validateCatalogueSelection,
} from "./optionCatalogue";
import type { OptionGroup, Product } from "./types";

const product = (id: string) =>
  defaultProducts.find((entry) => entry.id === id)!;
const sizeS = product("size-s");
const apple = product("apple-ohlala");
const plain = product("plain-greek");

function customGroup(overrides: Partial<OptionGroup> = {}): OptionGroup {
  return {
    id: "sauce",
    displayName: "ซอส",
    active: true,
    displayOrder: 5,
    required: false,
    minSelections: 0,
    maxSelections: 2,
    allowDuplicates: false,
    pricingMode: "choice-surcharge",
    choices: [
      {
        id: "honey-sauce",
        name: "น้ำผึ้ง",
        active: true,
        displayOrder: 2,
        classification: "normal",
        surcharge: 7,
        availabilityId: "honey-sauce-stock",
        everUsed: false,
      },
      {
        id: "berry-sauce",
        name: "เบอร์รี่",
        active: true,
        displayOrder: 1,
        classification: "premium",
        surcharge: 9,
        everUsed: false,
      },
    ],
    ...overrides,
  };
}

describe("bounded configurable option catalogue", () => {
  it("preserves every static topping ID and granola compatibility key", () => {
    const toppingGroup = fallbackOptionGroups.find(
      (group) => group.id === toppingsOptionGroupId,
    )!;
    const granolaGroup = fallbackOptionGroups.find(
      (group) => group.id === granolaFlavourOptionGroupId,
    )!;
    expect(toppingGroup.choices.map((choice) => choice.id)).toEqual(
      toppings.map((topping) => topping.id),
    );
    expect(
      Object.fromEntries(
        granolaGroup.choices.map((choice) => [
          choice.id,
          choice.availabilityId,
        ]),
      ),
    ).toEqual(granolaFlavorIdsByName);
    expect(
      toppingGroup.choices
        .filter((choice) => choice.classification === "premium")
        .map((choice) => choice.id),
    ).toEqual(["strawberry", "blueberry", "kiwi"]);
  });

  it("uses a complete persisted group as authoritative without restoring missing choices", () => {
    const persisted = {
      ...fallbackOptionGroups.find(
        (group) => group.id === toppingsOptionGroupId,
      )!,
      choices: [
        fallbackOptionGroups.find(
          (group) => group.id === toppingsOptionGroupId,
        )!.choices[0],
      ],
    };
    const merged = mergeOptionGroupsWithFallback([persisted]);
    expect(
      merged.find((group) => group.id === toppingsOptionGroupId)?.choices,
    ).toHaveLength(1);
    expect(
      merged.find((group) => group.id === granolaFlavourOptionGroupId),
    ).toBeDefined();
  });

  it("adapts legacy none, granola, and topping products deterministically", () => {
    expect(legacyProductOptionGroupAssignments(plain)).toEqual([]);
    expect(legacyProductOptionGroupAssignments(apple)).toEqual([
      {
        groupId: granolaFlavourOptionGroupId,
        choiceIds: apple.granolaOptions,
        required: true,
        minSelections: 1,
        maxSelections: 1,
      },
    ]);
    expect(legacyProductOptionGroupAssignments(sizeS)).toEqual([
      {
        groupId: toppingsOptionGroupId,
        choiceIds: sizeS.availableToppingIds,
        required: true,
        minSelections: 3,
        maxSelections: 10,
      },
    ]);
    expect(
      productOptionGroupAssignments({
        ...plain,
        optionGroupAssignments: [],
      }),
    ).toEqual([]);
  });

  it("applies product overrides, allowed subsets, and stable group/choice order", () => {
    const configurable: Product = {
      ...plain,
      optionGroupAssignments: [
        {
          groupId: "sauce",
          choiceIds: ["honey-sauce", "berry-sauce"],
          required: true,
          minSelections: 1,
          maxSelections: 1,
        },
      ],
    };
    const [effective] = effectiveProductOptionGroups(configurable, [
      customGroup(),
    ]);
    expect(effective.required).toBe(true);
    expect([effective.minSelections, effective.maxSelections]).toEqual([1, 1]);
    expect(effective.choices.map((choice) => choice.id)).toEqual([
      "berry-sauce",
      "honey-sauce",
    ]);
    expect(
      allowedProductOptionChoices(configurable, [customGroup()]).map(
        ({ choice }) => choice.id,
      ),
    ).toEqual(["berry-sauce", "honey-sauce"]);
  });

  it("rejects duplicate global choice IDs and caps cross-group customer selections at ten", () => {
    expect(() =>
      normalizeOptionCatalogue([
        customGroup(),
        {
          ...customGroup({ id: "second", displayOrder: 6 }),
          choices: [
            {
              ...customGroup().choices[0],
              displayOrder: 0,
            },
          ],
        },
      ]),
    ).toThrow("globally unique");
    expect(
      effectiveProductSelectionLimits(
        {
          ...plain,
          optionGroupAssignments: [
            { groupId: "sauce", maxSelections: 6 },
            { groupId: "second", maxSelections: 5 },
          ],
        },
        [
          customGroup({ allowDuplicates: true, maxSelections: 10 }),
          {
            ...customGroup({
              id: "second",
              displayName: "Second",
              allowDuplicates: true,
              maxSelections: 10,
            }),
            choices: customGroup().choices.map((choice) => ({
              ...choice,
              id: `second-${choice.id}`,
            })),
          },
        ],
      ),
    ).toEqual({ minimum: 0, maximum: 10 });
  });

  it("enforces required/optional, inactive, unavailable, duplicate, and channel rules", () => {
    const configurable: Product = {
      ...plain,
      optionGroupAssignments: [
        {
          groupId: "sauce",
          required: true,
          minSelections: 1,
          maxSelections: 2,
        },
      ],
    };
    expect(
      validateCatalogueSelection(configurable, [], [customGroup()])?.code,
    ).toBe("minimum");
    expect(
      validateCatalogueSelection(
        configurable,
        ["honey-sauce"],
        [customGroup({ active: false })],
      )?.code,
    ).toBe("inactive-group");
    expect(
      validateCatalogueSelection(
        configurable,
        ["honey-sauce"],
        [
          customGroup({
            choices: customGroup().choices.map((choice) =>
              choice.id === "honey-sauce"
                ? { ...choice, active: false }
                : choice,
            ),
          }),
        ],
      )?.code,
    ).toBe("inactive-choice");
    expect(
      validateCatalogueSelection(
        configurable,
        ["honey-sauce"],
        [customGroup()],
        { "honey-sauce-stock": false },
      )?.code,
    ).toBe("unavailable-choice");
    expect(
      validateCatalogueSelection(
        configurable,
        ["honey-sauce", "honey-sauce"],
        [customGroup()],
      )?.code,
    ).toBe("duplicate");
    expect(
      validateCatalogueSelection(
        sizeS,
        ["banana", "banana", "apple"],
        fallbackOptionGroups,
        {},
        getChannelRules(sizeS, "Grab"),
      )?.code,
    ).toBe("duplicate");
    expect(
      validateCatalogueSelection(
        sizeS,
        ["banana", "orange", "apple", "grape"],
        fallbackOptionGroups,
        {},
        getChannelRules(sizeS, "Lineman"),
      )?.code,
    ).toBe("channel-extra");
  });

  it("keeps legacy labels and adds group context only for generic choices", () => {
    expect(
      selectedOptionLabels(apple, ["กล้วย"], fallbackOptionGroups),
    ).toEqual(["กราโนล่ารสกล้วย"]);
    expect(
      selectedOptionLabels(sizeS, ["banana"], fallbackOptionGroups),
    ).toEqual(["กล้วย"]);
    const configurable: Product = {
      ...plain,
      optionGroupAssignments: [{ groupId: "sauce" }],
    };
    expect(
      selectedOptionLabels(configurable, ["berry-sauce"], [customGroup()]),
    ).toEqual(["ซอส: เบอร์รี่"]);
  });

  it("prices generic surcharge choices and uses catalogue classification for legacy toppings", () => {
    const configurable: Product = {
      ...plain,
      optionGroupAssignments: [
        {
          groupId: "sauce",
          required: true,
          minSelections: 1,
          maxSelections: 2,
        },
      ],
    };
    expect(
      calculatePriceBreakdown(
        configurable,
        ["honey-sauce", "berry-sauce"],
        toppings,
        "หน้าร้าน",
        [customGroup()],
      ),
    ).toEqual({
      basePrice: 59,
      premiumIncludedSurcharge: 0,
      extraToppingCharges: 16,
      unitPrice: 75,
    });
    const authoritativeToppings = fallbackOptionGroups.map((group) =>
      group.id === toppingsOptionGroupId
        ? {
            ...group,
            choices: group.choices.map((choice) =>
              choice.id === "strawberry"
                ? { ...choice, classification: "normal" as const }
                : choice,
            ),
          }
        : group,
    );
    expect(
      calculatePriceBreakdown(
        sizeS,
        ["banana", "orange", "strawberry"],
        toppings,
        "หน้าร้าน",
        authoritativeToppings,
      ).unitPrice,
    ).toBe(89);
  });

  it("uses approved channel surcharges with the singular value as fallback", () => {
    const group = customGroup({
      choices: customGroup().choices.map((choice) =>
        choice.id === "berry-sauce"
          ? {
              ...choice,
              channelSurcharges: {
                หน้าร้าน: 10,
                Openchat: 11,
                Lineman: 12,
                Grab: 13,
                customerQr: 14,
              },
            }
          : choice,
      ),
    });
    const configurable: Product = {
      ...plain,
      optionGroupAssignments: [{ groupId: "sauce" }],
    };
    const price = (channel: "หน้าร้าน" | "Openchat" | "Lineman" | "Grab") =>
      calculatePriceBreakdown(
        configurable,
        ["berry-sauce"],
        toppings,
        channel,
        [group],
      ).extraToppingCharges;
    expect(price("หน้าร้าน")).toBe(10);
    expect(price("Openchat")).toBe(11);
    expect(price("Lineman")).toBe(12);
    expect(price("Grab")).toBe(13);
    expect(
      calculatePriceBreakdown(
        configurable,
        ["berry-sauce"],
        toppings,
        "หน้าร้าน",
        [group],
        "customerQr",
      ).extraToppingCharges,
    ).toBe(14);
    expect(
      calculatePriceBreakdown(configurable, ["honey-sauce"], toppings, "Grab", [
        group,
      ]).extraToppingCharges,
    ).toBe(7);
    expect(
      prepareOrderItems(
        [
          {
            id: "line-channel-price",
            productId: configurable.id,
            productName: configurable.name,
            basePrice: 0,
            selectedOptions: ["ซอส: เบอร์รี่"],
            selectedOptionIds: ["berry-sauce"],
            quantity: 1,
            unitPrice: 0,
          },
        ],
        [configurable],
        "หน้าร้าน",
        toppings,
        {},
        [group],
        "customerQr",
      )[0],
    ).toMatchObject({
      unitPrice: 73,
      lineTotal: 73,
      priceBreakdown: {
        extraToppingCharges: 14,
        unitPrice: 73,
      },
    });
  });

  it("separates assigned group capacity from the global ten-choice selection cap", () => {
    const manyChoices = Array.from({ length: 20 }, (_, index) => ({
      ...customGroup().choices[0],
      id: `choice-${index}`,
      displayOrder: index,
    }));
    const first = customGroup({
      id: "first",
      maxSelections: 10,
      choices: manyChoices,
    });
    const second = customGroup({
      id: "second",
      displayOrder: 6,
      maxSelections: 2,
      choices: customGroup().choices.map((choice) => ({
        ...choice,
        id: `second-${choice.id}`,
      })),
    });
    const configurable: Product = {
      ...plain,
      optionGroupAssignments: [{ groupId: "first" }, { groupId: "second" }],
    };
    expect(
      effectiveProductOptionGroups(configurable, [first, second]),
    ).toHaveLength(2);
    expect(
      effectiveProductSelectionLimits(configurable, [first, second]),
    ).toEqual({ minimum: 0, maximum: 10 });
    expect(
      validateCatalogueSelection(
        configurable,
        [
          ...manyChoices.slice(0, 10).map((choice) => choice.id),
          second.choices[0].id,
        ],
        [first, second],
      )?.code,
    ).toBe("maximum");
  });

  it("keeps every current default selection, label, price, and channel rule byte-compatible", () => {
    const selections: Record<string, string[]> = {
      "apple-ohlala": ["กล้วย"],
      "healthy-banana": ["เบอร์รี่รวม"],
      "plain-greek": [],
      "size-s": ["banana", "orange", "strawberry"],
      "size-m": ["banana", "orange", "apple", "granola-honey"],
      "plain-granola": ["น้ำผึ้ง"],
    };
    for (const current of defaultProducts) {
      const ids = selections[current.id];
      expect(selectedOptionLabels(current, ids, fallbackOptionGroups)).toEqual(
        current.optionMode === "granola"
          ? ids.map((id) => `กราโนล่ารส${id}`)
          : current.optionMode === "toppings"
            ? ids.map(
                (id) =>
                  toppings.find((topping) => topping.id === id)?.name ?? id,
              )
            : [],
      );
      for (const channel of [
        "หน้าร้าน",
        "Openchat",
        "Lineman",
        "Grab",
      ] as const) {
        const legacy = calculatePriceBreakdown(current, ids, toppings, channel);
        const catalogue = calculatePriceBreakdown(
          current,
          ids,
          toppings,
          channel,
          fallbackOptionGroups,
        );
        expect(catalogue).toEqual(legacy);
        expect(
          validateSelection(current, ids, channel, {}, fallbackOptionGroups),
        ).toBe(validateSelection(current, ids, channel));
      }
    }
  });
});
