/* oxlint-disable react/only-export-components -- provider and its typed hook intentionally share this module */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { defaultProducts, mergeProducts } from "./data";
import { toFirestoreData } from "./firestoreData";
import { customerQrUatEnabled, auth, db, firebaseReady } from "./firebase";
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

export function CustomerProvider({ children }: { children: ReactNode }) {
  const [uid, setUid] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>(() =>
    firebaseReady ? [] : defaultProducts,
  );
  const [availability, setAvailability] = useState<ToppingAvailability>({});
  const [loading, setLoading] = useState(Boolean(firebaseReady));
  useEffect(() => {
    if (!customerQrUatEnabled || !auth) {
      setLoading(false);
      return;
    }
    return onAuthStateChanged(auth, (user) => {
      if (user) {
        setUid(user.uid);
        setLoading(false);
      } else if (auth) void signInAnonymously(auth);
    });
  }, []);
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
    const id = db
      ? doc(collection(db, "customerOrderRequests")).id
      : crypto.randomUUID();
    const request = createCustomerRequest(
      id,
      uid,
      items,
      products,
      availability,
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
