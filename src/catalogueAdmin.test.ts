import { describe, expect, it } from "vitest";
import {
  catalogueAdminErrorMessage,
  createStableCatalogueId,
  hardDeleteChoiceDecision,
  isValidGeneratedCatalogueId,
  markAssignedChoicesEverUsed,
  prepareOptionGroupSave,
  prepareProductCatalogueSave,
  resolveCatalogueDraftIds,
} from "./catalogueAdmin";
import { defaultProducts, normalizeProduct } from "./data";
import {
  fallbackOptionGroups,
  normalizeOptionCatalogue,
} from "./optionCatalogue";
import type { OptionGroup } from "./types";

const customGroup = (): OptionGroup => ({
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
      id: "choice-caramel",
      name: "Caramel",
      active: true,
      displayOrder: 2,
      classification: "normal",
      surcharge: 7,
      everUsed: false,
    },
    {
      id: "choice-berry",
      name: "Berry",
      active: true,
      displayOrder: 1,
      classification: "premium",
      surcharge: 9,
      everUsed: false,
    },
  ],
});

describe("catalogue administration policy", () => {
  it("localizes Staff-facing Catalogue validation and concurrency messages", () => {
    expect(
      catalogueAdminErrorMessage(
        new Error("Option group sauce has an invalid selection range"),
        "fallback",
      ),
    ).toBe("จำนวนเลือกสูงสุดต้องไม่น้อยกว่าจำนวนเลือกขั้นต่ำ");
    expect(
      catalogueAdminErrorMessage(
        new Error("Option group sauce exceeds the 50-choice limit"),
        "fallback",
      ),
    ).toBe("กลุ่มตัวเลือก ID sauce มีตัวเลือกเกินจำนวนสูงสุด 50 รายการ");
    expect(
      catalogueAdminErrorMessage(
        new Error(
          "Catalogue changed concurrently. Reload Products and try again.",
        ),
        "fallback",
      ),
    ).toBe("แคตตาล็อกมีการเปลี่ยนแปลง กรุณาโหลดหน้าสินค้าใหม่แล้วลองอีกครั้ง");
    expect(
      catalogueAdminErrorMessage(
        new Error("Private option group sauce must be a map"),
        "ไม่สามารถโหลดข้อมูลแคตตาล็อกได้ กรุณาลองใหม่",
      ),
    ).toBe("ไม่สามารถโหลดข้อมูลแคตตาล็อกได้ กรุณาลองใหม่");
  });

  it("classifies safe actionable save failures without exposing diagnostics", () => {
    expect(
      catalogueAdminErrorMessage(
        Object.assign(new Error("7 PERMISSION_DENIED"), {
          code: "permission-denied",
        }),
        "fallback",
      ),
    ).toBe("บัญชีนี้ไม่มีสิทธิ์บันทึกแคตตาล็อก กรุณาตรวจสอบสิทธิ์พนักงาน");
    expect(
      catalogueAdminErrorMessage(
        new Error("Invalid generated catalogue identifier"),
        "fallback",
      ),
    ).toBe("ไม่สามารถสร้าง ID ถาวรจากชื่อนี้ได้ กรุณาปรับชื่อแล้วลองใหม่");
    expect(
      catalogueAdminErrorMessage(
        Object.assign(new Error("backend unavailable"), {
          code: "unavailable",
        }),
        "fallback",
      ),
    ).toBe(
      "ไม่สามารถเชื่อมต่อเพื่อบันทึกแคตตาล็อกได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่",
    );
    expect(
      catalogueAdminErrorMessage(
        new Error("unclassified internal diagnostic"),
        "fallback",
      ),
    ).toBe("fallback");
  });

  it("creates deterministic unique IDs and keeps IDs stable across name edits", () => {
    expect(createStableCatalogueId("group", "Sauce", [])).toBe("group-sauce");
    expect(createStableCatalogueId("group", "Sauce", ["group-sauce"])).toBe(
      "group-sauce-2",
    );
    expect(createStableCatalogueId("choice", "น้ำผึ้ง", [])).toBe(
      createStableCatalogueId("choice", "น้ำผึ้ง", []),
    );

    const original = customGroup();
    const next = { ...original, displayName: "Sauces" };
    const saved = prepareOptionGroupSave({
      previous: original,
      next,
      catalogue: [...fallbackOptionGroups, original],
      products: defaultProducts,
    });
    expect(saved.group.id).toBe("sauce");
    expect(saved.group.displayName).toBe("Sauces");
  });

  it("resolves Thai-only draft IDs deterministically for one or multiple Choices", () => {
    const thaiDraft = {
      ...customGroup(),
      id: "__draft-group",
      displayName: "ทดสอบ",
      choices: [
        {
          ...customGroup().choices[0],
          id: "__draft-choice-1",
          name: "น้ำผึ้ง",
        },
        {
          ...customGroup().choices[1],
          id: "__draft-choice-2",
          name: "น้ำผึ้ง",
        },
      ],
    };
    const resolved = resolveCatalogueDraftIds(thaiDraft, fallbackOptionGroups);
    const retried = resolveCatalogueDraftIds(thaiDraft, fallbackOptionGroups);

    expect(resolved).toEqual(retried);
    expect(resolved.id).toBe("group-mzin37");
    expect(resolved.choices.map((choice) => choice.id)).toEqual([
      "choice-zrtiv6",
      "choice-zrtiv6-2",
    ]);
    expect(
      [resolved.id, ...resolved.choices.map((choice) => choice.id)].every(
        isValidGeneratedCatalogueId,
      ),
    ).toBe(true);
  });

  it.each([
    ["mixed Thai-English", "กลุ่ม Sauce", "group-sauce"],
    ["Thai with digits", "กลุ่ม 123", "group-123"],
    ["symbols and whitespace", "  ชุด /// ...  ", "group-cpozv0"],
  ])("creates a valid ID for %s", (_label, value, expected) => {
    const id = createStableCatalogueId("group", value, []);
    expect(id).toBe(expected);
    expect(isValidGeneratedCatalogueId(id)).toBe(true);
  });

  it("preserves resolved and existing English IDs after display-name changes", () => {
    const resolved = resolveCatalogueDraftIds(
      {
        ...customGroup(),
        id: "__draft-group",
        displayName: "ทดสอบ",
        choices: [
          {
            ...customGroup().choices[0],
            id: "__draft-choice-1",
            name: "น้ำผึ้ง",
          },
        ],
      },
      fallbackOptionGroups,
    );
    const renamed = resolveCatalogueDraftIds(
      {
        ...resolved,
        displayName: "ชื่อใหม่",
        choices: [{ ...resolved.choices[0], name: "ตัวเลือกใหม่" }],
      },
      fallbackOptionGroups,
    );
    const existingEnglish = resolveCatalogueDraftIds(
      customGroup(),
      fallbackOptionGroups,
    );

    expect(renamed.id).toBe(resolved.id);
    expect(renamed.choices[0].id).toBe(resolved.choices[0].id);
    expect(existingEnglish.id).toBe("sauce");
    expect(existingEnglish.choices.map((choice) => choice.id)).toEqual([
      "choice-caramel",
      "choice-berry",
    ]);
  });

  it("edits topping names, classification, surcharge, order, and sale lifecycle without changing IDs", () => {
    const toppingGroup = structuredClone(
      fallbackOptionGroups.find((group) => group.id === "toppings")!,
    );
    const first = toppingGroup.choices[0];
    toppingGroup.choices[0] = {
      ...first,
      name: `${first.name} edited`,
      classification: "premium",
      surcharge: 5,
      displayOrder: 999,
      active: false,
    };
    const saved = prepareOptionGroupSave({
      previous: fallbackOptionGroups.find((group) => group.id === "toppings"),
      next: toppingGroup,
      catalogue: fallbackOptionGroups,
      products: defaultProducts,
    });
    const edited = saved.group.choices.find(
      (choice) => choice.id === first.id,
    )!;
    expect(edited).toMatchObject({
      id: first.id,
      classification: "premium",
      surcharge: 5,
      active: false,
    });
    expect(saved.group.choices.at(-1)?.id).toBe(first.id);
  });

  it("archives every choice and rejects physical deletion", () => {
    const group = customGroup();
    const newChoice = group.choices[0];
    expect(hardDeleteChoiceDecision(group.id, newChoice, [])).toMatchObject({
      allowed: false,
    });

    const usedChoice = { ...group.choices[1], everUsed: true };
    expect(hardDeleteChoiceDecision(group.id, usedChoice, [])).toMatchObject({
      allowed: false,
    });
    expect(() =>
      prepareOptionGroupSave({
        previous: { ...group, choices: [usedChoice] },
        next: { ...group, choices: [] },
        catalogue: [
          ...fallbackOptionGroups,
          { ...group, choices: [usedChoice] },
        ],
        products: [],
      }),
    ).toThrow(/archived/i);
    expect(() =>
      prepareOptionGroupSave({
        previous: group,
        next: { ...group, choices: group.choices.slice(1) },
        catalogue: [...fallbackOptionGroups, group],
        products: [],
      }),
    ).toThrow(/archived/i);
  });

  it("supports group activation, required/optional limits, duplicates, choice activation, and surcharges", () => {
    const group = customGroup();
    const next: OptionGroup = {
      ...group,
      active: false,
      required: true,
      minSelections: 1,
      maxSelections: 3,
      allowDuplicates: true,
      choices: group.choices.map((choice, index) => ({
        ...choice,
        active: index === 0,
        surcharge: 10 + index,
      })),
    };
    const saved = prepareOptionGroupSave({
      previous: group,
      next,
      catalogue: [...fallbackOptionGroups, group],
      products: [],
    });
    expect(saved.group).toMatchObject({
      active: false,
      required: true,
      minSelections: 1,
      maxSelections: 3,
      allowDuplicates: true,
    });
    expect(
      Object.fromEntries(
        saved.group.choices.map((choice) => [choice.id, choice.surcharge]),
      ),
    ).toEqual({
      "choice-caramel": 10,
      "choice-berry": 11,
    });
    expect(saved.group.choices.filter((choice) => choice.active)).toHaveLength(
      1,
    );
  });

  it("re-enables archived groups and choices with their original stable IDs", () => {
    const archived = {
      ...customGroup(),
      active: false,
      choices: customGroup().choices.map((choice) => ({
        ...choice,
        active: false,
      })),
    };
    const restored = prepareOptionGroupSave({
      previous: archived,
      next: {
        ...archived,
        active: true,
        choices: archived.choices.map((choice) => ({
          ...choice,
          active: true,
        })),
      },
      catalogue: [...fallbackOptionGroups, archived],
      products: [],
    }).group;

    expect(restored.active).toBe(true);
    expect(restored.choices.every((choice) => choice.active)).toBe(true);
    expect(restored.choices.map((choice) => choice.id).sort()).toEqual(
      archived.choices.map((choice) => choice.id).sort(),
    );
  });

  it("rejects invalid min/max configuration before persistence", () => {
    const group = customGroup();
    expect(() =>
      prepareOptionGroupSave({
        previous: group,
        next: { ...group, minSelections: 3, maxSelections: 2 },
        catalogue: [...fallbackOptionGroups, group],
        products: [],
      }),
    ).toThrow(/selection range/i);
  });

  it("rejects application-managed creation of a 51st Choice before persistence", () => {
    const group = customGroup();
    const overflow = Array.from({ length: 51 }, (_, index) => ({
      ...group.choices[0],
      id: `choice-${index}`,
      displayOrder: index,
    }));

    expect(() =>
      prepareOptionGroupSave({
        previous: undefined,
        next: { ...group, choices: overflow },
        catalogue: fallbackOptionGroups,
        products: [],
      }),
    ).toThrow("Option group sauce exceeds the 50-choice limit");
  });

  it("marks assigned choices everUsed irreversibly and preserves that state after unassignment", () => {
    const group = customGroup();
    const product = normalizeProduct({
      ...defaultProducts[0],
      id: "custom-product",
      optionGroupAssignments: [
        {
          groupId: group.id,
          choiceIds: ["choice-caramel"],
          maxSelections: 1,
        },
      ],
    });
    const assigned = prepareProductCatalogueSave({
      product,
      products: [],
      catalogue: [...fallbackOptionGroups, group],
    });
    const assignedGroup = assigned.catalogue.find(
      (entry) => entry.id === group.id,
    )!;
    expect(
      assignedGroup.choices.find((choice) => choice.id === "choice-caramel")
        ?.everUsed,
    ).toBe(true);
    expect(
      assignedGroup.choices.find((choice) => choice.id === "choice-berry")
        ?.everUsed,
    ).toBe(false);

    const unassigned = normalizeProduct({
      ...product,
      optionGroupAssignments: [],
    });
    const afterRemoval = markAssignedChoicesEverUsed(
      [unassigned],
      assigned.catalogue,
    );
    expect(
      afterRemoval
        .find((entry) => entry.id === group.id)!
        .choices.find((choice) => choice.id === "choice-caramel")?.everUsed,
    ).toBe(true);
  });

  it("rejects unknown Product assignments and preserves legacy Products", () => {
    const legacy = normalizeProduct(defaultProducts[0]);
    const normalized = normalizeOptionCatalogue(fallbackOptionGroups);
    const preserved = prepareProductCatalogueSave({
      product: legacy,
      products: [],
      catalogue: normalized,
    });
    expect(preserved.products).toHaveLength(1);
    expect(preserved.products[0].optionGroupAssignments).toBeUndefined();
    expect(() =>
      prepareProductCatalogueSave({
        product: {
          ...legacy,
          optionGroupAssignments: [{ groupId: "missing" }],
        },
        products: [],
        catalogue: normalized,
      }),
    ).toThrow(/unknown option group/i);
  });
});
