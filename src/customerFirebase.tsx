/* oxlint-disable react/only-export-components -- provider and its typed hook intentionally share this module */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { defaultProducts } from "./data";
import { ensureCustomerAnonymousSession } from "./customerAnonymousAuth";
import { toFirestoreData } from "./firestoreData";
import { auth, db, firebaseReady } from "./firebase";
import { runtimeConfig } from "./runtimeConfig";
import {
  createCustomerRequest,
  customerPublicProductToProduct,
  waitingForShop,
} from "./customerOrder";
import type {
  CartItem,
  CustomerOrderRequest,
  PublicCustomerProduct,
  Product,
  ToppingAvailability,
} from "./types";
import {
  parsePublicCustomerOrderingControl,
  type CustomerOrderingControlState,
} from "./customerOrderingControl";
import {
  assertCustomerSubmissionCooldown,
  assertCustomerProfileSubmissionAvailable,
  clearCustomerSubmissionEnvelope,
  customerSubmissionStorageEvent,
  loadCustomerActiveRequestId,
  loadCustomerProfileActiveRequest,
  loadCustomerSubmissionEnvelope,
  markCustomerSubmissionUncertain,
  markCustomerSubmissionSubmitted,
  prepareCustomerSubmissionEnvelope,
  recordCustomerSubmissionAccepted,
  withCustomerSubmissionLock,
  type CustomerSubmissionEnvelope,
} from "./customerSubmissionRetry";
import {
  hydrateCustomerRequest,
  splitCustomerRequestForWrite,
} from "./customerRequestChunks";

interface CustomerValue {
  uid: string | null;
  products: Product[];
  availability: ToppingAvailability;
  loading: boolean;
  orderingControl: CustomerOrderingControlState;
  pendingSubmission: CustomerSubmissionEnvelope | null;
  activeRequestId: string | null;
  submit(
    items: CartItem[],
    input: { customerName?: string; customerNote?: string },
  ): Promise<CustomerOrderRequest>;
  retryPending(): Promise<CustomerOrderRequest>;
}
const CustomerContext = createContext<CustomerValue | null>(null);

export function shouldInitializeCustomerFirebase(
  enabled: boolean,
  hasAuth: boolean,
): boolean {
  return enabled && hasAuth;
}

export function CustomerProvider({
  children,
  enabled = runtimeConfig.customerQrEnabled,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const [uid, setUid] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>(() =>
    firebaseReady ? [] : defaultProducts,
  );
  const [availability, setAvailability] = useState<ToppingAvailability>({});
  const [loading, setLoading] = useState(Boolean(firebaseReady));
  const [orderingControl, setOrderingControl] =
    useState<CustomerOrderingControlState>(() =>
      firebaseReady
        ? {
            status: "loading",
            enabled: false,
            message: "กำลังตรวจสอบสถานะร้าน…",
          }
        : { status: "enabled", enabled: true, message: "" },
    );
  const [pendingSubmission, setPendingSubmission] =
    useState<CustomerSubmissionEnvelope | null>(null);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  useEffect(() => {
    if (!shouldInitializeCustomerFirebase(enabled, Boolean(auth)) || !auth) {
      setLoading(false);
      return;
    }
    return onAuthStateChanged(auth, (user) => {
      if (user) {
        setUid(user.uid);
        setLoading(false);
      } else if (auth) {
        void ensureCustomerAnonymousSession(auth).catch(() =>
          setLoading(false),
        );
      }
    });
  }, [enabled]);
  useEffect(() => {
    if (!db || !uid) return;
    const firestore = db;
    const menuQuery = query(collection(firestore, "publicMenu"), limit(100));
    const stopMenu = onSnapshot(menuQuery, (snapshot) =>
      setProducts(
        snapshot.docs.map((row) =>
          customerPublicProductToProduct(row.data() as PublicCustomerProduct),
        ),
      ),
    );
    const stopAvailability = onSnapshot(
      doc(firestore, "publicSettings", "toppingAvailability"),
      (snapshot) =>
        setAvailability(
          (snapshot.data()?.availability as ToppingAvailability | undefined) ??
            {},
        ),
    );
    const stopControl = onSnapshot(
      doc(firestore, "publicSettings", "customerOrdering"),
      (snapshot) =>
        setOrderingControl(
          snapshot.exists()
            ? parsePublicCustomerOrderingControl(snapshot.data())
            : parsePublicCustomerOrderingControl(null),
        ),
      () => setOrderingControl(parsePublicCustomerOrderingControl(null)),
    );
    const syncSubmissionState = () => {
      const envelope = loadCustomerSubmissionEnvelope(uid);
      setPendingSubmission(envelope?.state === "submitted" ? null : envelope);
      setActiveRequestId(loadCustomerActiveRequestId(uid));
    };
    syncSubmissionState();
    const reconcileActiveRequest = async () => {
      const requestId = loadCustomerActiveRequestId(uid);
      if (!requestId) return;
      try {
        const snapshot = await getDoc(
          doc(firestore, "customerOrderRequests", requestId),
        );
        if (!snapshot.exists()) return;
        const request = await hydrateCustomerRequest(
          firestore,
          snapshot.data() as CustomerOrderRequest,
        );
        if (request.ownerUid !== uid || request.id !== requestId) return;
        if (request.status === waitingForShop) setActiveRequestId(requestId);
        else {
          clearCustomerSubmissionEnvelope(uid, requestId);
          setPendingSubmission(null);
          setActiveRequestId(null);
        }
      } catch {
        // Preserve the exact active ID through temporary status/read failures.
      }
    };
    void reconcileActiveRequest();
    const handleStorage = () => syncSubmissionState();
    window.addEventListener("storage", handleStorage);
    window.addEventListener(customerSubmissionStorageEvent, handleStorage);
    return () => {
      stopMenu();
      stopAvailability();
      stopControl();
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(customerSubmissionStorageEvent, handleStorage);
    };
  }, [uid]);
  const executeEnvelope = async (envelope: CustomerSubmissionEnvelope) => {
    if (!uid) throw new Error("กำลังเชื่อมต่อระบบ กรุณาลองใหม่");
    if (!orderingControl.enabled)
      throw new Error(
        orderingControl.message || "ร้านปิดรับคำสั่งซื้อใหม่ชั่วคราว",
      );
    const resolveActiveRequest = async (activeId: string) => {
      try {
        const activeSnapshot = await getDoc(
          doc(db!, "customerOrderRequests", activeId),
        );
        if (!activeSnapshot.exists())
          throw new Error("ไม่พบคำขอเดิมที่บันทึกไว้");
        const activeRequest = await hydrateCustomerRequest(
          db!,
          activeSnapshot.data() as CustomerOrderRequest,
        );
        if (activeRequest.ownerUid !== uid || activeRequest.id !== activeId)
          throw new Error("ตรวจสอบคำขอเดิมไม่ได้");
        if (activeRequest.status === waitingForShop) {
          setPendingSubmission(null);
          setActiveRequestId(activeId);
          return activeRequest;
        }
        clearCustomerSubmissionEnvelope(uid, activeId);
        setPendingSubmission(null);
        setActiveRequestId(null);
        return null;
      } catch (cause) {
        throw new Error(
          "มีคำขอเดิมอยู่ แต่ยังเปิดสถานะไม่ได้ ระบบจะเก็บรหัสเดิมและไม่สร้างคำขอใหม่",
          { cause },
        );
      }
    };

    return withCustomerSubmissionLock(uid, async () => {
      const storedEnvelope = loadCustomerSubmissionEnvelope(uid);
      if (storedEnvelope) envelope = storedEnvelope;
      if (envelope.ownerUid !== uid)
        throw new Error(
          "ตัวตนสำหรับคำขอเปลี่ยนไป ระบบจะไม่สร้างคำขอใหม่ กรุณาติดต่อพนักงาน",
        );
      const profileState = loadCustomerProfileActiveRequest(uid);
      if (profileState.status === "blocked")
        throw new Error(
          "ตัวตนสำหรับคำขอเปลี่ยนไป ระบบจะไม่สร้างคำขอใหม่ กรุณาติดต่อพนักงาน",
        );
      if (profileState.status === "active") {
        const activeRequest = await resolveActiveRequest(
          profileState.pointer.requestId,
        );
        if (activeRequest) return activeRequest;
      }
      if (db && envelope.state === "uncertain") {
        try {
          const existing = await getDoc(
            doc(db, "customerOrderRequests", envelope.retryId),
          );
          if (existing.exists()) {
            const recovered = await hydrateCustomerRequest(
              db,
              existing.data() as CustomerOrderRequest,
            );
            if (
              recovered.ownerUid !== uid ||
              recovered.id !== envelope.retryId ||
              recovered.retryId !== envelope.retryId
            )
              throw new Error("ไม่สามารถตรวจสอบคำขอเดิมได้ กรุณาติดต่อพนักงาน");
            markCustomerSubmissionSubmitted(envelope);
            setPendingSubmission(null);
            setActiveRequestId(recovered.id);
            recordCustomerSubmissionAccepted(uid);
            return recovered;
          }
        } catch {
          // Nonexistent request IDs are intentionally unreadable. Replaying the
          // same atomic create is safe; an accepted create becomes a denied
          // update and is reconciled by the post-write exact-document probe.
        }
      }
      let latestProducts = products;
      let latestAvailability = availability;
      if (db) {
        const [menuSnapshot, availabilitySnapshot] = await Promise.all([
          getDocs(query(collection(db, "publicMenu"), limit(100))),
          getDoc(doc(db, "publicSettings", "toppingAvailability")),
        ]);
        latestProducts = menuSnapshot.docs.map((row) =>
          customerPublicProductToProduct(row.data() as PublicCustomerProduct),
        );
        latestAvailability =
          (availabilitySnapshot.data()?.availability as
            | ToppingAvailability
            | undefined) ?? {};
        setProducts(latestProducts);
        setAvailability(latestAvailability);
      }
      const request = createCustomerRequest(
        envelope.retryId,
        uid,
        envelope.items,
        latestProducts,
        latestAvailability,
        envelope.input,
      );
      if (db) {
        const firestore = db;
        const boundaryState = loadCustomerProfileActiveRequest(uid);
        if (boundaryState.status === "blocked")
          throw new Error(
            "ตัวตนสำหรับคำขอเปลี่ยนไป ระบบจะไม่สร้างคำขอใหม่ กรุณาติดต่อพนักงาน",
          );
        if (boundaryState.status === "active") {
          const activeRequest = await resolveActiveRequest(
            boundaryState.pointer.requestId,
          );
          if (activeRequest) return activeRequest;
        }
        try {
          const { parent, itemDocuments, groups } =
            splitCustomerRequestForWrite(request);
          const batch = writeBatch(firestore);
          batch.set(doc(firestore, "customerOrderRequests", envelope.retryId), {
            ...toFirestoreData(parent),
            submittedAt: serverTimestamp(),
          });
          itemDocuments.forEach((entry) =>
            batch.set(
              doc(
                firestore,
                "customerOrderRequests",
                envelope.retryId,
                "items",
                entry.id,
              ),
              toFirestoreData(entry.value),
            ),
          );
          groups.forEach((entry) =>
            batch.set(
              doc(
                firestore,
                "customerOrderRequests",
                envelope.retryId,
                "itemGroups",
                entry.id,
              ),
              toFirestoreData(entry.value),
            ),
          );
          await batch.commit();
        } catch (cause) {
          try {
            const recovered = await getDoc(
              doc(db, "customerOrderRequests", envelope.retryId),
            );
            if (recovered.exists()) {
              const value = await hydrateCustomerRequest(
                db,
                recovered.data() as CustomerOrderRequest,
              );
              if (
                value.ownerUid === uid &&
                value.id === envelope.retryId &&
                value.retryId === envelope.retryId
              ) {
                markCustomerSubmissionSubmitted(envelope);
                setPendingSubmission(null);
                setActiveRequestId(value.id);
                recordCustomerSubmissionAccepted(uid);
                return value;
              }
            }
          } catch {
            // The exact-document recovery probe is intentionally best effort.
          }
          const uncertain = markCustomerSubmissionUncertain(envelope);
          setPendingSubmission(uncertain);
          throw new Error(
            "ยังยืนยันผลการส่งไม่ได้ คำขอเดิมถูกเก็บไว้แล้ว กรุณากดลองตรวจสอบอีกครั้ง ห้ามส่งรายการใหม่",
            { cause },
          );
        }
      }
      markCustomerSubmissionSubmitted(envelope);
      setPendingSubmission(null);
      setActiveRequestId(request.id);
      recordCustomerSubmissionAccepted(uid);
      return request;
    });
  };
  const submit = async (
    items: CartItem[],
    input: { customerName?: string; customerNote?: string },
  ) => {
    if (!uid) throw new Error("กำลังเชื่อมต่อระบบ กรุณาลองใหม่");
    assertCustomerProfileSubmissionAvailable(uid);
    if (activeRequestId)
      throw new Error("มีคำขอที่รอร้านยืนยันอยู่ กรุณากลับไปดูสถานะคำขอเดิม");
    assertCustomerSubmissionCooldown(uid);
    const envelope = prepareCustomerSubmissionEnvelope(uid, items, input);
    setPendingSubmission(envelope);
    return executeEnvelope(envelope);
  };
  const retryPending = async () => {
    if (!uid) throw new Error("กำลังเชื่อมต่อระบบ กรุณาลองใหม่");
    const envelope = loadCustomerSubmissionEnvelope(uid);
    if (!envelope) throw new Error("ไม่พบคำขอที่รอตรวจสอบ");
    return executeEnvelope(envelope);
  };
  return (
    <CustomerContext.Provider
      value={{
        uid,
        products,
        availability,
        loading,
        orderingControl,
        pendingSubmission,
        activeRequestId,
        submit,
        retryPending,
      }}
    >
      {children}
    </CustomerContext.Provider>
  );
}

export function useCustomer() {
  const value = useContext(CustomerContext);
  if (!value) throw new Error("CustomerProvider missing");
  return value;
}
