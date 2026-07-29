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

export function catalogueAdminErrorMessage(
  cause: unknown,
  fallback: string,
): string {
  const message =
    cause instanceof Error
      ? cause.message
      : typeof cause === "string"
        ? cause
        : "";
  if (!message) return fallback;

  const groupChoiceLimit = message.match(
    /^Option group (.+) exceeds (?:the maximum of |the )?(\d+)(?: choices\.|-choice limit)$/,
  );
  if (groupChoiceLimit)
    return `กลุ่มตัวเลือก ID ${groupChoiceLimit[1]} มีตัวเลือกเกินจำนวนสูงสุด ${groupChoiceLimit[2]} รายการ`;

  const catalogueGroupLimit = message.match(
    /^Option catalogue exceeds the (\d+)-group limit$/,
  );
  if (catalogueGroupLimit)
    return `แคตตาล็อกมีกลุ่มตัวเลือกเกินจำนวนสูงสุด ${catalogueGroupLimit[1]} กลุ่ม`;

  const productSelectionLimit = message.match(
    /^Product (.+) exceeds the (\d+)-selection limit$/,
  );
  if (productSelectionLimit)
    return `สินค้า ID ${productSelectionLimit[1]} กำหนดจำนวนตัวเลือกสูงสุดรวมเกิน ${productSelectionLimit[2]} รายการ`;

  const messages: Record<string, string> = {
    "A name is required before creating an ID": "กรุณากรอกชื่อก่อนบันทึก",
    "Option group IDs are immutable": "ไม่สามารถเปลี่ยน ID ของกลุ่มตัวเลือกได้",
    "Choices must be archived because physical deletion is disabled":
      "ไม่สามารถลบตัวเลือกออกจากระบบได้ กรุณาเก็บถาวรแทน",
    "Choice lifecycle history cannot be reset":
      "ไม่สามารถรีเซ็ตประวัติการใช้งานของตัวเลือกได้",
    "Option catalogue contains duplicate group IDs":
      "มีกลุ่มตัวเลือกที่ใช้ ID ซ้ำกัน",
    "Option choice IDs must be globally unique":
      "มีตัวเลือกที่ใช้ ID ซ้ำกันในแคตตาล็อก",
    "Product contains duplicate option group assignments":
      "สินค้าผูกกลุ่มตัวเลือกเดียวกันซ้ำ",
    "Catalogue changed concurrently. Reload Products and try again.":
      "แคตตาล็อกมีการเปลี่ยนแปลง กรุณาโหลดหน้าสินค้าใหม่แล้วลองอีกครั้ง",
    "This option group changed concurrently. Reload and try again.":
      "กลุ่มตัวเลือกนี้มีการเปลี่ยนแปลง กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง",
    "An option group with this ID already exists":
      "มีกลุ่มตัวเลือกที่ใช้ ID นี้อยู่แล้ว",
  };
  if (messages[message]) return messages[message];

  if (/^Option group .+ has an invalid selection range$/.test(message))
    return "จำนวนเลือกสูงสุดต้องไม่น้อยกว่าจำนวนเลือกขั้นต่ำ";
  if (/^Option group .+ contains duplicate choice IDs$/.test(message))
    return "มีตัวเลือกที่ใช้ ID ซ้ำกันในกลุ่มนี้";
  if (/^Option group .+ has an invalid display name$/.test(message))
    return "กรุณากรอกชื่อกลุ่มตัวเลือกไม่เกิน 120 ตัวอักษร";
  if (/^Option group .+ has an invalid pricing mode$/.test(message))
    return "รูปแบบการกำหนดราคาของกลุ่มตัวเลือกไม่ถูกต้อง";
  if (/^Option group .+ has invalid boolean fields$/.test(message))
    return "สถานะของกลุ่มตัวเลือกไม่ถูกต้อง";
  if (/^Option choice .+ has an invalid name$/.test(message))
    return "กรุณากรอกชื่อตัวเลือกไม่เกิน 120 ตัวอักษร";
  if (/^Option choice .+ has an invalid classification$/.test(message))
    return "ประเภทตัวเลือกต้องเป็น ปกติ หรือ พรีเมียม";
  if (/^Option choice .+ has an invalid surcharge$/.test(message))
    return "ราคาเพิ่มต้องเป็นจำนวนเต็มตั้งแต่ 0 ถึง 5,000 บาท";
  if (
    /^Option choice .+ has an invalid (?:active|lifecycle) state$/.test(message)
  )
    return "สถานะการใช้งานของตัวเลือกไม่ถูกต้อง";
  if (/^Option (?:group|choice) .+ display order must be/.test(message))
    return "ลำดับการแสดงผลต้องเป็นจำนวนเต็มตั้งแต่ 0 ถึง 10,000";
  if (/^Option group .+ (?:minimum|maximum) must be/.test(message))
    return "จำนวนเลือกขั้นต่ำและสูงสุดต้องเป็นจำนวนเต็มตั้งแต่ 0 ถึง 10";
  if (/^Product .+ has invalid limits for option group .+$/.test(message))
    return "จำนวนเลือกขั้นต่ำหรือสูงสุดของกลุ่มที่ผูกกับสินค้าไม่ถูกต้อง";
  if (/^Product .+ cannot select \d+ unique choices from .+$/.test(message))
    return "จำนวนเลือกสูงสุดมากกว่าจำนวนตัวเลือกที่เลือกได้ในกลุ่ม";
  if (/^Product .+ references unknown option group .+$/.test(message))
    return "สินค้านี้อ้างอิงกลุ่มตัวเลือกที่ไม่พบในแคตตาล็อก";
  if (/^Product .+ references an unknown choice in .+$/.test(message))
    return "สินค้านี้อ้างอิงตัวเลือกที่ไม่พบในกลุ่มตัวเลือก";
  if (/^Product option assignments exceed the \d+-group limit$/.test(message))
    return "สินค้าผูกกลุ่มตัวเลือกเกินจำนวนที่กำหนด";
  if (/^Product assignment .+ has invalid choice IDs$/.test(message))
    return "รายการตัวเลือกที่ผูกกับสินค้าไม่ถูกต้อง";
  if (/^Product assignment .+ has an invalid required state$/.test(message))
    return "สถานะจำเป็นต้องเลือกที่ผูกกับสินค้าไม่ถูกต้อง";
  if (/^Product assignment .+ has invalid selection limits$/.test(message))
    return "จำนวนเลือกขั้นต่ำหรือสูงสุดที่ผูกกับสินค้าไม่ถูกต้อง";
  if (/^Product .+ has an invalid legacy selection range$/.test(message))
    return "จำนวนตัวเลือกในช่องสินค้าแบบเดิมไม่ถูกต้อง";

  return fallback;
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
  _groupId: string,
  _choice: OptionChoice,
  _products: Product[],
): HardDeleteDecision {
  return {
    allowed: false,
    reason: "Choices must be archived because physical deletion is disabled",
  };
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
