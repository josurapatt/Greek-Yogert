import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("offline public projection overflow guard", () => {
  it("fails before producing a partial write plan for 51 private Choices", () => {
    let failure: { stderr?: Buffer; stdout?: Buffer } | undefined;
    try {
      execFileSync(
        process.execPath,
        [
          "scripts/runPublicProjection.mjs",
          "--offline",
          "--baseline",
          "overflow",
        ],
        {
          cwd: process.cwd(),
          encoding: "buffer",
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    } catch (cause) {
      failure = cause as { stderr?: Buffer; stdout?: Buffer };
    }

    expect(failure).toBeDefined();
    const output = Buffer.concat([
      failure?.stdout ?? Buffer.alloc(0),
      failure?.stderr ?? Buffer.alloc(0),
    ]).toString();
    expect(output).toMatch(
      /Option group .+ exceeds the maximum of 50 choices\./,
    );
    expect(output).not.toContain("writeCount");
    expect(output).not.toContain("publicTarget");
  }, 15_000);
});
