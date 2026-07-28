import { normalizeProduct } from "./data";
import { customerOptionLabels, toCustomerPublicProduct } from "./customerOrder";
import {
  effectiveProductOptionGroups,
  effectiveProductSelectionLimits,
  fallbackOptionGroups,
  mergeOptionGroupsWithFallback,
  selectedOptionLabels,
  toPublicOptionGroup,
} from "./optionCatalogue";
import { productSelectedOptionLimits } from "./customerRequestPolicy";
import type {
  OptionGroup,
  Product,
  PublicCustomerProduct,
  PublicOptionGroup,
  ToppingAvailability,
} from "./types";

export const publicProjectionControlId = "current";
export const publicProjectionSchemaVersion = 3;
export const legacyPublicProjectionSchemaVersion = 2;

export interface PublicProductSelectionLimitV2 {
  minimum: number;
  maximum: number;
  allowedIds: string[];
  allowedLabels: string[];
}

export interface PublicProductOptionGroupPolicy {
  groupId: string;
  minimum: number;
  maximum: number;
  allowDuplicates: boolean;
  allowedIds: string[];
  allowedLabels: string[];
}

export interface PublicProductSelectionLimitV3
  extends PublicProductSelectionLimitV2 {
  groups: PublicProductOptionGroupPolicy[];
}

export interface PublicCustomerRequestPolicyV2 {
  schemaVersion: 2;
  fingerprint: string;
  productLimits: Record<string, PublicProductSelectionLimitV2>;
}

export interface PublicCustomerRequestPolicyV3 {
  schemaVersion: 3;
  fingerprint: string;
  productLimits: Record<string, PublicProductSelectionLimitV3>;
}

export type PublicCustomerRequestPolicy =
  | PublicCustomerRequestPolicyV2
  | PublicCustomerRequestPolicyV3;

export interface PublicProjectionControlV2 {
  schemaVersion: 2;
  fingerprint: string;
  menuIds: string[];
}

export interface PublicProjectionControlV3 {
  schemaVersion: 3;
  fingerprint: string;
  menuIds: string[];
  optionGroupIds: string[];
}

export type PublicProjectionControl =
  | PublicProjectionControlV2
  | PublicProjectionControlV3;

export interface PublicProjection {
  menu: Record<string, PublicCustomerProduct>;
  optionGroups: Record<string, PublicOptionGroup>;
  availability: ToppingAvailability;
  requestPolicy: PublicCustomerRequestPolicyV3;
  control: PublicProjectionControlV3;
  fingerprint: string;
}

export interface PublicProjectionDiff {
  create: string[];
  update: string[];
  current: string[];
  stale: string[];
  groupsCreate: string[];
  groupsUpdate: string[];
  groupsCurrent: string[];
  groupsStale: string[];
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`,
      );
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** A deterministic non-secret identifier for review and stale-state detection. */
export function projectionFingerprint(value: unknown): string {
  const text = stableStringify(value);
  let first = 0x811c9dc5;
  let second = 0x01000193;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ (code + index), 0x85ebca6b);
  }
  return `cc3-${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
}

export function isSupportedPublicProjectionSchemaVersion(
  value: unknown,
): value is 2 | 3 {
  return (
    value === legacyPublicProjectionSchemaVersion ||
    value === publicProjectionSchemaVersion
  );
}

export function assertPublicProjectionVersionTransition(
  currentVersion: unknown,
  nextVersion: unknown,
): asserts nextVersion is 2 | 3 {
  if (!isSupportedPublicProjectionSchemaVersion(nextVersion))
    throw new Error("Unsupported public projection schema version");
  if (
    currentVersion === publicProjectionSchemaVersion &&
    nextVersion !== publicProjectionSchemaVersion
  )
    throw new Error("Public projection V3 cannot be downgraded to V2");
}

export function normalizePublicCustomerRequestPolicy(
  value: unknown,
): PublicCustomerRequestPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid public Customer request policy");
  const policy = value as Record<string, unknown>;
  if (
    !isSupportedPublicProjectionSchemaVersion(policy.schemaVersion) ||
    typeof policy.fingerprint !== "string" ||
    !policy.productLimits ||
    typeof policy.productLimits !== "object" ||
    Array.isArray(policy.productLimits)
  )
    throw new Error("Invalid public Customer request policy");
  return policy as unknown as PublicCustomerRequestPolicy;
}

export function buildPublicProjectionControl(
  projection: Pick<PublicProjection, "fingerprint" | "menu" | "optionGroups">,
): PublicProjectionControlV3 {
  return {
    schemaVersion: publicProjectionSchemaVersion,
    fingerprint: projection.fingerprint,
    menuIds: Object.keys(projection.menu).sort(),
    optionGroupIds: Object.keys(projection.optionGroups).sort(),
  };
}

export function buildPublicProjection(
  products: Product[],
  availability: ToppingAvailability,
  optionGroups: OptionGroup[] = fallbackOptionGroups,
): PublicProjection {
  const productIds = products.map((product) => product.id);
  if (productIds.some((id) => !id))
    throw new Error("Public projection source contains an empty product ID");
  if (new Set(productIds).size !== productIds.length)
    throw new Error("Public projection source contains duplicate product IDs");
  const catalogue = mergeOptionGroupsWithFallback(optionGroups);
  const normalizedProducts = products
    .map(normalizeProduct)
    .sort((left, right) => left.id.localeCompare(right.id));
  const menu = Object.fromEntries(
    normalizedProducts.map((product) => [
      product.id,
      toCustomerPublicProduct(product),
    ]),
  );
  const publicGroups = catalogue
    .filter((group) => group.active)
    .map((group) =>
      toPublicOptionGroup({
        ...group,
        choices: group.choices.filter((choice) => choice.active),
      }),
    )
    .sort(
      (left, right) =>
        left.displayOrder - right.displayOrder ||
        left.id.localeCompare(right.id),
    );
  const projectedOptionGroups = Object.fromEntries(
    publicGroups.map((group) => [group.id, group]),
  );
  const canonicalAvailability = Object.fromEntries(
    Object.entries(availability).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  ) as ToppingAvailability;
  const productLimits = Object.fromEntries(
    normalizedProducts.map((product) => {
      const limits =
        product.optionGroupAssignments === undefined
          ? productSelectedOptionLimits(product)
          : effectiveProductSelectionLimits(product, catalogue);
      const effectiveGroups = effectiveProductOptionGroups(
        product,
        catalogue,
      ).filter((group) => group.active);
      const groups = effectiveGroups.map((group) => {
        const allowedIds = group.choices
          .filter((choice) => choice.active)
          .map((choice) => choice.id);
        return {
          groupId: group.id,
          minimum: group.minSelections,
          maximum: group.maxSelections,
          allowDuplicates: group.allowDuplicates,
          allowedIds,
          allowedLabels: selectedOptionLabels(product, allowedIds, catalogue),
        };
      });
      const allowedIds = groups.flatMap((group) => group.allowedIds);
      const allowedLabels =
        product.optionGroupAssignments === undefined
          ? customerOptionLabels(product, allowedIds)
          : selectedOptionLabels(product, allowedIds, catalogue);
      return [
        product.id,
        {
          ...limits,
          allowedIds,
          allowedLabels,
          groups,
        },
      ];
    }),
  );
  const fingerprint = projectionFingerprint({
    schemaVersion: publicProjectionSchemaVersion,
    menu,
    optionGroups: projectedOptionGroups,
    availability: canonicalAvailability,
    productLimits,
  });
  const requestPolicy: PublicCustomerRequestPolicyV3 = {
    schemaVersion: publicProjectionSchemaVersion,
    fingerprint,
    productLimits,
  };
  const projectionWithoutControl = {
    menu,
    optionGroups: projectedOptionGroups,
    availability: canonicalAvailability,
    fingerprint,
    requestPolicy,
  };
  return {
    ...projectionWithoutControl,
    control: buildPublicProjectionControl(projectionWithoutControl),
  };
}

function diffRecords(
  desired: Record<string, unknown>,
  existing: Record<string, unknown>,
) {
  const desiredIds = Object.keys(desired).sort();
  const existingIds = Object.keys(existing).sort();
  return {
    create: desiredIds.filter((id) => !(id in existing)),
    update: desiredIds.filter(
      (id) => id in existing && !samePublicValue(existing[id], desired[id]),
    ),
    current: desiredIds.filter(
      (id) => id in existing && samePublicValue(existing[id], desired[id]),
    ),
    stale: existingIds.filter((id) => !(id in desired)),
  };
}

export function diffPublicProjection(
  projection: PublicProjection,
  existingMenu: Record<string, unknown>,
  existingOptionGroups: Record<string, unknown> = {},
): PublicProjectionDiff {
  const menu = diffRecords(projection.menu, existingMenu);
  const groups = diffRecords(projection.optionGroups, existingOptionGroups);
  return {
    ...menu,
    groupsCreate: groups.create,
    groupsUpdate: groups.update,
    groupsCurrent: groups.current,
    groupsStale: groups.stale,
  };
}

function samePublicValue(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}
