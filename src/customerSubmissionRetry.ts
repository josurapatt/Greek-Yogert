import type { CartItem } from "./types";

export const customerSubmissionEnvelopeVersion = 1;
export const customerSubmissionCooldownMs = 5_000;

export interface CustomerSubmissionEnvelope {
  envelopeVersion: number;
  retryId: string;
  ownerUid: string;
  items: CartItem[];
  input: { customerName?: string; customerNote?: string };
  fingerprint: string;
  preparedAt: string;
  state: "prepared" | "uncertain" | "submitted";
}

export interface CustomerActiveRequestPointer {
  pointerVersion: 1;
  ownerUid: string;
  requestId: string;
}

export type CustomerProfileActiveRequestState =
  | { status: "none" }
  | { status: "active"; pointer: CustomerActiveRequestPointer }
  | { status: "blocked"; requestId: string | null };

const envelopeKey = (uid: string) => `greek-more-customer-submit-v2:${uid}`;
const cooldownKey = (uid: string) =>
  `greek-more-customer-submit-cooldown-v2:${uid}`;
const lockKey = "greek-more-customer-submit-lock-profile-v1";
const activeRequestKey = (uid: string) =>
  `greek-more-customer-active-request-v2:${uid}`;
const profileActiveRequestKey = "greek-more-customer-active-request-profile-v1";
export const customerSubmissionStorageEvent =
  "greek-more-customer-submission-storage";

function notifyCustomerSubmissionStorage() {
  window.dispatchEvent(new Event(customerSubmissionStorageEvent));
}

function submissionFingerprint(
  items: CartItem[],
  input: { customerName?: string; customerNote?: string },
) {
  return JSON.stringify({ items, input });
}

export function loadCustomerSubmissionEnvelope(
  uid: string,
): CustomerSubmissionEnvelope | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(envelopeKey(uid)) ?? "null",
    ) as CustomerSubmissionEnvelope | null;
    return value?.envelopeVersion === customerSubmissionEnvelopeVersion &&
      value.ownerUid === uid &&
      typeof value.retryId === "string" &&
      Array.isArray(value.items)
      ? value
      : null;
  } catch {
    return null;
  }
}

export function prepareCustomerSubmissionEnvelope(
  uid: string,
  items: CartItem[],
  input: { customerName?: string; customerNote?: string },
): CustomerSubmissionEnvelope {
  const fingerprint = submissionFingerprint(items, input);
  const existing = loadCustomerSubmissionEnvelope(uid);
  if (existing) return existing;
  const envelope: CustomerSubmissionEnvelope = {
    envelopeVersion: customerSubmissionEnvelopeVersion,
    retryId: crypto.randomUUID(),
    ownerUid: uid,
    items,
    input,
    fingerprint,
    preparedAt: new Date().toISOString(),
    state: "prepared",
  };
  localStorage.setItem(envelopeKey(uid), JSON.stringify(envelope));
  notifyCustomerSubmissionStorage();
  return envelope;
}

export function markCustomerSubmissionUncertain(
  envelope: CustomerSubmissionEnvelope,
) {
  const next = { ...envelope, state: "uncertain" as const };
  localStorage.setItem(envelopeKey(envelope.ownerUid), JSON.stringify(next));
  notifyCustomerSubmissionStorage();
  return next;
}

export function markCustomerSubmissionSubmitted(
  envelope: CustomerSubmissionEnvelope,
) {
  const next = { ...envelope, state: "submitted" as const };
  localStorage.setItem(envelopeKey(envelope.ownerUid), JSON.stringify(next));
  rememberCustomerActiveRequest(envelope.ownerUid, envelope.retryId);
  return next;
}

export function rememberCustomerActiveRequest(uid: string, requestId: string) {
  const pointer: CustomerActiveRequestPointer = {
    pointerVersion: 1,
    ownerUid: uid,
    requestId,
  };
  const serialized = JSON.stringify(pointer);
  const currentProfileValue = localStorage.getItem(profileActiveRequestKey);
  if (currentProfileValue !== null) {
    try {
      const current = JSON.parse(
        currentProfileValue,
      ) as CustomerActiveRequestPointer;
      if (
        current.pointerVersion !== 1 ||
        current.ownerUid !== uid ||
        current.requestId !== requestId
      )
        return false;
    } catch {
      return false;
    }
  }
  localStorage.setItem(profileActiveRequestKey, serialized);
  localStorage.setItem(activeRequestKey(uid), serialized);
  notifyCustomerSubmissionStorage();
  return true;
}

function parseActiveRequestPointer(value: string | null) {
  if (value === null) return null;
  try {
    const pointer = JSON.parse(value) as CustomerActiveRequestPointer;
    return pointer?.pointerVersion === 1 &&
      typeof pointer.ownerUid === "string" &&
      pointer.ownerUid.length > 0 &&
      typeof pointer.requestId === "string" &&
      pointer.requestId.length > 0
      ? pointer
      : false;
  } catch {
    return false;
  }
}

export function loadCustomerProfileActiveRequest(
  uid: string,
): CustomerProfileActiveRequestState {
  const envelope = loadCustomerSubmissionEnvelope(uid);
  if (envelope?.state === "submitted") {
    rememberCustomerActiveRequest(uid, envelope.retryId);
  }

  let pointer = parseActiveRequestPointer(
    localStorage.getItem(profileActiveRequestKey),
  );
  if (pointer === false) return { status: "blocked", requestId: null };
  if (pointer === null) {
    pointer = parseActiveRequestPointer(
      localStorage.getItem(activeRequestKey(uid)),
    );
    if (pointer === false) return { status: "blocked", requestId: null };
    if (pointer) {
      if (!rememberCustomerActiveRequest(pointer.ownerUid, pointer.requestId))
        return { status: "blocked", requestId: pointer.requestId };
    }
  }
  if (!pointer) return { status: "none" };
  if (pointer.ownerUid !== uid)
    return { status: "blocked", requestId: pointer.requestId };
  return { status: "active", pointer };
}

export function loadCustomerActiveRequestId(uid: string): string | null {
  const state = loadCustomerProfileActiveRequest(uid);
  return state.status === "active" ? state.pointer.requestId : null;
}

export function assertCustomerProfileSubmissionAvailable(uid: string) {
  const state = loadCustomerProfileActiveRequest(uid);
  if (state.status === "blocked")
    throw new Error(
      "พบคำขอที่กำลังรออยู่ในเบราว์เซอร์นี้ ระบบจะไม่สร้างคำขอใหม่ กรุณาติดต่อพนักงาน",
    );
  if (state.status === "active")
    throw new Error("มีคำขอที่รอร้านยืนยันอยู่ กรุณากลับไปดูสถานะคำขอเดิม");
  return state;
}

export function clearCustomerSubmissionEnvelope(
  uid: string,
  requestId?: string,
) {
  localStorage.removeItem(envelopeKey(uid));
  localStorage.removeItem(activeRequestKey(uid));
  const profilePointer = parseActiveRequestPointer(
    localStorage.getItem(profileActiveRequestKey),
  );
  if (
    profilePointer &&
    profilePointer.ownerUid === uid &&
    (!requestId || profilePointer.requestId === requestId)
  )
    localStorage.removeItem(profileActiveRequestKey);
  notifyCustomerSubmissionStorage();
}

export function assertCustomerSubmissionCooldown(
  uid: string,
  now = Date.now(),
) {
  const last = Number(localStorage.getItem(cooldownKey(uid)) ?? 0);
  if (Number.isFinite(last) && now - last < customerSubmissionCooldownMs)
    throw new Error("กรุณารอ 5 วินาทีก่อนส่งคำขอใหม่");
}

export function recordCustomerSubmissionAccepted(
  uid: string,
  now = Date.now(),
) {
  localStorage.setItem(cooldownKey(uid), String(now));
}

export async function withCustomerSubmissionLock<T>(
  uid: string,
  task: () => Promise<T>,
): Promise<T> {
  void uid;
  const locks = navigator.locks;
  if (locks) {
    return locks.request("greek-more-customer-submit:profile-v1", async () =>
      task(),
    );
  }
  const owner = crypto.randomUUID();
  const deadline = Date.now() + 30_000;
  let acquired = false;
  while (!acquired && Date.now() < deadline) {
    const now = Date.now();
    try {
      const current = JSON.parse(localStorage.getItem(lockKey) ?? "null") as {
        owner?: string;
        expiresAt?: number;
      } | null;
      if (!current || !current.expiresAt || current.expiresAt <= now) {
        localStorage.setItem(
          lockKey,
          JSON.stringify({ owner, expiresAt: now + 30_000 }),
        );
        await new Promise((resolve) => window.setTimeout(resolve, 25));
        const latest = JSON.parse(localStorage.getItem(lockKey) ?? "null") as {
          owner?: string;
        } | null;
        acquired = latest?.owner === owner;
      }
    } catch {
      // A malformed lease is treated as busy until another iteration replaces it.
    }
    if (!acquired)
      await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  if (!acquired) throw new Error("กำลังส่งคำขอนี้จากแท็บอื่น กรุณารอสักครู่");
  try {
    return await task();
  } finally {
    const latest = JSON.parse(localStorage.getItem(lockKey) ?? "null") as {
      owner?: string;
    } | null;
    if (latest?.owner === owner) localStorage.removeItem(lockKey);
  }
}
