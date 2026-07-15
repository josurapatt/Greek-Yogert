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
  state: "prepared" | "uncertain";
}

const envelopeKey = (uid: string) => `greek-more-customer-submit-v2:${uid}`;
const cooldownKey = (uid: string) =>
  `greek-more-customer-submit-cooldown-v2:${uid}`;
const lockKey = (uid: string) => `greek-more-customer-submit-lock-v2:${uid}`;

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
  if (existing?.fingerprint === fingerprint) return existing;
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
  return envelope;
}

export function markCustomerSubmissionUncertain(
  envelope: CustomerSubmissionEnvelope,
) {
  const next = { ...envelope, state: "uncertain" as const };
  localStorage.setItem(envelopeKey(envelope.ownerUid), JSON.stringify(next));
  return next;
}

export function clearCustomerSubmissionEnvelope(uid: string) {
  localStorage.removeItem(envelopeKey(uid));
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
