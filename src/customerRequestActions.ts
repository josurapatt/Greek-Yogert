import {
  doc,
  getDoc,
  runTransaction,
  type Firestore,
} from "firebase/firestore";
import { businessDate } from "./lib";
import {
  confirmCustomerRequest,
  rejectCustomerRequest,
  waitingForShop,
  type StaffPaymentAllocation,
} from "./customerOrder";
import { toFirestoreData } from "./firestoreData";
import type { CustomerOrderRequest } from "./types";

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
    const counter = await transaction.get(counterRef);
    const result = confirmCustomerRequest(
      current,
      allocation,
      (counter.data()?.lastSequence ?? 0) + 1,
      staffUid,
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
