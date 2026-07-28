import {
  effectiveProductOptionGroups,
  normalizeOptionCatalogue,
  normalizeOptionGroup,
  productOptionGroupAssignments,
} from "./optionCatalogue";
import type { OptionChoice, OptionGroup, Product } from "./types";

export type CatalogueIdKind = "group" | "choice";

export interface HardDeleteDecision {
  allowed: boolean;
  reason?: string;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1)
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  return (hash >>> 0).toString(36);
}

function idStem(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return normalized || stableHash(value.trim());
}

export function createStableCatalogueId(
  kind: CatalogueIdKind,
  label: string,
  existingIds: Iterable<string>,
): string {
  const trimmed = label.trim();
  if (!trimmed) throw new Error("A name is required before creating an ID");
  const existing = new Set(existingIds);
  const base = `${kind}-${idStem(trimmed)}`;
  if (!existing.has(base)) return base;
  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function assignmentReferencesChoice(
  product: Product,
  groupId: string,
  choiceId: string,
): boolean {
  return productOptionGroupAssignments(product).some(
    (assignment) =>
      assignment.groupId === groupId &&
      (assignment.choiceIds === undefined ||
        assignment.choiceIds.includes(choiceId)),
  );
}

function legacyOrChannelRuleReferencesChoice(
  product: Product,
  choiceId: string,
): boolean {
  return (
    product.availableToppingIds.includes(choiceId) ||
    (product.premiumToppingIds?.includes(choiceId) ?? false) ||
    product.granolaOptions.includes(choiceId) ||
    Object.values(product.channelRules ?? {}).some(
      (rule) => rule?.allowedExtraToppingIds.includes(choiceId) ?? false,
    )
  );
}

export function isChoiceReferenced(
  groupId: string,
  choiceId: string,
  products: Product[],
): boolean {
  return products.some(
    (product) =>
      assignmentReferencesChoice(product, groupId, choiceId) ||
      legacyOrChannelRuleReferencesChoice(product, choiceId),
  );
}

export function hardDeleteChoiceDecision(
  groupId: string,
  choice: OptionChoice,
  products: Product[],
): HardDeleteDecision {
  if (choice.everUsed)
    return {
      allowed: false,
      reason: "Previously used choices must be archived to preserve history",
    };
  if (isChoiceReferenced(groupId, choice.id, products))
    return {
      allowed: false,
      reason: "Assigned choices must be unassigned before deletion",
    };
  return { allowed: true };
}

export function markAssignedChoicesEverUsed(
  products: Product[],
  catalogue: OptionGroup[],
): OptionGroup[] {
  return normalizeOptionCatalogue(catalogue).map((group) => ({
    ...group,
    choices: group.choices.map((choice) => ({
      ...choice,
      everUsed:
        choice.everUsed || isChoiceReferenced(group.id, choice.id, products),
    })),
  }));
}

function assertCatalogueSupportsProducts(
  catalogue: OptionGroup[],
  products: Product[],
) {
  products.forEach((product) =>
    effectiveProductOptionGroups(product, catalogue),
  );
}

export function prepareOptionGroupSave(options: {
  previous?: OptionGroup;
  next: OptionGroup;
  catalogue: OptionGroup[];
  products: Product[];
}): { group: OptionGroup; catalogue: OptionGroup[] } {
  const previous = options.previous
    ? normalizeOptionGroup(options.previous)
    : undefined;
  const next = normalizeOptionGroup(options.next);
  if (previous && previous.id !== next.id)
    throw new Error("Option group IDs are immutable");

  const previousChoices = new Map(
    previous?.choices.map((choice) => [choice.id, choice]) ?? [],
  );
  const nextChoiceIds = new Set(next.choices.map((choice) => choice.id));
  previousChoices.forEach((choice) => {
    if (nextChoiceIds.has(choice.id)) return;
    const decision = hardDeleteChoiceDecision(
      next.id,
      choice,
      options.products,
    );
    if (!decision.allowed) throw new Error(decision.reason);
  });

  const protectedNext: OptionGroup = {
    ...next,
    choices: next.choices.map((choice) => {
      const previousChoice = previousChoices.get(choice.id);
      if (previousChoice?.everUsed && !choice.everUsed)
        throw new Error("Choice lifecycle history cannot be reset");
      return {
        ...choice,
        everUsed:
          choice.everUsed ||
          previousChoice?.everUsed === true ||
          isChoiceReferenced(next.id, choice.id, options.products),
      };
    }),
  };

  const candidate = normalizeOptionCatalogue([
    ...options.catalogue.filter((group) => group.id !== protectedNext.id),
    protectedNext,
  ]);
  assertCatalogueSupportsProducts(candidate, options.products);
  return {
    group: candidate.find((group) => group.id === protectedNext.id)!,
    catalogue: candidate,
  };
}

export function prepareProductCatalogueSave(options: {
  product: Product;
  products: Product[];
  catalogue: OptionGroup[];
}): { products: Product[]; catalogue: OptionGroup[] } {
  const products = [
    ...options.products.filter((entry) => entry.id !== options.product.id),
    options.product,
  ];
  return prepareCatalogueForProducts(products, options.catalogue);
}

export function prepareCatalogueForProducts(
  products: Product[],
  sourceCatalogue: OptionGroup[],
): { products: Product[]; catalogue: OptionGroup[] } {
  const catalogue = markAssignedChoicesEverUsed(products, sourceCatalogue);
  assertCatalogueSupportsProducts(catalogue, products);
  return { products, catalogue };
}

export function sameOptionGroup(
  left: OptionGroup | undefined,
  right: OptionGroup | undefined,
): boolean {
  if (!left || !right) return left === right;
  return (
    JSON.stringify(normalizeOptionGroup(left)) ===
    JSON.stringify(normalizeOptionGroup(right))
  );
}
