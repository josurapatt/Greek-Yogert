export const paymentRequiredMessage =
  "กรุณาเลือกวิธีการชำระเงินก่อนยืนยันคำสั่งซื้อ";

export type CustomerConfirmationFailure =
  | "missing-payment"
  | "mismatch"
  | "already-processed"
  | "permission"
  | "unexpected";

export function classifyCustomerConfirmationFailure(
  cause: unknown,
): CustomerConfirmationFailure {
  const message = cause instanceof Error ? cause.message : "";
  const code =
    typeof cause === "object" && cause && "code" in cause
      ? String((cause as { code?: unknown }).code ?? "")
      : "";
  if (message.includes("กรุณาเลือกวิธีชำระเงิน")) return "missing-payment";
  if (message.includes("คำขอไม่ตรงกับเมนูปัจจุบัน")) return "mismatch";
  if (
    message.includes("ดำเนินการแล้ว") ||
    message.includes("ได้รับการดำเนินการแล้ว")
  )
    return "already-processed";
  if (code.includes("permission-denied")) return "permission";
  return "unexpected";
}

export function customerConfirmationFailureMessage(cause: unknown): string {
  const category = classifyCustomerConfirmationFailure(cause);
  if (category === "missing-payment") return paymentRequiredMessage;
  if (category === "mismatch")
    return "คำขอไม่ตรงกับเมนูหรือการตั้งค่าปัจจุบัน กรุณาให้ลูกค้าแก้ไขหรือสร้างคำขอใหม่";
  if (category === "already-processed")
    return "คำขอนี้ถูกดำเนินการแล้ว กรุณาตรวจสอบคิวหรือรีเฟรชหน้า";
  if (category === "permission")
    return "ไม่สามารถยืนยันคำสั่งซื้อได้ กรุณาตรวจสอบสิทธิ์พนักงานแล้วลองใหม่";
  return "ยืนยันคำสั่งซื้อไม่สำเร็จ ระบบยังไม่ได้สร้างคิว กรุณาลองใหม่อีกครั้ง";
}

export function logCustomerConfirmationFailure(
  requestId: string,
  cause: unknown,
): void {
  const code =
    typeof cause === "object" && cause && "code" in cause
      ? String((cause as { code?: unknown }).code ?? "")
      : undefined;
  console.error("Customer request confirmation failed", {
    requestId,
    category: classifyCustomerConfirmationFailure(cause),
    ...(code ? { code } : {}),
  });
}
