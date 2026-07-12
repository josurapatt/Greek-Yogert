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
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import { defaultProducts, mergeProducts } from "./data";
import { toFirestoreData } from "./firestoreData";
import { auth, db, firebaseReady } from "./firebase";
import { runtimeConfig } from "./runtimeConfig";
import { createCustomerRequest } from "./customerOrder";
import type {
  CartItem,
  CustomerOrderRequest,
  Product,
  ToppingAvailability,
} from "./types";

interface CustomerValue {
  uid: string | null;
  products: Product[];
  availability: ToppingAvailability;
  loading: boolean;
  submit(
    items: CartItem[],
    input: { customerName?: string; customerNote?: string },
  ): Promise<CustomerOrderRequest>;
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
    const stopMenu = onSnapshot(collection(db, "publicMenu"), (snapshot) =>
      setProducts(
        mergeProducts(snapshot.docs.map((row) => row.data() as Product)),
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
    return () => {
      stopMenu();
      stopAvailability();
    };
  }, [uid]);
  const submit = async (
    items: CartItem[],
    input: { customerName?: string; customerNote?: string },
  ) => {
    if (!uid) throw new Error("กำลังเชื่อมต่อระบบ กรุณาลองใหม่");
    let latestProducts = products;
    let latestAvailability = availability;
    if (db) {
      const [menuSnapshot, availabilitySnapshot] = await Promise.all([
        getDocs(collection(db, "publicMenu")),
        getDoc(doc(db, "publicSettings", "toppingAvailability")),
      ]);
      latestProducts = mergeProducts(
        menuSnapshot.docs.map((row) => row.data() as Product),
      );
      latestAvailability =
        (availabilitySnapshot.data()?.availability as
          | ToppingAvailability
          | undefined) ?? {};
      setProducts(latestProducts);
      setAvailability(latestAvailability);
    }
    const id = db
      ? doc(collection(db, "customerOrderRequests")).id
      : crypto.randomUUID();
    const request = createCustomerRequest(
      id,
      uid,
      items,
      latestProducts,
      latestAvailability,
      input,
    );
    if (db)
      await setDoc(
        doc(db, "customerOrderRequests", id),
        toFirestoreData(request),
      );
    return request;
  };
  return (
    <CustomerContext.Provider
      value={{ uid, products, availability, loading, submit }}
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
