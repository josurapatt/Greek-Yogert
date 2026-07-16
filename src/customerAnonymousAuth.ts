import {
  onAuthStateChanged,
  signInAnonymously,
  type Auth,
  type User,
} from "firebase/auth";

const authBootstrapLockName = "greek-more-customer-auth-bootstrap-v1";
const authBootstrapLeaseKey = "greek-more-customer-auth-bootstrap-lease-v1";
const authBootstrapMarkerKey = "greek-more-customer-auth-bootstrap-marker-v1";
const authBootstrapReloadKey = "greek-more-customer-auth-bootstrap-reloaded-v1";
const markerFreshnessMs = 30_000;
let initialization: Promise<User> | null = null;

function waitForCurrentUser(auth: Auth, timeoutMs: number) {
  return new Promise<User | null>((resolve) => {
    let settled = false;
    let unsubscribe: () => void = () => {};
    const finish = (user: User | null) => {
      if (settled || !user) return;
      settled = true;
      window.clearTimeout(timeout);
      unsubscribe();
      resolve(user);
    };
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe();
      resolve(auth.currentUser);
    }, timeoutMs);
    unsubscribe = onAuthStateChanged(auth, finish);
    finish(auth.currentUser);
  });
}

function hasFreshBootstrapMarker(now = Date.now()) {
  try {
    const value = JSON.parse(
      localStorage.getItem(authBootstrapMarkerKey) ?? "null",
    ) as { version?: number; completedAt?: number } | null;
    return (
      value?.version === 1 &&
      typeof value.completedAt === "number" &&
      now - value.completedAt < markerFreshnessMs
    );
  } catch {
    return true;
  }
}

async function withAuthBootstrapLock<T>(task: () => Promise<T>): Promise<T> {
  if (navigator.locks)
    return navigator.locks.request(authBootstrapLockName, task);

  const owner = crypto.randomUUID();
  const deadline = Date.now() + 30_000;
  let acquired = false;
  while (!acquired && Date.now() < deadline) {
    const now = Date.now();
    try {
      const lease = JSON.parse(
        localStorage.getItem(authBootstrapLeaseKey) ?? "null",
      ) as { owner?: string; expiresAt?: number } | null;
      if (!lease || !lease.expiresAt || lease.expiresAt <= now) {
        localStorage.setItem(
          authBootstrapLeaseKey,
          JSON.stringify({ owner, expiresAt: now + 30_000 }),
        );
        await new Promise((resolve) => window.setTimeout(resolve, 25));
        const latest = JSON.parse(
          localStorage.getItem(authBootstrapLeaseKey) ?? "null",
        ) as { owner?: string } | null;
        acquired = latest?.owner === owner;
      }
    } catch {
      // A malformed lease is never treated as permission to create an identity.
    }
    if (!acquired)
      await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  if (!acquired)
    throw new Error("ไม่สามารถยืนยันตัวตนสำหรับส่งคำขอได้ กรุณาลองใหม่");

  try {
    return await task();
  } finally {
    try {
      const latest = JSON.parse(
        localStorage.getItem(authBootstrapLeaseKey) ?? "null",
      ) as { owner?: string } | null;
      if (latest?.owner === owner)
        localStorage.removeItem(authBootstrapLeaseKey);
    } catch {
      // Preserve a malformed lease so later attempts continue to fail closed.
    }
  }
}

export function ensureCustomerAnonymousSession(auth: Auth): Promise<User> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (initialization) return initialization;

  initialization = withAuthBootstrapLock(async () => {
    if (auth.currentUser) return auth.currentUser;
    if (hasFreshBootstrapMarker()) {
      if (sessionStorage.getItem(authBootstrapReloadKey) !== "true") {
        sessionStorage.setItem(authBootstrapReloadKey, "true");
        window.location.reload();
        return new Promise<User>(() => {});
      }
      const synchronizedUser = await waitForCurrentUser(auth, 4_000);
      if (synchronizedUser) return synchronizedUser;
      throw new Error(
        "ไม่สามารถยืนยันตัวตนเดิมในเบราว์เซอร์นี้ได้ ระบบจะไม่สร้างตัวตนหรือคำขอใหม่",
      );
    }

    const credential = await signInAnonymously(auth);
    localStorage.setItem(
      authBootstrapMarkerKey,
      JSON.stringify({ version: 1, completedAt: Date.now() }),
    );
    return credential.user;
  }).finally(() => {
    initialization = null;
  });
  return initialization;
}
