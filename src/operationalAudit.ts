import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";

export const operationalAuditSchemaVersion = 1;

export type ConfirmationAuditOutcome =
  | "confirmed"
  | "trusted_mismatch"
  | "already_processed"
  | "permission_failure"
  | "unexpected_failure";

export function confirmationAuditOutcome(
  cause: unknown,
): ConfirmationAuditOutcome {
  const message = cause instanceof Error ? cause.message : "";
  const code = (cause as { code?: unknown } | null)?.code;
  if (message.includes("คำขอไม่ตรงกับเมนูปัจจุบัน")) return "trusted_mismatch";
  if (
    message.includes("ถูกดำเนินการแล้ว") ||
    message.includes("ได้รับการดำเนินการแล้ว")
  )
    return "already_processed";
  if (code === "permission-denied") return "permission_failure";
  return "unexpected_failure";
}

export async function writeOperationalAuditEvent(
  firestore: Firestore,
  event: {
    eventType: "confirmation_attempt" | "request_decision";
    outcome: ConfirmationAuditOutcome | "rejected";
    actorUid: string;
    requestId: string;
  },
): Promise<void> {
  if (!event.actorUid) return;
  const ref = doc(collection(firestore, "customerOrderingAuditEvents"));
  await setDoc(ref, {
    ...event,
    schemaVersion: operationalAuditSchemaVersion,
    occurredAt: serverTimestamp(),
  });
}
