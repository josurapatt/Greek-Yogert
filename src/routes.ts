export function isCustomerRoute(pathname: string): boolean {
  return pathname === "/order" || pathname.startsWith("/order/status/");
}

export function orderDetailBackPath(
  status: "pending" | "completed" | "cancelled",
): string {
  return status === "pending" ? "/queue" : "/history";
}
