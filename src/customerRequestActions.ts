import {
  doc,
  getDoc,
  runTransaction,
  type Firestore,
} from "firebase/firestore";
import { normalizeProduct } from "./data";
import { businessDate } from "./lib";
import {
  confirmCustomerRequest,
  rejectCustomerRequest,
  waitingForShop,
  type StaffPaymentAllocation,
} from "./customerOrder";
import { toFirestoreData } from "./firestoreData";
import { rebuildTrustedCustomerConfirmation } from "./trustedCustomerConfirmation";
import type {
  CustomerOrderRequest,
  Product,
  ToppingAvailability,
} from "./types";

export async function confirmCustomerRequestTransaction(
  firestore: Firestore,
  requestId: string,
  allocation: StaffPaymentAllocation,
  staffUid?: string,
): Promise<void> {
  await runTransaction(firestore, async (transaction) => {
    const requestRef = doc(firestore, "customerOrderRequests", requestId);
    const current = (await transaction.get(requestRef)).data() as
      | CustomerOrderRequest
      | undefined;
    if (!current) throw new Error("ไม่พบคำขอ");
    if (current.status !== waitingForShop || current.confirmedOrderId)
      throw new Error("คำขอนี้ถูกดำเนินการแล้ว");
    const date = businessDate();
    const counterRef = doc(firestore, "counters", date);
    const productIds = [
      ...new Set(current.items.map((item) => item.productId)),
    ];
    if (productIds.some((id) => !id))
      throw new Error("คำขอไม่ตรงกับเมนูปัจจุบัน: รหัสสินค้าไม่ถูกต้อง");
    const productRefs = productIds.map((id) => doc(firestore, "products", id));
    const availabilityRef = doc(firestore, "settings", "toppingAvailability");
    const [counter, availabilitySnapshot, ...productSnapshots] =
      await Promise.all([
        transaction.get(counterRef),
        transaction.get(availabilityRef),
        ...productRefs.map((ref) => transaction.get(ref)),
      ]);
    const privateProducts = productSnapshots.map((snapshot, index) => {
      if (!snapshot.exists())
        throw new Error("คำขอไม่ตรงกับเมนูปัจจุบัน: ไม่พบสินค้าในเมนูปัจจุบัน");
      const product = snapshot.data() as Product;
      if (product.id !== productIds[index])
        throw new Error("คำขอไม่ตรงกับเมนูปัจจุบัน: รหัสสินค้าไม่ถูกต้อง");
      return normalizeProduct(product);
    });
    const availability =
      (availabilitySnapshot.data()?.availability as
        | ToppingAvailability
        | undefined) ?? {};
    const trusted = rebuildTrustedCustomerConfirmation(
      current,
      privateProducts,
      availability,
    );
    const result = confirmCustomerRequest(
      current,
      allocation,
      (counter.data()?.lastSequence ?? 0) + 1,
      staffUid,
      undefined,
      trusted.items,
    );
    transaction.set(counterRef, {
      lastSequence: Number(result.order.queueNumber.replace(/\D/g, "")),
      updatedAt: result.order.createdAt,
    });
    transaction.set(
      doc(firestore, "orders", result.order.id),
      toFirestoreData(result.order),
    );
    transaction.set(requestRef, toFirestoreData(result.request));
  });
}

export async function rejectCustomerRequestTransaction(
  firestore: Firestore,
  requestId: string,
  reason?: string,
): Promise<void> {
  await runTransaction(firestore, async (transaction) => {
    const requestRef = doc(firestore, "customerOrderRequests", requestId);
    const current = (await transaction.get(requestRef)).data() as
      | CustomerOrderRequest
      | undefined;
    if (!current) throw new Error("ไม่พบคำขอ");
    transaction.set(
      requestRef,
      toFirestoreData(rejectCustomerRequest(current, reason)),
    );
  });
}

export async function requestIsStillPending(
  firestore: Firestore,
  requestId: string,
): Promise<boolean> {
  const snapshot = await getDoc(
    doc(firestore, "customerOrderRequests", requestId),
  );
  return (
    snapshot.exists() &&
    (snapshot.data() as CustomerOrderRequest).status === waitingForShop
  );
}
