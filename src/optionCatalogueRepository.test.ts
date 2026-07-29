import { beforeEach, describe, expect, it, vi } from "vitest";
import { fallbackOptionGroups } from "./optionCatalogue";
import type { OptionGroup } from "./types";

const firestoreMocks = vi.hoisted(() => ({
  collection: vi.fn((_firestore: unknown, ...segments: string[]) =>
    segments.join("/"),
  ),
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
  subscribePrivateOptionGroups,
  subscribePublicOptionGroups,
  writePrivateOptionGroup,
} from "./optionCatalogueRepository";
import {
  serializePrivateOptionChoice,
  serializePrivateOptionGroup,
  optionChoiceReadLimit,
} from "./optionCataloguePersistence";

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

const customChoice = {
  id: "choice",
  name: "Choice",
  active: true,
  displayOrder: 0,
  classification: "normal" as const,
  surcharge: 0,
  everUsed: false,
};

const snapshot = (id: string, value: unknown) => ({
  id,
  exists: () => value !== undefined,
  data: () => value,
});

const choiceDocuments = (count: number) =>
  Array.from({ length: count }, (_, index) => {
    const id = `choice-${String(index).padStart(2, "0")}`;
    return snapshot(
      id,
      serializePrivateOptionChoice({
        ...customChoice,
        id,
        displayOrder: index,
      }),
    );
  });

describe("bounded option catalogue repositories", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes canonical metadata and path-identified Choice documents without embedded mutable authority", () => {
    const writer = { set: vi.fn() };
    const group = { ...customGroup, choices: [customChoice] };

    writePrivateOptionGroup(writer as never, {} as never, group);

    expect(writer.set.mock.calls).toEqual([
      ["optionGroups/custom", serializePrivateOptionGroup(group)],
      [
        "optionGroups/custom/choices/choice",
        serializePrivateOptionChoice(customChoice),
      ],
    ]);
    expect(writer.set.mock.calls[0][1]).not.toHaveProperty("choices");
    expect(writer.set.mock.calls[1][1]).not.toHaveProperty("id");
  });

  it("rejects a 51st application-managed Choice before any persistence write", () => {
    const writer = { set: vi.fn() };
    const overflow = Array.from({ length: 51 }, (_, index) => ({
      ...customChoice,
      id: `choice-${index}`,
      displayOrder: index,
    }));

    expect(() =>
      writePrivateOptionGroup(writer as never, {} as never, {
        ...customGroup,
        choices: overflow,
      }),
    ).toThrow("Option group custom exceeds the 50-choice limit");
    expect(writer.set).not.toHaveBeenCalled();
  });

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

  it("combines canonical group metadata with bounded Choice subcollection documents", async () => {
    const canonical = { ...customGroup, choices: [customChoice] };
    firestoreMocks.getDocs
      .mockResolvedValueOnce({
        docs: [snapshot("custom", serializePrivateOptionGroup(canonical))],
      })
      .mockResolvedValueOnce({
        docs: [snapshot("choice", serializePrivateOptionChoice(customChoice))],
      });

    const groups = await readPrivateOptionGroups({} as never);

    expect(firestoreMocks.collection).toHaveBeenCalledWith(
      {},
      "optionGroups",
      "custom",
      "choices",
    );
    expect(groups.find((group) => group.id === "custom")?.choices).toEqual([
      customChoice,
    ]);
    expect(firestoreMocks.limit).toHaveBeenCalledWith(optionChoiceReadLimit);
  });

  it("reads all 50 Choices and rejects a 51st sentinel without truncating", async () => {
    const metadata = serializePrivateOptionGroup(customGroup);
    firestoreMocks.getDocs
      .mockResolvedValueOnce({
        docs: [snapshot("custom", metadata)],
      })
      .mockResolvedValueOnce({
        docs: choiceDocuments(50),
      });

    const groups = await readPrivateOptionGroups({} as never);

    expect(groups.find((group) => group.id === "custom")?.choices).toHaveLength(
      50,
    );
    expect(firestoreMocks.limit).toHaveBeenCalledWith(optionChoiceReadLimit);

    firestoreMocks.getDocs
      .mockResolvedValueOnce({
        docs: [snapshot("custom", metadata)],
      })
      .mockResolvedValueOnce({
        docs: choiceDocuments(optionChoiceReadLimit),
      });

    await expect(readPrivateOptionGroups({} as never)).rejects.toThrow(
      "Option group custom exceeds the maximum of 50 choices.",
    );
  });

  it("subscribes to canonical group and Choice documents as one ordered domain catalogue", () => {
    const canonical = { ...customGroup, choices: [customChoice] };
    const stops = [vi.fn(), vi.fn()];
    firestoreMocks.onSnapshot.mockImplementation(
      (source: { parts: unknown[] }, next: (value: unknown) => void) => {
        const path = source.parts[0];
        if (path === "optionGroups")
          next({
            docs: [snapshot("custom", serializePrivateOptionGroup(canonical))],
          });
        else
          next({
            docs: [
              snapshot("choice", serializePrivateOptionChoice(customChoice)),
            ],
          });
        return stops.shift()!;
      },
    );
    const update = vi.fn();

    const unsubscribe = subscribePrivateOptionGroups({} as never, update);

    expect(update).toHaveBeenCalledOnce();
    expect(
      update.mock.calls[0][0].find(
        (group: OptionGroup) => group.id === "custom",
      ).choices,
    ).toEqual([customChoice]);
    unsubscribe();
  });

  it("preserves the last valid subscription catalogue during overflow and recovers", () => {
    let childNext: ((value: unknown) => void) | undefined;
    firestoreMocks.onSnapshot.mockImplementation(
      (source: { parts: unknown[] }, next: (value: unknown) => void) => {
        if (source.parts[0] === "optionGroups")
          next({
            docs: [
              snapshot("custom", serializePrivateOptionGroup(customGroup)),
            ],
          });
        else {
          childNext = next;
          next({ docs: choiceDocuments(50) });
        }
        return vi.fn();
      },
    );
    const update = vi.fn();
    const onError = vi.fn();
    const unsubscribe = subscribePrivateOptionGroups(
      {} as never,
      update,
      onError,
    );

    expect(update).toHaveBeenCalledOnce();
    expect(
      update.mock.calls[0][0].find(
        (group: OptionGroup) => group.id === "custom",
      ).choices,
    ).toHaveLength(50);

    childNext?.({ docs: choiceDocuments(optionChoiceReadLimit) });
    expect(onError).toHaveBeenCalledWith(
      new Error("Option group custom exceeds the maximum of 50 choices."),
    );
    expect(update).toHaveBeenCalledOnce();

    childNext?.({ docs: choiceDocuments(50) });
    expect(update).toHaveBeenCalledTimes(2);
    expect(
      update.mock.calls[1][0].find(
        (group: OptionGroup) => group.id === "custom",
      ).choices,
    ).toHaveLength(50);
    unsubscribe();
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

  it("uses the complete canonical Choice preflight during trusted reads", async () => {
    const canonical = { ...customGroup, choices: [customChoice] };
    const paths: string[] = [];
    firestoreMocks.getDocs.mockResolvedValueOnce({
      docs: [snapshot("choice", serializePrivateOptionChoice(customChoice))],
    });
    const transaction = {
      get: vi.fn(async (path: string) => {
        paths.push(path);
        if (path === "optionGroups/custom")
          return snapshot("custom", serializePrivateOptionGroup(canonical));
        if (path === "optionGroups/custom/choices/choice")
          return snapshot("choice", serializePrivateOptionChoice(customChoice));
        return snapshot(path.split("/").at(-1)!, undefined);
      }),
    };

    const groups = await readPrivateOptionGroupsInTransaction(
      {} as never,
      transaction as never,
      ["custom"],
      ["choice"],
    );

    expect(paths).toEqual([
      "optionGroups/custom",
      "optionGroups/custom/choices/choice",
    ]);
    expect(groups.find((group) => group.id === "custom")?.choices).toEqual([
      customChoice,
    ]);
  });

  it("rejects trusted reconstruction when the private Choice preflight overflows", async () => {
    firestoreMocks.getDocs.mockResolvedValueOnce({
      docs: choiceDocuments(optionChoiceReadLimit),
    });
    const transaction = {
      get: vi.fn(async () =>
        snapshot("custom", serializePrivateOptionGroup(customGroup)),
      ),
    };

    await expect(
      readPrivateOptionGroupsInTransaction({} as never, transaction as never, [
        "custom",
      ]),
    ).rejects.toThrow("Option group custom exceeds the maximum of 50 choices.");
  });
});
