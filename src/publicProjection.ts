import { normalizeProduct } from "./data";
import { toCustomerPublicProduct } from "./customerOrder";
import type {
  Product,
  PublicCustomerProduct,
  ToppingAvailability,
} from "./types";

export const publicProjectionControlId = "current";
export const publicProjectionSchemaVersion = 1;

export interface PublicProjection {
  menu: Record<string, PublicCustomerProduct>;
  availability: ToppingAvailability;
  fingerprint: string;
}

export interface PublicProjectionDiff {
  create: string[];
  update: string[];
  current: string[];
  stale: string[];
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
  return `wp3-${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
}

export function buildPublicProjection(
  products: Product[],
  availability: ToppingAvailability,
): PublicProjection {
  const productIds = products.map((product) => product.id);
  if (productIds.some((id) => !id))
    throw new Error("Public projection source contains an empty product ID");
  if (new Set(productIds).size !== productIds.length)
    throw new Error("Public projection source contains duplicate product IDs");
  const menu = Object.fromEntries(
    products
      .map(normalizeProduct)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((product) => [product.id, toCustomerPublicProduct(product)]),
  );
  const canonicalAvailability = Object.fromEntries(
    Object.entries(availability).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  ) as ToppingAvailability;
  const fingerprint = projectionFingerprint({
    schemaVersion: publicProjectionSchemaVersion,
    menu,
    availability: canonicalAvailability,
  });
  return { menu, availability: canonicalAvailability, fingerprint };
}

export function diffPublicProjection(
  projection: PublicProjection,
  existingMenu: Record<string, unknown>,
): PublicProjectionDiff {
  const desiredIds = Object.keys(projection.menu).sort();
  const existingIds = Object.keys(existingMenu).sort();
  const create = desiredIds.filter((id) => !(id in existingMenu));
  const update = desiredIds.filter(
    (id) =>
      id in existingMenu &&
      !samePublicValue(existingMenu[id], projection.menu[id]),
  );
  const current = desiredIds.filter(
    (id) =>
      id in existingMenu &&
      samePublicValue(existingMenu[id], projection.menu[id]),
  );
  return {
    create,
    update,
    current,
    stale: existingIds.filter((id) => !(id in projection.menu)),
  };
}

function samePublicValue(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}
