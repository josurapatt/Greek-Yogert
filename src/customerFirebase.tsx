/* oxlint-disable react/only-export-components -- provider and its typed hook intentionally share this module */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
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
import { toFirestoreData } from "./firestoreData";
import { auth, db, firebaseReady } from "./firebase";
import { runtimeConfig } from "./runtimeConfig";
import {
  createCustomerRequest,
  customerPublicProductToProduct,
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
  clearCustomerSubmissionEnvelope,
  loadCustomerSubmissionEnvelope,
  markCustomerSubmissionUncertain,
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
  useEffect(() => {
    if (!shouldInitializeCustomerFirebase(enabled, Boolean(auth)) || !auth) {
      setLoading(false);
      return;
    }
    return onAuthStateChanged(auth, (user) => {
      if (user) {
        setUid(user.uid);
        setLoading(false);
      } else if (auth) void signInAnonymously(auth);
    });
  }, [enabled]);
  useEffect(() => {
    if (!db || !uid) return;
    const menuQuery = query(collection(db, "publicMenu"), limit(100));
    const stopMenu = onSnapshot(menuQuery, (snapshot) =>
      setProducts(
        snapshot.docs.map((row) =>
          customerPublicProductToProduct(row.data() as PublicCustomerProduct),
        ),
      ),
    );
    const stopAvailability = onSnapshot(
      doc(db, "publicSettings", "toppingAvailability"),
      (snapshot) =>
        setAvailability(
          (snapshot.data()?.availability as ToppingAvailability | undefined) ??
            {},
        ),
    );
    const stopControl = onSnapshot(
      doc(db, "publicSettings", "customerOrdering"),
      (snapshot) =>
        setOrderingControl(
          snapshot.exists()
            ? parsePublicCustomerOrderingControl(snapshot.data())
            : parsePublicCustomerOrderingControl(null),
        ),
      () => setOrderingControl(parsePublicCustomerOrderingControl(null)),
    );
    setPendingSubmission(loadCustomerSubmissionEnvelope(uid));
    return () => {
      stopMenu();
      stopAvailability();
      stopControl();
    };
  }, [uid]);
  const executeEnvelope = async (envelope: CustomerSubmissionEnvelope) => {
    if (!uid) throw new Error("กำลังเชื่อมต่อระบบ กรุณาลองใหม่");
    if (!orderingControl.enabled)
      throw new Error(
        orderingControl.message || "ร้านปิดรับคำสั่งซื้อใหม่ชั่วคราว",
      );
    return withCustomerSubmissionLock(uid, async () => {
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
            clearCustomerSubmissionEnvelope(uid);
            setPendingSubmission(null);
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
        try {
          const firestore = db;
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
                clearCustomerSubmissionEnvelope(uid);
                setPendingSubmission(null);
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
      clearCustomerSubmissionEnvelope(uid);
      setPendingSubmission(null);
      recordCustomerSubmissionAccepted(uid);
      return request;
    });
  };
  const submit = async (
    items: CartItem[],
    input: { customerName?: string; customerNote?: string },
  ) => {
    if (!uid) throw new Error("กำลังเชื่อมต่อระบบ กรุณาลองใหม่");
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
