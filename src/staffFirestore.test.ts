import { beforeEach, describe, expect, it, vi } from "vitest";

const firestoreMocks = vi.hoisted(() => ({
  subscriptions: [] as Array<{
    next: (snapshot: unknown) => void;
    unsubscribe: ReturnType<typeof vi.fn>;
  }>,
  collection: vi.fn((_firestore: unknown, ...segments: string[]) => ({
    path: segments.join("/"),
  })),
  doc: vi.fn((_firestore: unknown, ...segments: string[]) => ({
    path: segments.join("/"),
  })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn((value: number) => ({ kind: "limit", value })),
  onSnapshot: vi.fn(
    (
      _query: unknown,
      next: (snapshot: unknown) => void,
      _error?: (cause: Error) => void,
    ) => {
      const unsubscribe = vi.fn();
      firestoreMocks.subscriptions.push({ next, unsubscribe });
      return unsubscribe;
    },
  ),
  orderBy: vi.fn((field: string, direction?: string) => ({
    kind: "orderBy",
    field,
    direction,
  })),
  query: vi.fn((source: unknown, ...constraints: unknown[]) => ({
    source,
    constraints,
  })),
  startAfter: vi.fn((cursor: unknown) => ({ kind: "startAfter", cursor })),
  where: vi.fn((field: string, operator: string, value: unknown) => ({
    kind: "where",
    field,
    operator,
    value,
  })),
}));

vi.mock("firebase/firestore", () => firestoreMocks);

import {
  loadAllOrdersForBackup,
  loadHistoryPage,
  subscribePendingOrders,
} from "./staffFirestore";

const firestore = {} as never;

function order(id: string) {
  return {
    id,
    status: "pending",
    createdAt: "2026-07-15T00:00:00.000Z",
    businessDate: "2026-07-15",
  };
}

function document(id: string, value = order(id)) {
  return { id, data: () => value };
}

describe("bounded Staff Firestore access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreMocks.subscriptions.length = 0;
  });

  it("unsubscribes and suppresses callbacks after listener cleanup", () => {
    const onRows = vi.fn();
    const stop = subscribePendingOrders(firestore, onRows);
    const subscription = firestoreMocks.subscriptions[0];
    subscription.next({ docs: [document("one")], size: 1 });
    expect(onRows).toHaveBeenCalledOnce();
    stop();
    subscription.next({ docs: [document("two")], size: 1 });
    expect(onRows).toHaveBeenCalledOnce();
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it("uses a 50-row cursor and adds startAfter on the next History page", async () => {
    const docs = Array.from({ length: 50 }, (_, index) =>
      document(`order-${index}`),
    );
    firestoreMocks.getDocs.mockResolvedValue({ docs, size: docs.length });
    const first = await loadHistoryPage(firestore, { status: "all" });
    expect(first.rows).toHaveLength(50);
    expect(first.hasMore).toBe(true);
    expect(first.cursor).toBe(docs.at(-1));
    await loadHistoryPage(firestore, {
      status: "all",
      cursor: first.cursor,
    });
    const constraints = firestoreMocks.query.mock.calls
      .at(-1)
      ?.slice(1) as Array<{ kind?: string }>;
    expect(constraints.some((entry) => entry.kind === "startAfter")).toBe(true);
    expect(constraints.at(-1)).toEqual({ kind: "limit", value: 50 });
  });

  it("marks a 5,000-order backup as incomplete instead of presenting a partial file", async () => {
    let page = 0;
    firestoreMocks.getDocs.mockImplementation(async () => {
      const docs = Array.from({ length: 250 }, (_, index) =>
        document(`page-${page}-order-${index}`),
      );
      page += 1;
      return { docs, size: docs.length };
    });
    const result = await loadAllOrdersForBackup(firestore);
    expect(result.rows).toHaveLength(5_000);
    expect(result.complete).toBe(false);
    expect(firestoreMocks.getDocs).toHaveBeenCalledTimes(20);
  });
});
