import { describe, expect, it } from "vitest";
import { isAuthorizedStaffDocument } from "./staffAuthorization";

describe("UAT staff authorization guard", () => {
  it.each([
    undefined,
    {},
    { role: "owner", active: true },
    { role: "staff", active: false },
    { role: "staff", active: "true" },
  ])(
    "rejects a missing, incorrect, or inactive authorization document",
    (document) => {
      expect(isAuthorizedStaffDocument(document)).toBe(false);
    },
  );
  it("accepts only role staff with boolean active true", () => {
    expect(isAuthorizedStaffDocument({ role: "staff", active: true })).toBe(
      true,
    );
  });
});
