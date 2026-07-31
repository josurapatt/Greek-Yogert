import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Transaction,
  type Unsubscribe,
} from "firebase/firestore";
import { toFirestoreData } from "./firestoreData";
import {
  maxOptionGroupsPerCatalogue,
  mergeOptionGroupsWithFallback,
  publicOptionGroupsToCatalogue,
  productOptionGroupAssignments,
} from "./optionCatalogue";
import {
  assertOptionChoiceCount,
  normalizeLegacyPrivateOptionGroupDocument,
  normalizePrivateOptionChoiceDocument,
  normalizePrivateOptionGroupDocument,
  optionChoiceReadLimit,
  serializePrivateOptionChoice,
  serializePrivateOptionGroup,
} from "./optionCataloguePersistence";
import type { OptionGroup, Product, PublicOptionGroup } from "./types";

export const optionGroupReadLimit = maxOptionGroupsPerCatalogue;

export interface PrivateCatalogueWriter {
  set(reference: DocumentReference, data: DocumentData): unknown;
}

export function writePrivateOptionGroup(
  writer: PrivateCatalogueWriter,
  firestore: Firestore,
  group: OptionGroup,
  previous?: OptionGroup,
) {
  writer.set(
    doc(firestore, "optionGroups", group.id),
    toFirestoreData(serializePrivateOptionGroup(group)),
  );
  const previousChoices = new Map(
    previous?.choices.map((choice) => [choice.id, choice]) ?? [],
  );
  group.choices.forEach((choice) => {
    const prior = previousChoices.get(choice.id);
    if (prior && JSON.stringify(prior) === JSON.stringify(choice)) return;
    writer.set(
      doc(firestore, "optionGroups", group.id, "choices", choice.id),
      toFirestoreData(serializePrivateOptionChoice(choice)),
    );
  });
}

function assertDocumentIdentity(
  documentId: string,
  embeddedId: unknown,
  namespace: string,
) {
  if (embeddedId !== documentId)
    throw new Error(
      `${namespace} document ${documentId} does not match its embedded ID`,
    );
}

function publicGroupsFromDocuments(
  documents: Array<{ id: string; data(): unknown }>,
): OptionGroup[] {
  return publicOptionGroupsToCatalogue(
    documents.map((snapshot) => {
      const data = snapshot.data() as PublicOptionGroup;
      assertDocumentIdentity(snapshot.id, data?.id, "Public option group");
      return data;
    }),
  );
}

async function privateGroupFromDocument(
  firestore: Firestore,
  snapshot: { id: string; data(): unknown },
): Promise<OptionGroup> {
  const legacy = normalizeLegacyPrivateOptionGroupDocument(
    snapshot.id,
    snapshot.data(),
  );
  if (legacy) return legacy;
  const choices = await getDocs(
    query(
      collection(firestore, "optionGroups", snapshot.id, "choices"),
      orderBy("displayOrder"),
      limit(optionChoiceReadLimit),
    ),
  );
  assertOptionChoiceCount(snapshot.id, choices.docs.length);
  return normalizePrivateOptionGroupDocument(
    snapshot.id,
    snapshot.data(),
    choices.docs.map((choice) =>
      normalizePrivateOptionChoiceDocument(choice.id, choice.data()),
    ),
  );
}

export async function readPrivateOptionGroups(
  firestore: Firestore,
): Promise<OptionGroup[]> {
  const snapshot = await getDocs(
    query(
      collection(firestore, "optionGroups"),
      orderBy("displayOrder"),
      limit(optionGroupReadLimit),
    ),
  );
  return mergeOptionGroupsWithFallback(
    await Promise.all(
      snapshot.docs.map((group) => privateGroupFromDocument(firestore, group)),
    ),
  );
}

export async function readPublicOptionGroups(
  firestore: Firestore,
): Promise<OptionGroup[]> {
  const snapshot = await getDocs(
    query(
      collection(firestore, "publicOptionGroups"),
      orderBy("displayOrder"),
      limit(optionGroupReadLimit),
    ),
  );
  return publicGroupsFromDocuments(snapshot.docs);
}

export function subscribePrivateOptionGroups(
  firestore: Firestore,
  update: (groups: OptionGroup[]) => void,
  onError?: (cause: Error) => void,
): Unsubscribe {
  let childUnsubscribes: Unsubscribe[] = [];
  let generation = 0;
  const stopGroups = onSnapshot(
    query(
      collection(firestore, "optionGroups"),
      orderBy("displayOrder"),
      limit(optionGroupReadLimit),
    ),
    (snapshot) => {
      generation += 1;
      const currentGeneration = generation;
      childUnsubscribes.forEach((unsubscribe) => unsubscribe());
      childUnsubscribes = [];
      const groups = new Map<string, OptionGroup>();
      const canonical = snapshot.docs.filter((group) => {
        try {
          const legacy = normalizeLegacyPrivateOptionGroupDocument(
            group.id,
            group.data(),
          );
          if (legacy) groups.set(group.id, legacy);
          return !legacy;
        } catch (cause) {
          onError?.(
            cause instanceof Error ? cause : new Error("Invalid option group"),
          );
          return false;
        }
      });
      const pending = new Set(canonical.map((group) => group.id));
      const emit = () => {
        if (currentGeneration !== generation || pending.size) return;
        try {
          update(mergeOptionGroupsWithFallback([...groups.values()]));
        } catch (cause) {
          onError?.(
            cause instanceof Error
              ? cause
              : new Error("Invalid option catalogue"),
          );
        }
      };
      canonical.forEach((group) => {
        const unsubscribe = onSnapshot(
          query(
            collection(firestore, "optionGroups", group.id, "choices"),
            orderBy("displayOrder"),
            limit(optionChoiceReadLimit),
          ),
          (choices) => {
            try {
              assertOptionChoiceCount(group.id, choices.docs.length);
              groups.set(
                group.id,
                normalizePrivateOptionGroupDocument(
                  group.id,
                  group.data(),
                  choices.docs.map((choice) =>
                    normalizePrivateOptionChoiceDocument(
                      choice.id,
                      choice.data(),
                    ),
                  ),
                ),
              );
              pending.delete(group.id);
              emit();
            } catch (cause) {
              onError?.(
                cause instanceof Error
                  ? cause
                  : new Error("Invalid option group"),
              );
            }
          },
          (cause) => onError?.(cause),
        );
        childUnsubscribes.push(unsubscribe);
      });
      if (!canonical.length) emit();
    },
    (cause) => onError?.(cause),
  );
  return () => {
    generation += 1;
    stopGroups();
    childUnsubscribes.forEach((unsubscribe) => unsubscribe());
    childUnsubscribes = [];
  };
}

export function subscribePublicOptionGroups(
  firestore: Firestore,
  update: (groups: OptionGroup[]) => void,
  onError?: (cause: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(firestore, "publicOptionGroups"),
      orderBy("displayOrder"),
      limit(optionGroupReadLimit),
    ),
    (snapshot) => update(publicGroupsFromDocuments(snapshot.docs)),
    (cause) => onError?.(cause),
  );
}

export function optionGroupIdsForProducts(products: Product[]): string[] {
  const ids = [
    ...new Set(
      products.flatMap((product) =>
        productOptionGroupAssignments(product).map(
          (assignment) => assignment.groupId,
        ),
      ),
    ),
  ].sort();
  if (ids.length > optionGroupReadLimit)
    throw new Error(
      `Trusted confirmation exceeds the ${optionGroupReadLimit}-group read limit`,
    );
  return ids;
}

export async function readPrivateOptionGroupsInTransaction(
  firestore: Firestore,
  transaction: Transaction,
  groupIds: string[],
  selectedChoiceIds: string[] = [],
): Promise<OptionGroup[]> {
  const ids = [...new Set(groupIds)].sort();
  if (ids.length > optionGroupReadLimit)
    throw new Error(
      `Trusted confirmation exceeds the ${optionGroupReadLimit}-group read limit`,
    );
  const groupSnapshots = await Promise.all(
    ids.map((id) => transaction.get(doc(firestore, "optionGroups", id))),
  );
  const fallbackById = new Map(
    mergeOptionGroupsWithFallback([]).map((group) => [group.id, group]),
  );
  const fullGroups = new Map<string, OptionGroup>();
  const canonicalMetadata = new Map<string, unknown>();
  groupSnapshots.forEach((snapshot, index) => {
    const id = ids[index];
    if (!snapshot.exists()) {
      const fallback = fallbackById.get(id);
      if (fallback) fullGroups.set(id, fallback);
      return;
    }
    const legacy = normalizeLegacyPrivateOptionGroupDocument(
      id,
      snapshot.data(),
    );
    if (legacy) fullGroups.set(id, legacy);
    else canonicalMetadata.set(id, snapshot.data());
  });

  const canonicalIds = [...canonicalMetadata.keys()];
  const canonicalChoiceSnapshots = await Promise.all(
    canonicalIds.map(async (id) => {
      const choices = await getDocs(
        query(
          collection(firestore, "optionGroups", id, "choices"),
          orderBy("displayOrder"),
          limit(optionChoiceReadLimit),
        ),
      );
      assertOptionChoiceCount(id, choices.docs.length);
      return { id, choices: choices.docs };
    }),
  );
  const choicesByGroup = new Map<
    string,
    ReturnType<typeof normalizePrivateOptionChoiceDocument>[]
  >();
  await Promise.all(
    canonicalChoiceSnapshots.flatMap(({ id, choices }) =>
      choices.map(async (choice) => {
        const current = await transaction.get(
          doc(firestore, "optionGroups", id, "choices", choice.id),
        );
        if (!current.exists())
          throw new Error(
            `Trusted confirmation cannot read option choice ${choice.id}`,
          );
        const normalized = normalizePrivateOptionChoiceDocument(
          choice.id,
          current.data(),
        );
        const groupChoices = choicesByGroup.get(id) ?? [];
        groupChoices.push(normalized);
        choicesByGroup.set(id, groupChoices);
      }),
    ),
  );
  canonicalMetadata.forEach((metadata, id) =>
    fullGroups.set(
      id,
      normalizePrivateOptionGroupDocument(
        id,
        metadata,
        choicesByGroup.get(id) ?? [],
      ),
    ),
  );
  const groups = mergeOptionGroupsWithFallback([...fullGroups.values()]);
  const selected = [...new Set(selectedChoiceIds)].sort();
  selected.forEach((choiceId) => {
    const matches = groups.filter((group) =>
      group.choices.some((choice) => choice.id === choiceId),
    );
    if (matches.length !== 1)
      throw new Error(
        `Trusted confirmation cannot resolve option choice ${choiceId}`,
      );
  });
  return groups;
}
