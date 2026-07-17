import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateAppCheckBundle } from "./validateAppCheckBundle.mjs";

const temporaryDirectories: string[] = [];

function fixture(contents: string) {
  const directory = mkdtempSync(join(tmpdir(), "app-check-bundle-"));
  temporaryDirectories.push(directory);
  mkdirSync(join(directory, "assets"));
  writeFileSync(join(directory, "index.html"), '<div id="root"></div>');
  writeFileSync(join(directory, "assets", "app.js"), contents);
  return directory;
}

afterEach(() => {
  temporaryDirectories
    .splice(0)
    .forEach((directory) =>
      rmSync(directory, { recursive: true, force: true }),
    );
});

describe("App Check bundle inspection", () => {
  it("requires the SDK only in the normal isolated-UAT bundle", () => {
    expect(
      validateAppCheckBundle({
        distDirectory: fixture(
          "https://firebaseappcheck.googleapis.com/v1/token",
        ),
        mode: "normal-uat",
      }),
    ).toMatchObject({ mode: "normal-uat" });
    expect(
      validateAppCheckBundle({
        distDirectory: fixture("production customer QR disabled"),
        mode: "production-disabled",
      }),
    ).toMatchObject({ mode: "production-disabled" });
  });

  it("rejects App Check SDK code from Production-disabled and rehearsal bundles", () => {
    expect(() =>
      validateAppCheckBundle({
        distDirectory: fixture("https://firebaseappcheck.googleapis.com"),
        mode: "production-disabled",
      }),
    ).toThrow(/unexpectedly contains App Check SDK marker/);
    expect(() =>
      validateAppCheckBundle({
        distDirectory: fixture("FIREBASE_APPCHECK_DEBUG_TOKEN"),
        mode: "release-rehearsal",
      }),
    ).toThrow(/unexpectedly contains App Check SDK marker/);
  });

  it("rejects debug secret names and credential material from every bundle", () => {
    expect(() =>
      validateAppCheckBundle({
        distDirectory: fixture("CUSTOMER_UAT_APP_CHECK_DEBUG_TOKEN"),
        mode: "normal-uat",
      }),
    ).toThrow(/Forbidden build marker/);
    expect(() =>
      validateAppCheckBundle({
        distDirectory: fixture("BEGIN PRIVATE KEY"),
        mode: "production-disabled",
      }),
    ).toThrow(/Forbidden build marker/);
  });
});
