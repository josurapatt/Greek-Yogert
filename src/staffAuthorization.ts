export interface StaffAuthorizationDocument {
  role?: unknown;
  active?: unknown;
  canManageCustomerOrdering?: unknown;
}

export function canManageCustomerOrdering(
  value: StaffAuthorizationDocument | undefined,
): boolean {
  return (
    isAuthorizedStaffDocument(value) &&
    value?.canManageCustomerOrdering === true
  );
}

export function isAuthorizedStaffDocument(
  value: StaffAuthorizationDocument | undefined,
): boolean {
  return value?.role === "staff" && value.active === true;
}

export const unauthorizedStaffMessage =
  "บัญชีนี้ยังไม่ได้รับสิทธิ์พนักงานสำหรับระบบนี้";
