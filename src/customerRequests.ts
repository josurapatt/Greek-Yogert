import { waitingForShop } from "./customerOrder";
import type { CustomerOrderRequest } from "./types";

export function pendingCustomerRequests(
  requests: CustomerOrderRequest[],
): CustomerOrderRequest[] {
  return requests.filter((request) => request.status === waitingForShop);
}

export function removeCustomerRequest(
  requests: CustomerOrderRequest[],
  id: string,
): CustomerOrderRequest[] {
  return requests.filter((request) => request.id !== id);
}
