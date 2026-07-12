export const staffOrderPath = "/order";

export function isCustomerRoute(pathname: string): boolean {
  return pathname === "/order" || pathname.startsWith("/order/status/");
}

export function shouldShowCustomerUnavailable(
  pathname: string,
  customerOrderingEnabled: boolean,
  user?: { isAnonymous?: boolean } | null,
): boolean {
  if (customerOrderingEnabled || !isCustomerRoute(pathname)) return false;
  if (pathname.startsWith("/order/status/")) return true;
  return !user || Boolean(user.isAnonymous);
}

export function shouldUseCustomerOrdering(
  pathname: string,
  customerOrderingEnabled: boolean,
  user?: { isAnonymous?: boolean } | null,
): boolean {
  if (!customerOrderingEnabled || !isCustomerRoute(pathname)) return false;
  if (pathname.startsWith("/order/status/")) return true;
  return !user || Boolean(user.isAnonymous);
}

export function orderDetailBackPath(
  status: "pending" | "completed" | "cancelled",
): string {
  return status === "pending" ? "/queue" : "/history";
}
