import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CustomerOrderingOperationsPanel from "./components/CustomerOrderingOperationsPanel";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useData: vi.fn(),
  change: vi.fn(),
  loadIndicators: vi.fn(),
  control: {
    schemaVersion: 1,
    enabled: true,
    reason: "",
    message: "",
  } as Record<string, unknown>,
}));

vi.mock("./firebase", () => ({ db: {} }));
vi.mock("./store", () => ({
  useAuth: mocks.useAuth,
  useData: mocks.useData,
}));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => "settings/customerOrdering"),
  onSnapshot: vi.fn((_reference, next) => {
    next({ exists: () => true, data: () => mocks.control });
    return vi.fn();
  }),
}));
vi.mock("./customerOrderingControl", () => ({
  customerOrderingControlSchemaVersion: 1,
  disabledForReview: () => false,
  changeCustomerOrderingControl: mocks.change,
}));
vi.mock("./operationalMonitoring", () => ({
  loadOperationalIndicators: mocks.loadIndicators,
}));

afterEach(cleanup);

describe("Customer Ordering Operations authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.control = {
      schemaVersion: 1,
      enabled: true,
      reason: "",
      message: "",
    };
    mocks.useData.mockReturnValue({
      products: [],
      toppingAvailability: {},
      customerRequests: [],
    });
    mocks.loadIndicators.mockImplementation(async () => ({
      control: mocks.control,
      indicators: [
        {
          id: "backlog",
          label: "Pending backlog",
          severity: "warning",
          detail: "warning threshold reached",
        },
        {
          id: "projection",
          label: "Projection V2 integrity",
          severity: "critical",
          detail: "projection mismatch",
        },
      ],
    }));
    mocks.change.mockResolvedValue(undefined);
  });

  it("lets ordinary Staff perform an emergency disable and shows indicators", async () => {
    mocks.useAuth.mockReturnValue({ user: { uid: "ordinary" } });
    const view = render(<CustomerOrderingOperationsPanel />);
    await screen.findByText("Projection V2 integrity");
    expect(view.container.querySelector(".indicator.warning")).toBeTruthy();
    expect(view.container.querySelector(".indicator.critical")).toBeTruthy();
    const inputs = view.container.querySelectorAll(
      '.operations-action-form input:not([type="checkbox"])',
    );
    fireEvent.change(inputs[0], { target: { value: "Emergency maintenance" } });
    fireEvent.change(inputs[1], { target: { value: "Please contact Staff" } });
    fireEvent.click(view.container.querySelector("button.danger")!);
    await waitFor(() =>
      expect(mocks.change).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          enabled: false,
          actorUid: "ordinary",
          canManageCustomerOrdering: false,
          reason: "Emergency maintenance",
        }),
      ),
    );
  });

  it("does not let ordinary Staff re-enable intake", async () => {
    mocks.control = {
      schemaVersion: 1,
      enabled: false,
      reason: "maintenance",
      message: "closed",
    };
    mocks.useAuth.mockReturnValue({ user: { uid: "ordinary" } });
    const view = render(<CustomerOrderingOperationsPanel />);
    const input = view.container.querySelector(
      '.operations-action-form input:not([type="checkbox"])',
    )!;
    fireEvent.change(input, { target: { value: "Reviewed" } });
    fireEvent.click(view.container.querySelector('input[type="checkbox"]')!);
    const enable = view.container.querySelector(
      "button.primary",
    ) as HTMLButtonElement;
    expect(enable.disabled).toBe(true);
    fireEvent.click(enable);
    expect(mocks.change).not.toHaveBeenCalled();
  });

  it("lets capable Staff re-enable only after reason and confirmation", async () => {
    mocks.control = {
      schemaVersion: 1,
      enabled: false,
      reason: "maintenance",
      message: "closed",
    };
    mocks.useAuth.mockReturnValue({
      user: { uid: "capable", canManageCustomerOrdering: true },
    });
    const view = render(<CustomerOrderingOperationsPanel />);
    const enable = view.container.querySelector(
      "button.primary",
    ) as HTMLButtonElement;
    expect(enable.disabled).toBe(true);
    fireEvent.change(
      view.container.querySelector(
        '.operations-action-form input:not([type="checkbox"])',
      )!,
      { target: { value: "Incident reviewed" } },
    );
    expect(enable.disabled).toBe(true);
    fireEvent.click(view.container.querySelector('input[type="checkbox"]')!);
    expect(enable.disabled).toBe(false);
    fireEvent.click(enable);
    await waitFor(() =>
      expect(mocks.change).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          enabled: true,
          actorUid: "capable",
          canManageCustomerOrdering: true,
          reason: "Incident reviewed",
        }),
      ),
    );
  });
});
