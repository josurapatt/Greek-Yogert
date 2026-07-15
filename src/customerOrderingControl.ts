import {
  doc,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";

export const customerOrderingControlSchemaVersion = 1;
export const customerOrderingMessageMaxLength = 160;
export const customerOrderingReasonMaxLength = 200;

export interface PublicCustomerOrderingControl {
  schemaVersion: number;
  enabled: boolean;
  message: string;
  updatedAt: unknown;
  changeId: string;
}

export interface PrivateCustomerOrderingControl
  extends PublicCustomerOrderingControl {
  reason: string;
  updatedBy: string;
  disabledAt: unknown | null;
}

export type CustomerOrderingControlState =
  | { status: "loading"; enabled: false; message: string }
  | { status: "invalid"; enabled: false; message: string }
  | { status: "disabled"; enabled: false; message: string }
  | { status: "enabled"; enabled: true; message: string };

const safeUnavailableMessage =
  "ขณะนี้ร้านปิดรับคำสั่งซื้อใหม่ชั่วคราว กรุณาติดต่อพนักงาน";

function exactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value).sort();
  return (
    actual.length === keys.length &&
    actual.every((key, index) => key === [...keys].sort()[index])
  );
}

export function parsePublicCustomerOrderingControl(
  value: unknown,
): CustomerOrderingControlState {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return {
      status: "invalid",
      enabled: false,
      message: safeUnavailableMessage,
    };
  const control = value as Record<string, unknown>;
  if (
    !exactKeys(control, [
      "schemaVersion",
      "enabled",
      "message",
      "updatedAt",
      "changeId",
    ]) ||
    control.schemaVersion !== customerOrderingControlSchemaVersion ||
    typeof control.enabled !== "boolean" ||
    typeof control.message !== "string" ||
    control.message.length > customerOrderingMessageMaxLength ||
    typeof control.changeId !== "string" ||
    !control.changeId ||
    !control.updatedAt
  )
    return {
      status: "invalid",
      enabled: false,
      message: safeUnavailableMessage,
    };
  return control.enabled
    ? { status: "enabled", enabled: true, message: control.message }
    : {
        status: "disabled",
        enabled: false,
        message: control.message || safeUnavailableMessage,
      };
}

export async function changeCustomerOrderingControl(
  firestore: Firestore,
  input: {
    enabled: boolean;
    message: string;
    reason: string;
    actorUid: string;
    canManageCustomerOrdering: boolean;
  },
): Promise<string> {
  const reason = input.reason.trim();
  const message = input.message.trim();
  if (!reason || reason.length > customerOrderingReasonMaxLength)
    throw new Error("กรุณาระบุเหตุผลไม่เกิน 200 ตัวอักษร");
  if (message.length > customerOrderingMessageMaxLength)
    throw new Error("ข้อความแจ้งลูกค้าต้องไม่เกิน 160 ตัวอักษร");
  if (input.enabled && !input.canManageCustomerOrdering)
    throw new Error("บัญชีนี้ไม่มีสิทธิ์เปิดรับคำสั่งซื้อของลูกค้า");
  const changeId = crypto.randomUUID();
  await runTransaction(firestore, async (transaction) => {
    const privateRef = doc(firestore, "settings", "customerOrdering");
    const publicRef = doc(firestore, "publicSettings", "customerOrdering");
    const auditRef = doc(firestore, "customerOrderingAuditEvents", changeId);
    const previousSnapshot = await transaction.get(privateRef);
    const previous = previousSnapshot.data() as
      | PrivateCustomerOrderingControl
      | undefined;
    const previousState = !previousSnapshot.exists()
      ? "missing"
      : previous?.schemaVersion !== customerOrderingControlSchemaVersion ||
          typeof previous.enabled !== "boolean"
        ? "malformed"
        : previous.enabled
          ? "enabled"
          : "disabled";
    if (previousState === "malformed")
      throw new Error("เอกสารควบคุมไม่ถูกต้อง ต้องตรวจสอบก่อนเปลี่ยนสถานะ");
    if (input.enabled && previousState !== "disabled")
      throw new Error("เปิดรับคำสั่งซื้อได้เฉพาะหลังจากสถานะปิดที่ตรวจสอบแล้ว");
    const timestamp = serverTimestamp();
    const privateControl = {
      schemaVersion: customerOrderingControlSchemaVersion,
      enabled: input.enabled,
      message,
      reason,
      updatedAt: timestamp,
      updatedBy: input.actorUid,
      changeId,
      disabledAt: input.enabled ? null : timestamp,
    };
    const publicControl = {
      schemaVersion: customerOrderingControlSchemaVersion,
      enabled: input.enabled,
      message,
      updatedAt: timestamp,
      changeId,
    };
    transaction.set(privateRef, privateControl);
    transaction.set(publicRef, publicControl);
    transaction.set(auditRef, {
      eventType: "control_change",
      controlSchemaVersion: customerOrderingControlSchemaVersion,
      previousState,
      newState: input.enabled ? "enabled" : "disabled",
      actorUid: input.actorUid,
      reason,
      occurredAt: timestamp,
      changeId,
    });
  });
  return changeId;
}

export function disabledForReview(
  control: PrivateCustomerOrderingControl | null,
  now = Date.now(),
): boolean {
  if (!control || control.enabled || !control.disabledAt) return false;
  const value = control.disabledAt as { toMillis?: () => number };
  const millis = value.toMillis?.();
  return typeof millis === "number" && now - millis > 30 * 60_000;
}
