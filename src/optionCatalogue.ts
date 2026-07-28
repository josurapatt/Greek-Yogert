import { granolaFlavorIdsByName, toppings } from "./data";
import type {
  ChannelToppingRules,
  OptionChoice,
  OptionGroup,
  Product,
  ProductOptionGroupAssignment,
  PublicOptionChoice,
  PublicOptionGroup,
  ToppingAvailability,
} from "./types";

export const toppingsOptionGroupId = "toppings";
export const granolaFlavourOptionGroupId = "granola-flavour";
export const maxOptionGroupsPerProduct = 10;
export const maxOptionGroupsPerCatalogue = 20;
export const maxChoicesPerOptionGroup = 50;
export const maxCustomerSelectionsPerProduct = 10;

export interface EffectiveOptionGroup
  extends Omit<
    OptionGroup,
    "required" | "minSelections" | "maxSelections" | "choices"
  > {
  required: boolean;
  minSelections: number;
  maxSelections: number;
  choices: OptionChoice[];
}

export interface CatalogueSelectionIssue {
  code:
    | "configuration"
    | "unknown-choice"
    | "inactive-group"
    | "inactive-choice"
    | "unavailable-choice"
    | "minimum"
    | "maximum"
    | "duplicate"
    | "channel-extra";
  groupId?: string;
  choiceId?: string;
  message: string;
}

const safeInteger = (
  value: unknown,
  fallback: number,
  minimum = 0,
  maximum = maxChoicesPerOptionGroup,
) =>
  Number.isInteger(value) &&
  Number(value) >= minimum &&
  Number(value) <= maximum
    ? Number(value)
    : fallback;

function assertInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): asserts value is number {
  if (
    !Number.isInteger(value) ||
    Number(value) < minimum ||
    Number(value) > maximum
  )
    throw new Error(
      `${label} must be an integer between ${minimum} and ${maximum}`,
    );
}

const compareDisplayOrder = <
  Value extends { displayOrder: number; id: string },
>(
  left: Value,
  right: Value,
) => left.displayOrder - right.displayOrder || left.id.localeCompare(right.id);

const fallbackToppingsGroup: OptionGroup = {
  id: toppingsOptionGroupId,
  displayName: "ท็อปปิ้ง",
  active: true,
  displayOrder: 10,
  required: true,
  minSelections: 0,
  maxSelections: maxCustomerSelectionsPerProduct,
  allowDuplicates: true,
  pricingMode: "legacy-topping",
  choices: toppings.map((topping, displayOrder) => ({
    id: topping.id,
    name: topping.name,
    active: true,
    displayOrder,
    classification: topping.premium ? "premium" : "normal",
    surcharge: 0,
    availabilityId: topping.id,
    everUsed: true,
  })),
};

const fallbackGranolaGroup: OptionGroup = {
  id: granolaFlavourOptionGroupId,
  displayName: "รสกราโนล่า",
  active: true,
  displayOrder: 20,
  required: true,
  minSelections: 1,
  maxSelections: 1,
  allowDuplicates: false,
  pricingMode: "choice-surcharge",
  choices: Object.entries(granolaFlavorIdsByName).map(
    ([name, availabilityId], displayOrder) => ({
      id: name,
      name,
      active: true,
      displayOrder,
      classification: "normal",
      surcharge: 0,
      availabilityId,
      everUsed: true,
    }),
  ),
};

export const fallbackOptionGroups: OptionGroup[] = [
  fallbackToppingsGroup,
  fallbackGranolaGroup,
].map((group) => structuredClone(group));

function cloneFallbackGroups(): OptionGroup[] {
  return fallbackOptionGroups.map((group) => structuredClone(group));
}

function assertBoundedId(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || !value || value.length > 120)
    throw new Error(
      `${label} must be a non-empty string of at most 120 characters`,
    );
}

export function normalizeOptionChoice(choice: OptionChoice): OptionChoice {
  assertBoundedId(choice?.id, "Option choice ID");
  if (
    typeof choice.name !== "string" ||
    !choice.name ||
    choice.name.length > 120
  )
    throw new Error(`Option choice ${choice.id} has an invalid name`);
  if (choice.classification !== "normal" && choice.classification !== "premium")
    throw new Error(`Option choice ${choice.id} has an invalid classification`);
  if (
    typeof choice.surcharge !== "number" ||
    !Number.isInteger(choice.surcharge) ||
    choice.surcharge < 0 ||
    choice.surcharge > 5_000
  )
    throw new Error(`Option choice ${choice.id} has an invalid surcharge`);
  if (
    choice.availabilityId !== undefined &&
    (typeof choice.availabilityId !== "string" ||
      !choice.availabilityId ||
      choice.availabilityId.length > 120)
  )
    throw new Error(
      `Option choice ${choice.id} has an invalid availability ID`,
    );
  if (typeof choice.active !== "boolean")
    throw new Error(`Option choice ${choice.id} has an invalid active state`);
  assertInteger(
    choice.displayOrder,
    `Option choice ${choice.id} display order`,
    0,
    10_000,
  );
  if (typeof choice.everUsed !== "boolean")
    throw new Error(
      `Option choice ${choice.id} has an invalid lifecycle state`,
    );
  return {
    id: choice.id,
    name: choice.name,
    active: choice.active,
    displayOrder: choice.displayOrder,
    classification: choice.classification,
    surcharge: choice.surcharge,
    ...(choice.availabilityId ? { availabilityId: choice.availabilityId } : {}),
    everUsed: choice.everUsed,
  };
}

export function normalizePublicOptionChoice(
  choice: PublicOptionChoice,
): PublicOptionChoice {
  const normalized = normalizeOptionChoice({
    ...choice,
    everUsed: true,
  });
  const { everUsed: _everUsed, ...publicChoice } = normalized;
  void _everUsed;
  return publicChoice;
}

export function normalizeOptionGroup(group: OptionGroup): OptionGroup {
  assertBoundedId(group?.id, "Option group ID");
  if (
    typeof group.displayName !== "string" ||
    !group.displayName ||
    group.displayName.length > 120
  )
    throw new Error(`Option group ${group.id} has an invalid display name`);
  if (
    group.pricingMode !== "legacy-topping" &&
    group.pricingMode !== "choice-surcharge"
  )
    throw new Error(`Option group ${group.id} has an invalid pricing mode`);
  if (
    !Array.isArray(group.choices) ||
    group.choices.length > maxChoicesPerOptionGroup
  )
    throw new Error(
      `Option group ${group.id} exceeds the ${maxChoicesPerOptionGroup}-choice limit`,
    );
  const choices = group.choices
    .map(normalizeOptionChoice)
    .sort(compareDisplayOrder);
  if (new Set(choices.map((choice) => choice.id)).size !== choices.length)
    throw new Error(`Option group ${group.id} contains duplicate choice IDs`);
  if (
    typeof group.active !== "boolean" ||
    typeof group.required !== "boolean" ||
    typeof group.allowDuplicates !== "boolean"
  )
    throw new Error(`Option group ${group.id} has invalid boolean fields`);
  assertInteger(
    group.displayOrder,
    `Option group ${group.id} display order`,
    0,
    10_000,
  );
  assertInteger(
    group.minSelections,
    `Option group ${group.id} minimum`,
    0,
    maxCustomerSelectionsPerProduct,
  );
  assertInteger(
    group.maxSelections,
    `Option group ${group.id} maximum`,
    0,
    maxCustomerSelectionsPerProduct,
  );
  const minSelections = group.minSelections;
  const maxSelections = group.maxSelections;
  if (maxSelections < minSelections)
    throw new Error(`Option group ${group.id} has an invalid selection range`);
  return {
    id: group.id,
    displayName: group.displayName,
    active: group.active,
    displayOrder: group.displayOrder,
    required: group.required,
    minSelections,
    maxSelections,
    allowDuplicates: group.allowDuplicates,
    pricingMode: group.pricingMode,
    choices,
  };
}

export function normalizePublicOptionGroup(
  group: PublicOptionGroup,
): PublicOptionGroup {
  const normalized = normalizeOptionGroup({
    ...group,
    choices: group.choices.map((choice) => ({ ...choice, everUsed: true })),
  });
  return toPublicOptionGroup(normalized);
}

export function normalizeOptionCatalogue(groups: OptionGroup[]): OptionGroup[] {
  if (!Array.isArray(groups) || groups.length > maxOptionGroupsPerCatalogue)
    throw new Error(
      `Option catalogue exceeds the ${maxOptionGroupsPerCatalogue}-group limit`,
    );
  const normalized = groups.map(normalizeOptionGroup).sort(compareDisplayOrder);
  if (new Set(normalized.map((group) => group.id)).size !== normalized.length)
    throw new Error("Option catalogue contains duplicate group IDs");
  const choiceIds = normalized.flatMap((group) =>
    group.choices.map((choice) => choice.id),
  );
  if (new Set(choiceIds).size !== choiceIds.length)
    throw new Error("Option choice IDs must be globally unique");
  return normalized;
}

/**
 * Persisted documents replace their complete fallback group. Only entirely
 * missing fallback group documents are supplied by committed compatibility
 * data; missing choices are never reinserted.
 */
export function mergeOptionGroupsWithFallback(
  persistedGroups: OptionGroup[],
): OptionGroup[] {
  const normalized = normalizeOptionCatalogue(persistedGroups);
  const persistedIds = new Set(normalized.map((group) => group.id));
  return normalizeOptionCatalogue([
    ...normalized,
    ...cloneFallbackGroups().filter((group) => !persistedIds.has(group.id)),
  ]);
}

export function toPublicOptionGroup(group: OptionGroup): PublicOptionGroup {
  const normalized = normalizeOptionGroup(group);
  return {
    ...normalized,
    choices: normalized.choices.map(({ everUsed: _everUsed, ...choice }) => {
      void _everUsed;
      return choice;
    }),
  };
}

export function publicOptionGroupsToCatalogue(
  groups: PublicOptionGroup[],
): OptionGroup[] {
  const privateShape = groups.map((group) => ({
    ...normalizePublicOptionGroup(group),
    choices: group.choices.map((choice) => ({
      ...normalizePublicOptionChoice(choice),
      everUsed: true,
    })),
  }));
  return mergeOptionGroupsWithFallback(privateShape);
}

export function normalizeProductOptionGroupAssignments(
  assignments: ProductOptionGroupAssignment[],
): ProductOptionGroupAssignment[] {
  if (
    !Array.isArray(assignments) ||
    assignments.length > maxOptionGroupsPerProduct
  )
    throw new Error(
      `Product option assignments exceed the ${maxOptionGroupsPerProduct}-group limit`,
    );
  const normalized = assignments.map((assignment) => {
    assertBoundedId(assignment?.groupId, "Product option group ID");
    const choiceIds = assignment.choiceIds;
    if (
      choiceIds !== undefined &&
      (!Array.isArray(choiceIds) ||
        choiceIds.length > maxChoicesPerOptionGroup ||
        choiceIds.some(
          (id) => typeof id !== "string" || !id || id.length > 120,
        ) ||
        new Set(choiceIds).size !== choiceIds.length)
    )
      throw new Error(
        `Product assignment ${assignment.groupId} has invalid choice IDs`,
      );
    const normalizedAssignment: ProductOptionGroupAssignment = {
      groupId: assignment.groupId,
      ...(choiceIds ? { choiceIds: [...choiceIds] } : {}),
    };
    if (assignment.required !== undefined) {
      if (typeof assignment.required !== "boolean")
        throw new Error(
          `Product assignment ${assignment.groupId} has an invalid required state`,
        );
      normalizedAssignment.required = assignment.required;
    }
    if (assignment.minSelections !== undefined)
      normalizedAssignment.minSelections = safeInteger(
        assignment.minSelections,
        -1,
        0,
        maxCustomerSelectionsPerProduct,
      );
    if (assignment.maxSelections !== undefined)
      normalizedAssignment.maxSelections = safeInteger(
        assignment.maxSelections,
        -1,
        0,
        maxCustomerSelectionsPerProduct,
      );
    if (
      normalizedAssignment.minSelections === -1 ||
      normalizedAssignment.maxSelections === -1
    )
      throw new Error(
        `Product assignment ${assignment.groupId} has invalid selection limits`,
      );
    return normalizedAssignment;
  });
  if (
    new Set(normalized.map((assignment) => assignment.groupId)).size !==
    normalized.length
  )
    throw new Error("Product contains duplicate option group assignments");
  return normalized;
}

export function legacyProductOptionGroupAssignments(
  product: Product,
): ProductOptionGroupAssignment[] {
  if (product.optionMode === "none") return [];
  if (product.optionMode === "granola")
    return [
      {
        groupId: granolaFlavourOptionGroupId,
        choiceIds: [...product.granolaOptions],
        required: true,
        minSelections: 1,
        maxSelections: 1,
      },
    ];
  const minimum = safeInteger(
    product.includedToppings,
    0,
    0,
    maxCustomerSelectionsPerProduct,
  );
  const maximum = safeInteger(
    product.maxSelectedOptions,
    maxCustomerSelectionsPerProduct,
    0,
    maxCustomerSelectionsPerProduct,
  );
  if (maximum < minimum)
    throw new Error(
      `Product ${product.id} has an invalid legacy selection range`,
    );
  return [
    {
      groupId: toppingsOptionGroupId,
      choiceIds: [...product.availableToppingIds],
      required: minimum > 0,
      minSelections: minimum,
      maxSelections: maximum,
    },
  ];
}

export function productOptionGroupAssignments(
  product: Product,
): ProductOptionGroupAssignment[] {
  return product.optionGroupAssignments === undefined
    ? legacyProductOptionGroupAssignments(product)
    : normalizeProductOptionGroupAssignments(product.optionGroupAssignments);
}

export function effectiveProductOptionGroups(
  product: Product,
  catalogue: OptionGroup[] = fallbackOptionGroups,
): EffectiveOptionGroup[] {
  const groups = mergeOptionGroupsWithFallback(catalogue);
  const byId = new Map(groups.map((group) => [group.id, group]));
  const effective = productOptionGroupAssignments(product).map((assignment) => {
    const group = byId.get(assignment.groupId);
    if (!group)
      throw new Error(
        `Product ${product.id} references unknown option group ${assignment.groupId}`,
      );
    const allowed = assignment.choiceIds
      ? new Set(assignment.choiceIds)
      : undefined;
    if (
      allowed &&
      [...allowed].some(
        (choiceId) => !group.choices.some((choice) => choice.id === choiceId),
      )
    )
      throw new Error(
        `Product ${product.id} references an unknown choice in ${group.id}`,
      );
    const choices = group.choices
      .filter((choice) => !allowed || allowed.has(choice.id))
      .sort(compareDisplayOrder);
    const required = assignment.required ?? group.required;
    const minSelections =
      assignment.minSelections ?? (required ? group.minSelections : 0);
    const maxSelections = assignment.maxSelections ?? group.maxSelections;
    if (
      !Number.isInteger(minSelections) ||
      minSelections < 0 ||
      !Number.isInteger(maxSelections) ||
      maxSelections < minSelections ||
      maxSelections > maxCustomerSelectionsPerProduct
    )
      throw new Error(
        `Product ${product.id} has invalid limits for option group ${group.id}`,
      );
    if (!group.allowDuplicates && maxSelections > choices.length)
      throw new Error(
        `Product ${product.id} cannot select ${maxSelections} unique choices from ${group.id}`,
      );
    return {
      ...group,
      required,
      minSelections,
      maxSelections,
      choices,
    };
  });
  const maximum = effective.reduce(
    (sum, group) => sum + (group.active ? group.maxSelections : 0),
    0,
  );
  if (maximum > maxCustomerSelectionsPerProduct)
    throw new Error(
      `Product ${product.id} exceeds the ${maxCustomerSelectionsPerProduct}-selection limit`,
    );
  return effective.sort(compareDisplayOrder);
}

export function effectiveProductSelectionLimits(
  product: Product,
  catalogue: OptionGroup[] = fallbackOptionGroups,
): { minimum: number; maximum: number } {
  return effectiveProductOptionGroups(product, catalogue).reduce(
    (limits, group) =>
      group.active
        ? {
            minimum: limits.minimum + group.minSelections,
            maximum: limits.maximum + group.maxSelections,
          }
        : limits,
    { minimum: 0, maximum: 0 },
  );
}

export function allowedProductOptionChoices(
  product: Product,
  catalogue: OptionGroup[] = fallbackOptionGroups,
  options: { includeInactive?: boolean } = {},
): Array<{ group: EffectiveOptionGroup; choice: OptionChoice }> {
  return effectiveProductOptionGroups(product, catalogue).flatMap((group) =>
    !group.active && !options.includeInactive
      ? []
      : group.choices
          .filter((choice) => options.includeInactive || choice.active)
          .map((choice) => ({ group, choice })),
  );
}

export function optionChoiceAvailabilityId(choice: OptionChoice): string {
  return choice.availabilityId ?? choice.id;
}

export function isOptionChoiceAvailable(
  choice: OptionChoice,
  availability: ToppingAvailability = {},
): boolean {
  return availability[optionChoiceAvailabilityId(choice)] !== false;
}

export function selectedOptionLabels(
  product: Product,
  selectedIds: string[],
  catalogue: OptionGroup[] = fallbackOptionGroups,
): string[] {
  const choices = new Map(
    allowedProductOptionChoices(product, catalogue, {
      includeInactive: true,
    }).map((entry) => [entry.choice.id, entry]),
  );
  return selectedIds.map((id) => {
    const entry = choices.get(id);
    if (!entry) throw new Error(`Unknown option choice ${id}`);
    if (entry.group.id === toppingsOptionGroupId) return entry.choice.name;
    if (entry.group.id === granolaFlavourOptionGroupId)
      return `กราโนล่ารส${entry.choice.name}`;
    return `${entry.group.displayName}: ${entry.choice.name}`;
  });
}

function countSelectionsForGroup(
  selectedIds: string[],
  group: EffectiveOptionGroup,
): string[] {
  const choiceIds = new Set(group.choices.map((choice) => choice.id));
  return selectedIds.filter((id) => choiceIds.has(id));
}

export function validateCatalogueSelection(
  product: Product,
  selectedIds: string[],
  catalogue: OptionGroup[] = fallbackOptionGroups,
  availability: ToppingAvailability = {},
  toppingRules?: ChannelToppingRules,
): CatalogueSelectionIssue | null {
  let groups: EffectiveOptionGroup[];
  try {
    groups = effectiveProductOptionGroups(product, catalogue);
  } catch (cause) {
    return {
      code: "configuration",
      message:
        cause instanceof Error
          ? cause.message
          : "Invalid product option configuration",
    };
  }
  const assignedChoices = new Map<string, EffectiveOptionGroup>();
  groups.forEach((group) =>
    group.choices.forEach((choice) => assignedChoices.set(choice.id, group)),
  );
  const unknown = selectedIds.find((id) => !assignedChoices.has(id));
  if (unknown)
    return {
      code: "unknown-choice",
      choiceId: unknown,
      message: `Unknown or disallowed option choice ${unknown}`,
    };
  for (const group of groups) {
    const selected = countSelectionsForGroup(selectedIds, group);
    if (!group.active) {
      if (selected.length || group.minSelections > 0)
        return {
          code: "inactive-group",
          groupId: group.id,
          message: `Option group ${group.displayName} is inactive`,
        };
      continue;
    }
    const byId = new Map(group.choices.map((choice) => [choice.id, choice]));
    for (const id of selected) {
      const choice = byId.get(id)!;
      if (!choice.active)
        return {
          code: "inactive-choice",
          groupId: group.id,
          choiceId: id,
          message: `Option choice ${choice.name} is inactive`,
        };
      if (!isOptionChoiceAvailable(choice, availability))
        return {
          code: "unavailable-choice",
          groupId: group.id,
          choiceId: id,
          message: `Option choice ${choice.name} is unavailable`,
        };
    }
    if (selected.length < group.minSelections)
      return {
        code: "minimum",
        groupId: group.id,
        message: `Select at least ${group.minSelections} choices from ${group.displayName}`,
      };
    if (selected.length > group.maxSelections)
      return {
        code: "maximum",
        groupId: group.id,
        message: `Select at most ${group.maxSelections} choices from ${group.displayName}`,
      };
    const duplicatesAllowed =
      group.id === toppingsOptionGroupId && toppingRules
        ? toppingRules.allowDuplicateToppings
        : group.allowDuplicates;
    if (!duplicatesAllowed && new Set(selected).size !== selected.length)
      return {
        code: "duplicate",
        groupId: group.id,
        message: `Option group ${group.displayName} does not allow duplicates`,
      };
    if (group.id === toppingsOptionGroupId && toppingRules) {
      const unsupportedExtra = selected
        .slice(group.minSelections)
        .find((id) => !toppingRules.allowedExtraToppingIds.includes(id));
      if (unsupportedExtra)
        return {
          code: "channel-extra",
          groupId: group.id,
          choiceId: unsupportedExtra,
          message: `Choice ${unsupportedExtra} is not available as an extra on this channel`,
        };
    }
  }
  return null;
}

export function selectedChoicesByEffectiveGroup(
  product: Product,
  selectedIds: string[],
  catalogue: OptionGroup[] = fallbackOptionGroups,
): Array<{
  group: EffectiveOptionGroup;
  choices: OptionChoice[];
}> {
  return effectiveProductOptionGroups(product, catalogue).map((group) => {
    const byId = new Map(group.choices.map((choice) => [choice.id, choice]));
    return {
      group,
      choices: selectedIds.flatMap((id) => {
        const choice = byId.get(id);
        return choice ? [choice] : [];
      }),
    };
  });
}
