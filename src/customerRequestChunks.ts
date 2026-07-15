import {
  doc,
  getDoc,
  type Firestore,
  type Transaction,
} from "firebase/firestore";
import type { CartItem, CustomerOrderRequest } from "./types";

export const customerRequestItemsPerGroup = 6;
export const customerRequestMaxItems = 12;

export interface CustomerRequestItemDocument {
  schemaVersion: 2;
  requestId: string;
  ownerUid: string;
  itemIndex: number;
  item: CartItem;
  quantity: number;
  lineTotal: number;
}

export interface CustomerRequestItemGroup {
  schemaVersion: 2;
  requestId: string;
  ownerUid: string;
  groupIndex: number;
  itemIds: string[];
  lineCount: number;
  itemCount: number;
  subtotal: number;
}

export interface PersistedCustomerRequestV2
  extends Omit<CustomerOrderRequest, "items" | "submittedAt"> {
  schemaVersion: 2;
  retryId: string;
  lineCount: number;
  itemIds: string[];
  itemGroupIds: string[];
  submittedAt: unknown;
}

const itemDocumentId = (index: number) => String(index).padStart(2, "0");

export function splitCustomerRequestForWrite(request: CustomerOrderRequest): {
  parent: Omit<PersistedCustomerRequestV2, "submittedAt">;
  itemDocuments: Array<{ id: string; value: CustomerRequestItemDocument }>;
  groups: Array<{ id: string; value: CustomerRequestItemGroup }>;
} {
  if (request.schemaVersion !== 2 || request.retryId !== request.id)
    throw new Error("คำขอไม่ใช่ schema V2");
  if (!request.items.length || request.items.length > customerRequestMaxItems)
    throw new Error("จำนวนรายการสินค้าไม่ถูกต้อง");
  const itemDocuments = request.items.map((item, itemIndex) => ({
    id: itemDocumentId(itemIndex),
    value: {
      schemaVersion: 2 as const,
      requestId: request.id,
      ownerUid: request.ownerUid,
      itemIndex,
      item,
      quantity: item.quantity,
      lineTotal: item.lineTotal ?? item.unitPrice * item.quantity,
    },
  }));
  const groups: Array<{ id: string; value: CustomerRequestItemGroup }> = [];
  for (
    let start = 0;
    start < itemDocuments.length;
    start += customerRequestItemsPerGroup
  ) {
    const entries = itemDocuments.slice(
      start,
      start + customerRequestItemsPerGroup,
    );
    const groupIndex = groups.length;
    groups.push({
      id: String(groupIndex),
      value: {
        schemaVersion: 2,
        requestId: request.id,
        ownerUid: request.ownerUid,
        groupIndex,
        itemIds: entries.map((entry) => entry.id),
        lineCount: entries.length,
        itemCount: entries.reduce(
          (sum, entry) => sum + entry.value.quantity,
          0,
        ),
        subtotal: entries.reduce(
          (sum, entry) => sum + entry.value.lineTotal,
          0,
        ),
      },
    });
  }
  const {
    items: _items,
    submittedAt: _submittedAt,
    ...requestFields
  } = request;
  void _items;
  void _submittedAt;
  return {
    parent: {
      ...requestFields,
      schemaVersion: 2,
      retryId: request.id,
      lineCount: request.items.length,
      itemIds: itemDocuments.map((entry) => entry.id),
      itemGroupIds: groups.map((entry) => entry.id),
    },
    itemDocuments,
    groups,
  };
}

export function hydrateCustomerRequestDocuments(
  parent: PersistedCustomerRequestV2,
  entries: Array<{ id: string; value: CustomerRequestItemDocument }>,
): CustomerOrderRequest {
  const values = [...entries].sort(
    (left, right) => left.value.itemIndex - right.value.itemIndex,
  );
  if (
    parent.itemIds.length !== parent.lineCount ||
    values.some(
      (entry, index) =>
        entry.id !== parent.itemIds[index] ||
        entry.value.schemaVersion !== 2 ||
        entry.value.requestId !== parent.id ||
        entry.value.ownerUid !== parent.ownerUid ||
        entry.value.itemIndex !== index ||
        entry.value.quantity !== entry.value.item.quantity ||
        entry.value.lineTotal !== entry.value.item.lineTotal,
    )
  )
    throw new Error("ข้อมูลเอกสารรายการสินค้าไม่ตรงกับคำขอ");
  const items = values.map((entry) => entry.value.item);
  if (
    items.length !== parent.lineCount ||
    items.reduce((sum, item) => sum + item.quantity, 0) !== parent.itemCount ||
    items.reduce(
      (sum, item) => sum + (item.lineTotal ?? item.unitPrice * item.quantity),
      0,
    ) !== parent.subtotal
  )
    throw new Error("ข้อมูลรายการสินค้าไม่ตรงกับคำขอ");
  const {
    lineCount: _lineCount,
    itemIds: _itemIds,
    itemGroupIds: _itemGroupIds,
    ...request
  } = parent;
  void _lineCount;
  void _itemIds;
  void _itemGroupIds;
  return { ...request, items };
}

export async function hydrateCustomerRequest(
  firestore: Firestore,
  value: CustomerOrderRequest | PersistedCustomerRequestV2,
): Promise<CustomerOrderRequest> {
  if (value.schemaVersion !== 2 || "items" in value)
    return value as CustomerOrderRequest;
  const parent = value as PersistedCustomerRequestV2;
  if (
    parent.retryId !== parent.id ||
    !parent.submittedAt ||
    !Number.isInteger(parent.lineCount) ||
    !Array.isArray(parent.itemIds) ||
    parent.itemIds.length !== parent.lineCount ||
    parent.itemIds.length < 1 ||
    parent.itemIds.length > customerRequestMaxItems ||
    !Array.isArray(parent.itemGroupIds) ||
    parent.itemGroupIds.length < 1 ||
    parent.itemGroupIds.length > 2
  )
    throw new Error("ข้อมูลรายการสินค้าไม่ครบ");
  const snapshots = await Promise.all(
    parent.itemIds.map((itemId) =>
      getDoc(
        doc(firestore, "customerOrderRequests", parent.id, "items", itemId),
      ),
    ),
  );
  if (snapshots.some((snapshot) => !snapshot.exists()))
    throw new Error("ข้อมูลรายการสินค้าไม่ครบ");
  return hydrateCustomerRequestDocuments(
    parent,
    snapshots.map((snapshot) => ({
      id: snapshot.id,
      value: snapshot.data() as CustomerRequestItemDocument,
    })),
  );
}

export async function hydrateCustomerRequestInTransaction(
  firestore: Firestore,
  transaction: Transaction,
  value: CustomerOrderRequest | PersistedCustomerRequestV2,
): Promise<CustomerOrderRequest> {
  if (value.schemaVersion !== 2 || "items" in value)
    return value as CustomerOrderRequest;
  const parent = value as PersistedCustomerRequestV2;
  const snapshots = await Promise.all(
    parent.itemIds.map((itemId) =>
      transaction.get(
        doc(firestore, "customerOrderRequests", parent.id, "items", itemId),
      ),
    ),
  );
  if (snapshots.some((snapshot) => !snapshot.exists()))
    throw new Error("ข้อมูลรายการสินค้าไม่ครบ");
  return hydrateCustomerRequestDocuments(
    parent,
    snapshots.map((snapshot) => ({
      id: snapshot.id,
      value: snapshot.data() as CustomerRequestItemDocument,
    })),
  );
}
