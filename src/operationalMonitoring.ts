import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type Firestore,
} from "firebase/firestore";
import {
  buildPublicProjection,
  projectionFingerprint,
  publicProjectionSchemaVersion,
} from "./publicProjection";
import {
  customerOrderingControlSchemaVersion,
  parsePublicCustomerOrderingControl,
  type PrivateCustomerOrderingControl,
} from "./customerOrderingControl";
import { customerRequestTime, loadLatestRequests } from "./staffFirestore";
import type {
  CustomerOrderRequest,
  Product,
  ToppingAvailability,
} from "./types";

export type OperationalSeverity = "ok" | "warning" | "critical" | "reminder";
export interface OperationalIndicator {
  id: string;
  label: string;
  severity: OperationalSeverity;
  detail: string;
}

interface OperationalAuditEvent {
  eventType: string;
  outcome: string;
  occurredAt: unknown;
}

function millis(value: unknown): number | null {
  const converted = (value as { toMillis?: () => number } | null)?.toMillis?.();
  return typeof converted === "number" ? converted : null;
}

function severity(value: number, warning: number, critical: number) {
  return value >= critical ? "critical" : value >= warning ? "warning" : "ok";
}

export function evaluateOperationalIndicators(input: {
  now: number;
  pending: CustomerOrderRequest[];
  latestRequests: CustomerOrderRequest[];
  confirmationAttempts: OperationalAuditEvent[];
  decisions: OperationalAuditEvent[];
  controlHealthy: boolean;
  projectionHealthy: boolean;
  disabledSince: number | null;
}): OperationalIndicator[] {
  const pendingCount = input.pending.length;
  const oldestMinutes = pendingCount
    ? Math.max(
        0,
        (input.now - Math.min(...input.pending.map(customerRequestTime))) /
          60_000,
      )
    : 0;
  const tenMinutesAgo = input.now - 10 * 60_000;
  const recentRequests = input.latestRequests.filter(
    (request) => customerRequestTime(request) >= tenMinutesAgo,
  );
  const ownerCounts = recentRequests.reduce<Record<string, number>>(
    (values, request) => ({
      ...values,
      [request.ownerUid]: (values[request.ownerUid] ?? 0) + 1,
    }),
    {},
  );
  const repeatedOwner = Math.max(0, ...Object.values(ownerCounts));
  const fifteenMinutesAgo = input.now - 15 * 60_000;
  const recentMismatchCount = input.confirmationAttempts.filter(
    (event) =>
      event.outcome === "trusted_mismatch" &&
      (millis(event.occurredAt) ?? 0) >= fifteenMinutesAgo,
  ).length;
  const mismatchLatest20 = input.confirmationAttempts.slice(0, 20);
  const mismatchRate =
    mismatchLatest20.length === 20
      ? mismatchLatest20.filter((event) => event.outcome === "trusted_mismatch")
          .length / 20
      : 0;
  const decisionsLatest20 = input.decisions.slice(0, 20);
  const rejectionRate =
    decisionsLatest20.length === 20
      ? decisionsLatest20.filter((event) => event.outcome === "rejected")
          .length / 20
      : 0;
  const mismatchSeverity =
    recentMismatchCount >= 5 || mismatchRate >= 0.4
      ? "critical"
      : recentMismatchCount >= 3 || mismatchRate >= 0.2
        ? "warning"
        : "ok";
  const rejectionSeverity =
    decisionsLatest20.length === 20 && rejectionRate >= 0.5
      ? "critical"
      : decisionsLatest20.length === 20 && rejectionRate >= 0.3
        ? "warning"
        : "ok";
  return [
    {
      id: "pending-backlog",
      label: "คำขอที่รอยืนยัน",
      severity: severity(pendingCount, 10, 20),
      detail: `${pendingCount} คำขอ (เตือน 10 / วิกฤต 20)`,
    },
    {
      id: "oldest-pending",
      label: "คำขอที่รอนานที่สุด",
      severity: severity(oldestMinutes, 15, 30),
      detail: `${Math.floor(oldestMinutes)} นาที (เตือนเกิน 15 / วิกฤตเกิน 30)`,
    },
    {
      id: "repeated-owner",
      label: "คำขอซ้ำจากเจ้าของนิรนามรายเดียว",
      severity: severity(repeatedOwner, 3, 5),
      detail: `${repeatedOwner} คำขอใน 10 นาที (เตือน 3 / วิกฤต 5)`,
    },
    {
      id: "intake-burst",
      label: "คำขอใหม่รวม",
      severity: severity(recentRequests.length, 20, 40),
      detail: `${recentRequests.length} คำขอใน 10 นาที (เตือน 20 / วิกฤต 40)`,
    },
    {
      id: "confirmation-mismatch",
      label: "คำขอไม่ตรงกับข้อมูลที่เชื่อถือได้",
      severity: mismatchSeverity,
      detail: `${recentMismatchCount} ครั้งใน 15 นาที / ${(mismatchRate * 100).toFixed(0)}% ของ 20 ครั้งล่าสุด`,
    },
    {
      id: "rejection-rate",
      label: "อัตราการปฏิเสธโดยพนักงาน",
      severity: rejectionSeverity,
      detail:
        decisionsLatest20.length === 20
          ? `${(rejectionRate * 100).toFixed(0)}% ของ 20 คำขอล่าสุด`
          : `มีข้อมูล ${decisionsLatest20.length}/20 รายการ ยังไม่ประเมินอัตรา`,
    },
    {
      id: "control-health",
      label: "เอกสารควบคุมการรับคำสั่งซื้อ",
      severity: input.controlHealthy ? "ok" : "critical",
      detail: input.controlHealthy
        ? "พร้อมใช้งาน"
        : "หายหรือรูปแบบไม่ถูกต้อง — การรับคำขอใหม่ต้องปิด",
    },
    {
      id: "projection-health",
      label: "ความสมบูรณ์ของ Public Projection V2",
      severity: input.projectionHealthy ? "ok" : "critical",
      detail: input.projectionHealthy
        ? "fingerprint และเอกสารสาธารณะตรงกัน"
        : "ไม่พร้อมหรือไม่ตรงกัน",
    },
    {
      id: "extended-disable",
      label: "ระยะเวลาปิดรับคำสั่งซื้อ",
      severity:
        input.disabledSince !== null &&
        input.now - input.disabledSince > 30 * 60_000
          ? "reminder"
          : "ok",
      detail:
        input.disabledSince === null
          ? "กำลังเปิดรับคำสั่งซื้อ"
          : `ปิดมาแล้ว ${Math.floor((input.now - input.disabledSince) / 60_000)} นาที — เกิน 30 นาทีต้องทบทวนก่อนเปิด`,
    },
  ];
}

async function loadAuditEvents(
  firestore: Firestore,
  eventType: "confirmation_attempt" | "request_decision",
) {
  const snapshot = await getDocs(
    query(
      collection(firestore, "customerOrderingAuditEvents"),
      where("eventType", "==", eventType),
      orderBy("occurredAt", "desc"),
      limit(20),
    ),
  );
  return snapshot.docs.map((entry) => entry.data() as OperationalAuditEvent);
}

export async function loadOperationalIndicators(
  firestore: Firestore,
  input: {
    pending: CustomerOrderRequest[];
    products: Product[];
    availability: ToppingAvailability;
    now?: number;
  },
): Promise<{
  indicators: OperationalIndicator[];
  control: PrivateCustomerOrderingControl | null;
}> {
  const [
    latestRequests,
    confirmationAttempts,
    decisions,
    privateControlSnapshot,
    publicControlSnapshot,
    projectionControlSnapshot,
    requestPolicySnapshot,
    publicMenuSnapshot,
    publicAvailabilitySnapshot,
  ] = await Promise.all([
    loadLatestRequests(firestore),
    loadAuditEvents(firestore, "confirmation_attempt"),
    loadAuditEvents(firestore, "request_decision"),
    getDoc(doc(firestore, "settings", "customerOrdering")),
    getDoc(doc(firestore, "publicSettings", "customerOrdering")),
    getDoc(doc(firestore, "publicProjectionControl", "current")),
    getDoc(doc(firestore, "publicSettings", "customerRequestPolicy")),
    getDocs(query(collection(firestore, "publicMenu"), limit(100))),
    getDoc(doc(firestore, "publicSettings", "toppingAvailability")),
  ]);
  const privateControl = privateControlSnapshot.exists()
    ? (privateControlSnapshot.data() as PrivateCustomerOrderingControl)
    : null;
  const publicControl = publicControlSnapshot.exists()
    ? parsePublicCustomerOrderingControl(publicControlSnapshot.data())
    : parsePublicCustomerOrderingControl(null);
  const controlHealthy = Boolean(
    privateControl &&
      privateControl.schemaVersion === customerOrderingControlSchemaVersion &&
      typeof privateControl.enabled === "boolean" &&
      publicControl.status !== "invalid" &&
      publicControl.enabled === privateControl.enabled,
  );
  let projectionHealthy = false;
  try {
    const expected = buildPublicProjection(input.products, input.availability);
    const actualMenu = Object.fromEntries(
      publicMenuSnapshot.docs.map((entry) => [entry.id, entry.data()]),
    );
    const actualAvailability = publicAvailabilitySnapshot.data();
    const projectionControl = projectionControlSnapshot.data();
    projectionHealthy = Boolean(
      projectionControlSnapshot.exists() &&
        projectionControl?.schemaVersion === publicProjectionSchemaVersion &&
        projectionControl?.fingerprint === expected.fingerprint &&
        requestPolicySnapshot.exists() &&
        projectionFingerprint(requestPolicySnapshot.data()) ===
          projectionFingerprint(expected.requestPolicy) &&
        projectionFingerprint(actualMenu) ===
          projectionFingerprint(expected.menu) &&
        projectionFingerprint(actualAvailability) ===
          projectionFingerprint({ availability: expected.availability }),
    );
  } catch {
    projectionHealthy = false;
  }
  const disabledSince =
    privateControl && !privateControl.enabled
      ? millis(privateControl.disabledAt)
      : null;
  return {
    control: privateControl,
    indicators: evaluateOperationalIndicators({
      now: input.now ?? Date.now(),
      pending: input.pending,
      latestRequests,
      confirmationAttempts,
      decisions,
      controlHealthy,
      projectionHealthy,
      disabledSince,
    }),
  };
}
