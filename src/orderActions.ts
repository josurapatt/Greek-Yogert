import type { OrderStatus } from "./types";

export async function updateOrderStatusAndNavigate(
  orderId: string,
  status: OrderStatus,
  updateStatus: (id: string, next: OrderStatus) => Promise<void>,
  navigate: (path: string) => void,
): Promise<void> {
  await updateStatus(orderId, status);
  if (status === "completed") navigate("/queue");
}
