import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { CustomerProvider } from "./customerFirebase";
import CustomerOrderPage from "./pages/CustomerOrderPage";

afterEach(cleanup);

describe("customer QR ordering restrictions", () => {
  it("does not expose sales-channel or payment-method selectors", () => {
    render(
      <MemoryRouter initialEntries={["/order"]}>
        <CustomerProvider>
          <CustomerOrderPage />
        </CustomerProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByText("LINE MAN")).toBeNull();
    expect(screen.queryByText("Grab")).toBeNull();
    expect(screen.queryByText("OpenChat")).toBeNull();
    expect(screen.queryByText("สด")).toBeNull();
    expect(screen.queryByText("โอน")).toBeNull();
  });
});
