import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Firestore,
  type Transaction,
  type Unsubscribe,
} from "firebase/firestore";
import {
  maxOptionGroupsPerCatalogue,
  mergeOptionGroupsWithFallback,
  normalizeOptionGroup,
  publicOptionGroupsToCatalogue,
  productOptionGroupAssignments,
} from "./optionCatalogue";
import type { OptionGroup, Product, PublicOptionGroup } from "./types";

export const optionGroupReadLimit = maxOptionGroupsPerCatalogue;

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

function privateGroupsFromDocuments(
  documents: Array<{ id: string; data(): unknown }>,
): OptionGroup[] {
  return mergeOptionGroupsWithFallback(
    documents.map((snapshot) => {
      const data = snapshot.data() as OptionGroup;
      assertDocumentIdentity(snapshot.id, data?.id, "Private option group");
      return normalizeOptionGroup(data);
    }),
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
  return privateGroupsFromDocuments(snapshot.docs);
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
  return onSnapshot(
    query(
      collection(firestore, "optionGroups"),
      orderBy("displayOrder"),
      limit(optionGroupReadLimit),
    ),
    (snapshot) => update(privateGroupsFromDocuments(snapshot.docs)),
    (cause) => onError?.(cause),
  );
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
): Promise<OptionGroup[]> {
  const ids = [...new Set(groupIds)].sort();
  if (ids.length > optionGroupReadLimit)
    throw new Error(
      `Trusted confirmation exceeds the ${optionGroupReadLimit}-group read limit`,
    );
  const snapshots = await Promise.all(
    ids.map((id) => transaction.get(doc(firestore, "optionGroups", id))),
  );
  return privateGroupsFromDocuments(
    snapshots.flatMap((snapshot, index) => {
      if (!snapshot.exists()) return [];
      return [
        {
          id: ids[index],
          data: () => snapshot.data(),
        },
      ];
    }),
  );
}
