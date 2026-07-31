import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppErrorBoundary from "./AppErrorBoundary";

function BrokenView(): never {
  throw new Error("render failed");
}

afterEach(() => vi.restoreAllMocks());

describe("application error boundary", () => {
  it("shows a Thai recovery action and preserves diagnostics", () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <AppErrorBoundary>
        <BrokenView />
      </AppErrorBoundary>,
    );

    expect(
      screen.getByRole("heading", { name: "ไม่สามารถแสดงหน้านี้ได้" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "โหลดหน้าใหม่" })).toBeTruthy();
    expect(diagnostic).toHaveBeenCalled();
  });
});
