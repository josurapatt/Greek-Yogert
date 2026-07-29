import { normalizeOptionChoice, normalizeOptionGroup } from "./optionCatalogue";
import type { OptionChoice, OptionGroup } from "./types";

export type PersistedPrivateOptionGroup = Omit<OptionGroup, "choices">;
export type PersistedPrivateOptionChoice = Omit<OptionChoice, "id">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function serializePrivateOptionGroup(
  group: OptionGroup,
): PersistedPrivateOptionGroup {
  const { choices: _choices, ...metadata } = normalizeOptionGroup(group);
  void _choices;
  return metadata;
}

export function serializePrivateOptionChoice(
  choice: OptionChoice,
): PersistedPrivateOptionChoice {
  const { id: _id, ...persisted } = normalizeOptionChoice(choice);
  void _id;
  return persisted;
}

export function normalizePrivateOptionChoiceDocument(
  choiceId: string,
  value: unknown,
): OptionChoice {
  if (!isRecord(value))
    throw new Error(`Private option choice ${choiceId} must be a map`);
  if ("id" in value)
    throw new Error(
      `Private option choice ${choiceId} must use its document ID as identity`,
    );
  return normalizeOptionChoice({
    ...value,
    id: choiceId,
  } as unknown as OptionChoice);
}

export function normalizePrivateOptionGroupDocument(
  groupId: string,
  value: unknown,
  choices: OptionChoice[],
): OptionGroup {
  if (!isRecord(value))
    throw new Error(`Private option group ${groupId} must be a map`);
  if (value.id !== groupId)
    throw new Error(
      `Private option group document ${groupId} does not match its embedded ID`,
    );
  if ("choices" in value)
    throw new Error(
      `Private option group ${groupId} must not embed mutable choices`,
    );
  return normalizeOptionGroup({
    ...value,
    choices,
  } as unknown as OptionGroup);
}

export function normalizeLegacyPrivateOptionGroupDocument(
  groupId: string,
  value: unknown,
): OptionGroup | undefined {
  if (!isRecord(value) || !Array.isArray(value.choices)) return undefined;
  if (value.id !== groupId)
    throw new Error(
      `Private option group document ${groupId} does not match its embedded ID`,
    );
  return normalizeOptionGroup(value as unknown as OptionGroup);
}
