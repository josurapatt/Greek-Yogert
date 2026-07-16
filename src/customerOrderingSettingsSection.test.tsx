import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CustomerOrderingSettingsSection from "./components/CustomerOrderingSettingsSection";

vi.mock("./components/CustomerOrderingOperationsPanel", () => ({
  default: () => <div data-testid="operations-panel">operations</div>,
}));

afterEach(cleanup);

describe("Customer QR Settings section", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  it("is collapsed by default and expands and collapses accessibly", () => {
    const view = render(
      <MemoryRouter initialEntries={["/settings"]}>
        <CustomerOrderingSettingsSection />
      </MemoryRouter>,
    );
    const details = view.container.querySelector("details")!;
    const summary = screen
      .getByText("การควบคุม Customer QR")
      .closest("summary")!;
    expect(details.open).toBe(false);
    expect(screen.queryByTestId("operations-panel")).toBeNull();

    fireEvent.click(summary);
    expect(details.open).toBe(true);
    expect(screen.getByTestId("operations-panel")).toBeTruthy();
    fireEvent.click(summary);
    expect(details.open).toBe(false);
    expect(screen.queryByTestId("operations-panel")).toBeNull();
  });

  it("expands, scrolls, and focuses for the direct anchor", () => {
    const view = render(
      <MemoryRouter initialEntries={["/settings#customer-ordering"]}>
        <CustomerOrderingSettingsSection />
      </MemoryRouter>,
    );
    const details = view.container.querySelector("details")!;
    const summary = screen
      .getByText("การควบคุม Customer QR")
      .closest("summary")!;
    expect(details.open).toBe(true);
    expect(screen.getByTestId("operations-panel")).toBeTruthy();
    expect(document.activeElement).toBe(summary);
    expect(summary.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  });

  it.each([1440, 820, 390])(
    "keeps one responsive operations section at %ipx",
    (width) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      const view = render(
        <MemoryRouter initialEntries={["/settings#customer-ordering"]}>
          <CustomerOrderingSettingsSection />
        </MemoryRouter>,
      );
      expect(
        view.container.querySelectorAll("#customer-ordering"),
      ).toHaveLength(1);
      expect(screen.getByTestId("operations-panel")).toBeTruthy();
    },
  );
});
