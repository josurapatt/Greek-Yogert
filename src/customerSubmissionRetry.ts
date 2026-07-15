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

interface CustomerActiveRequestPointer {
  pointerVersion: 1;
  ownerUid: string;
  requestId: string;
}

const envelopeKey = (uid: string) => `greek-more-customer-submit-v2:${uid}`;
const cooldownKey = (uid: string) =>
  `greek-more-customer-submit-cooldown-v2:${uid}`;
const lockKey = (uid: string) => `greek-more-customer-submit-lock-v2:${uid}`;
const activeRequestKey = (uid: string) =>
  `greek-more-customer-active-request-v2:${uid}`;
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
  if (localStorage.getItem(activeRequestKey(uid)) === serialized) return;
  localStorage.setItem(activeRequestKey(uid), serialized);
  notifyCustomerSubmissionStorage();
}

export function loadCustomerActiveRequestId(uid: string): string | null {
  const envelope = loadCustomerSubmissionEnvelope(uid);
  if (envelope?.state === "submitted") {
    rememberCustomerActiveRequest(uid, envelope.retryId);
    return envelope.retryId;
  }
  try {
    const value = JSON.parse(
      localStorage.getItem(activeRequestKey(uid)) ?? "null",
    ) as CustomerActiveRequestPointer | null;
    return value?.pointerVersion === 1 &&
      value.ownerUid === uid &&
      typeof value.requestId === "string" &&
      value.requestId.length > 0
      ? value.requestId
      : null;
  } catch {
    return null;
  }
}

export function clearCustomerSubmissionEnvelope(uid: string) {
  localStorage.removeItem(envelopeKey(uid));
  localStorage.removeItem(activeRequestKey(uid));
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
  const locks = navigator.locks;
  if (locks) {
    const result = await locks.request(
      `greek-more-customer-submit:${uid}`,
      { ifAvailable: true },
      async (lock) => {
        if (!lock) throw new Error("กำลังส่งคำขอนี้จากแท็บอื่น กรุณารอสักครู่");
        return task();
      },
    );
    return result;
  }
  const owner = crypto.randomUUID();
  const key = lockKey(uid);
  const now = Date.now();
  try {
    const current = JSON.parse(localStorage.getItem(key) ?? "null") as {
      owner: string;
      expiresAt: number;
    } | null;
    if (current && current.expiresAt > now)
      throw new Error("กำลังส่งคำขอนี้จากแท็บอื่น กรุณารอสักครู่");
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes("แท็บอื่น"))
      throw cause;
  }
  localStorage.setItem(key, JSON.stringify({ owner, expiresAt: now + 30_000 }));
  const acquired = JSON.parse(localStorage.getItem(key) ?? "null") as {
    owner?: string;
  } | null;
  if (acquired?.owner !== owner)
    throw new Error("กำลังส่งคำขอนี้จากแท็บอื่น กรุณารอสักครู่");
  try {
    return await task();
  } finally {
    const latest = JSON.parse(localStorage.getItem(key) ?? "null") as {
      owner?: string;
    } | null;
    if (latest?.owner === owner) localStorage.removeItem(key);
  }
}
