export interface StaffAuthorizationDocument {
  role?: unknown;
  active?: unknown;
}

export function isAuthorizedStaffDocument(
  value: StaffAuthorizationDocument | undefined,
): boolean {
  return value?.role === "staff" && value.active === true;
}

export const unauthorizedStaffMessage =
  "บัญชีนี้ยังไม่ได้รับสิทธิ์พนักงานสำหรับระบบทดลอง";
