import { beforeEach, describe, expect, it, vi } from "vitest";
import { fallbackOptionGroups } from "./optionCatalogue";
import type { OptionGroup } from "./types";

const firestoreMocks = vi.hoisted(() => ({
  collection: vi.fn((_firestore: unknown, name: string) => name),
  doc: vi.fn((_firestore: unknown, ...segments: string[]) =>
    segments.join("/"),
  ),
  getDocs: vi.fn(),
  limit: vi.fn((value: number) => ({ type: "limit", value })),
  onSnapshot: vi.fn(),
  orderBy: vi.fn((field: string) => ({ type: "orderBy", field })),
  query: vi.fn((...parts: unknown[]) => ({ parts })),
}));

vi.mock("firebase/firestore", () => firestoreMocks);

import {
  optionGroupReadLimit,
  readPrivateOptionGroups,
  readPrivateOptionGroupsInTransaction,
  subscribePublicOptionGroups,
} from "./optionCatalogueRepository";

const customGroup: OptionGroup = {
  id: "custom",
  displayName: "Custom",
  active: true,
  displayOrder: 1,
  required: false,
  minSelections: 0,
  maxSelections: 1,
  allowDuplicates: false,
  pricingMode: "choice-surcharge",
  choices: [],
};

const snapshot = (id: string, value: unknown) => ({
  id,
  exists: () => value !== undefined,
  data: () => value,
});

describe("bounded option catalogue repositories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads private groups with an explicit bounded ordered query and compatibility fallback", async () => {
    firestoreMocks.getDocs.mockResolvedValue({
      docs: [snapshot("custom", customGroup)],
    });
    const groups = await readPrivateOptionGroups({} as never);
    expect(firestoreMocks.limit).toHaveBeenCalledWith(optionGroupReadLimit);
    expect(firestoreMocks.orderBy).toHaveBeenCalledWith("displayOrder");
    expect(groups.map((group) => group.id)).toEqual([
      "custom",
      "toppings",
      "granola-flavour",
    ]);
  });

  it("keeps persisted lifecycle state authoritative while filling only missing fallback groups", async () => {
    const inactiveToppings = {
      ...fallbackOptionGroups.find((group) => group.id === "toppings")!,
      active: false,
    };
    firestoreMocks.getDocs.mockResolvedValue({
      docs: [snapshot("toppings", inactiveToppings)],
    });

    const groups = await readPrivateOptionGroups({} as never);

    expect(groups.find((group) => group.id === "toppings")).toMatchObject({
      id: "toppings",
      active: false,
    });
    expect(groups.map((group) => group.id)).toEqual([
      "toppings",
      "granola-flavour",
    ]);
  });

  it("subscribes to public groups with the same limit and strips private lifecycle dependence", () => {
    const update = vi.fn();
    firestoreMocks.onSnapshot.mockImplementation(
      (_query: unknown, next: (value: unknown) => void) => {
        next({
          docs: [
            snapshot("custom", {
              ...customGroup,
              choices: [],
            }),
          ],
        });
        return vi.fn();
      },
    );
    subscribePublicOptionGroups({} as never, update);
    expect(firestoreMocks.limit).toHaveBeenCalledWith(optionGroupReadLimit);
    expect(update).toHaveBeenCalledOnce();
    expect(
      update.mock.calls[0][0].map((group: OptionGroup) => group.id),
    ).toEqual(["custom", "toppings", "granola-flavour"]);
  });

  it("bounds exact trusted-confirmation reads and falls back only for missing committed groups", async () => {
    const transaction = {
      get: vi.fn(async (path: string) =>
        path.endsWith("/custom")
          ? snapshot("custom", customGroup)
          : snapshot(path.split("/").at(-1)!, undefined),
      ),
    };
    const groups = await readPrivateOptionGroupsInTransaction(
      {} as never,
      transaction as never,
      ["custom", "toppings"],
    );
    expect(transaction.get).toHaveBeenCalledTimes(2);
    expect(groups.map((group) => group.id)).toContain("custom");
    expect(groups.map((group) => group.id)).toContain("toppings");
    await expect(
      readPrivateOptionGroupsInTransaction(
        {} as never,
        transaction as never,
        Array.from(
          { length: optionGroupReadLimit + 1 },
          (_, index) => `group-${index}`,
        ),
      ),
    ).rejects.toThrow("read limit");
  });
});
