import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
  type Firestore,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { waitingForShop } from "./customerOrder";
import type { CustomerOrderRequest, ShopOrder } from "./types";
import { hydrateCustomerRequest } from "./customerRequestChunks";

export const staffPageSize = 50;
export const reportPageSize = 250;
export const reportOrderCap = 5_000;

export interface CursorPage<T> {
  rows: T[];
  cursor: QueryDocumentSnapshot | null;
  hasMore: boolean;
}

function timestampMillis(value: unknown): number | null {
  if (value && typeof value === "object") {
    const millis = (value as { toMillis?: () => number }).toMillis?.();
    if (typeof millis === "number") return millis;
  }
  if (typeof value === "string") {
    const millis = Date.parse(value);
    return Number.isNaN(millis) ? null : millis;
  }
  return null;
}

export function customerRequestTime(request: CustomerOrderRequest): number {
  return (
    timestampMillis(request.submittedAt) ??
    timestampMillis(request.createdAt) ??
    0
  );
}

function uniqueById<T extends { id: string }>(values: T[]): T[] {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}

export function subscribePendingOrders(
  firestore: Firestore,
  onRows: (rows: ShopOrder[], incomplete: boolean) => void,
  onError: (error: Error) => void = () => undefined,
) {
  let active = true;
  const pendingQuery = query(
    collection(firestore, "orders"),
    where("status", "==", "pending"),
    orderBy("createdAt", "asc"),
    limit(staffPageSize),
  );
  const unsubscribe = onSnapshot(
    pendingQuery,
    (snapshot) => {
      if (!active) return;
      onRows(
        snapshot.docs.map((entry) => entry.data() as ShopOrder),
        snapshot.size === staffPageSize,
      );
    },
    (cause) => active && onError(cause),
  );
  return () => {
    active = false;
    unsubscribe();
  };
}

export function subscribePendingCustomerRequests(
  firestore: Firestore,
  onRows: (rows: CustomerOrderRequest[], incomplete: boolean) => void,
  onError: (error: Error) => void = () => undefined,
) {
  let active = true;
  let v2Rows: CustomerOrderRequest[] = [];
  let legacyRows: CustomerOrderRequest[] = [];
  let v2Full = false;
  let legacyFull = false;
  const emit = () => {
    if (!active) return;
    const rows = uniqueById([...v2Rows, ...legacyRows]).sort(
      (left, right) => customerRequestTime(left) - customerRequestTime(right),
    );
    onRows(rows, v2Full || legacyFull);
  };
  const v2Query = query(
    collection(firestore, "customerOrderRequests"),
    where("status", "==", waitingForShop),
    orderBy("submittedAt", "asc"),
    limit(staffPageSize),
  );
  const legacyQuery = query(
    collection(firestore, "customerOrderRequests"),
    where("status", "==", waitingForShop),
    orderBy("createdAt", "asc"),
    limit(staffPageSize),
  );
  const stopV2 = onSnapshot(
    v2Query,
    (snapshot) => {
      void Promise.all(
        snapshot.docs.map((entry) =>
          hydrateCustomerRequest(
            firestore,
            entry.data() as CustomerOrderRequest,
          ),
        ),
      )
        .then((rows) => {
          if (!active) return;
          v2Rows = rows;
          v2Full = snapshot.size === staffPageSize;
          emit();
        })
        .catch((cause) => active && onError(cause));
    },
    (cause) => active && onError(cause),
  );
  const stopLegacy = onSnapshot(
    legacyQuery,
    (snapshot) => {
      void Promise.all(
        snapshot.docs.map((entry) =>
          hydrateCustomerRequest(
            firestore,
            entry.data() as CustomerOrderRequest,
          ),
        ),
      )
        .then((rows) => {
          if (!active) return;
          legacyRows = rows;
          legacyFull = snapshot.size === staffPageSize;
          emit();
        })
        .catch((cause) => active && onError(cause));
    },
    (cause) => active && onError(cause),
  );
  return () => {
    active = false;
    stopV2();
    stopLegacy();
  };
}

export async function getOrderById(
  firestore: Firestore,
  id: string,
): Promise<ShopOrder | null> {
  const snapshot = await getDoc(doc(firestore, "orders", id));
  return snapshot.exists() ? (snapshot.data() as ShopOrder) : null;
}

export async function getCustomerRequestById(
  firestore: Firestore,
  id: string,
): Promise<CustomerOrderRequest | null> {
  const snapshot = await getDoc(doc(firestore, "customerOrderRequests", id));
  return snapshot.exists()
    ? hydrateCustomerRequest(firestore, snapshot.data() as CustomerOrderRequest)
    : null;
}

export async function loadHistoryPage(
  firestore: Firestore,
  input: {
    status: "all" | "completed" | "cancelled";
    businessDate?: string;
    cursor?: QueryDocumentSnapshot | null;
  },
): Promise<CursorPage<ShopOrder>> {
  const constraints: QueryConstraint[] = [
    input.status === "all"
      ? where("status", "in", ["completed", "cancelled"])
      : where("status", "==", input.status),
  ];
  if (input.businessDate)
    constraints.push(where("businessDate", "==", input.businessDate));
  constraints.push(orderBy("createdAt", "desc"));
  if (input.cursor) constraints.push(startAfter(input.cursor));
  constraints.push(limit(staffPageSize));
  const snapshot = await getDocs(
    query(collection(firestore, "orders"), ...constraints),
  );
  return {
    rows: snapshot.docs.map((entry) => entry.data() as ShopOrder),
    cursor: snapshot.docs.at(-1) ?? null,
    hasMore: snapshot.size === staffPageSize,
  };
}

async function loadReportStatus(
  firestore: Firestore,
  status: "completed" | "cancelled",
  start: string,
  end: string,
): Promise<{ rows: ShopOrder[]; capped: boolean }> {
  const rows: ShopOrder[] = [];
  let cursor: QueryDocumentSnapshot | null = null;
  while (rows.length < reportOrderCap) {
    const constraints: QueryConstraint[] = [
      where("status", "==", status),
      where("businessDate", ">=", start),
      where("businessDate", "<=", end),
      orderBy("businessDate", "asc"),
      orderBy("createdAt", "desc"),
    ];
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(reportPageSize));
    const snapshot = await getDocs(
      query(collection(firestore, "orders"), ...constraints),
    );
    rows.push(...snapshot.docs.map((entry) => entry.data() as ShopOrder));
    cursor = snapshot.docs.at(-1) ?? null;
    if (snapshot.size < reportPageSize) return { rows, capped: false };
  }
  return { rows: rows.slice(0, reportOrderCap), capped: true };
}

export async function loadReportOrders(
  firestore: Firestore,
  start: string,
  end: string,
): Promise<{ rows: ShopOrder[]; complete: boolean }> {
  const [completed, cancelled] = await Promise.all([
    loadReportStatus(firestore, "completed", start, end),
    loadReportStatus(firestore, "cancelled", start, end),
  ]);
  const rows = uniqueById([...completed.rows, ...cancelled.rows]).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  return {
    rows: rows.slice(0, reportOrderCap),
    complete:
      !completed.capped && !cancelled.capped && rows.length <= reportOrderCap,
  };
}

export async function loadAllOrdersForBackup(
  firestore: Firestore,
): Promise<{ rows: ShopOrder[]; complete: boolean }> {
  const rows: ShopOrder[] = [];
  let cursor: QueryDocumentSnapshot | null = null;
  while (rows.length < reportOrderCap) {
    const constraints: QueryConstraint[] = [orderBy("createdAt", "desc")];
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(reportPageSize));
    const snapshot = await getDocs(
      query(collection(firestore, "orders"), ...constraints),
    );
    rows.push(...snapshot.docs.map((entry) => entry.data() as ShopOrder));
    cursor = snapshot.docs.at(-1) ?? null;
    if (snapshot.size < reportPageSize) return { rows, complete: true };
  }
  return { rows: rows.slice(0, reportOrderCap), complete: false };
}

export async function loadLatestRequests(
  firestore: Firestore,
  count = 40,
): Promise<CustomerOrderRequest[]> {
  const [v2, legacy] = await Promise.all([
    getDocs(
      query(
        collection(firestore, "customerOrderRequests"),
        orderBy("submittedAt", "desc"),
        limit(count),
      ),
    ),
    getDocs(
      query(
        collection(firestore, "customerOrderRequests"),
        orderBy("createdAt", "desc"),
        limit(count),
      ),
    ),
  ]);
  return uniqueById(
    [...v2.docs, ...legacy.docs].map(
      (entry) => entry.data() as CustomerOrderRequest,
    ),
  )
    .sort((a, b) => customerRequestTime(b) - customerRequestTime(a))
    .slice(0, count);
}
