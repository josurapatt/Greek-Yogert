import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
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
import {
  rebuildTrustedCustomerConfirmation,
  trustedCustomerMismatchPrefix,
} from "./trustedCustomerConfirmation";
import { assertCustomerRequestStructuralPolicy } from "./customerRequestPolicy";
import {
  confirmationAuditOutcome,
  operationalAuditSchemaVersion,
  writeOperationalAuditEvent,
} from "./operationalAudit";
import {
  hydrateCustomerRequestInTransaction,
  type PersistedCustomerRequestV2,
} from "./customerRequestChunks";
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
  try {
    await runTransaction(firestore, async (transaction) => {
      const requestRef = doc(firestore, "customerOrderRequests", requestId);
      const persisted = (await transaction.get(requestRef)).data() as
        | CustomerOrderRequest
        | PersistedCustomerRequestV2
        | undefined;
      if (!persisted) throw new Error("ไม่พบคำขอ");
      if (persisted.status !== waitingForShop || persisted.confirmedOrderId)
        throw new Error("คำขอนี้ถูกดำเนินการแล้ว");
      const current = await hydrateCustomerRequestInTransaction(
        firestore,
        transaction,
        persisted,
      );
      try {
        assertCustomerRequestStructuralPolicy(current);
      } catch (cause) {
        throw new Error(
          `${trustedCustomerMismatchPrefix}: ${cause instanceof Error ? cause.message : "รูปแบบคำขอไม่ถูกต้อง"}`,
          { cause },
        );
      }
      const date = businessDate();
      const counterRef = doc(firestore, "counters", date);
      const productIds = [
        ...new Set(current.items.map((item) => item.productId)),
      ];
      if (productIds.some((id) => !id))
        throw new Error("คำขอไม่ตรงกับเมนูปัจจุบัน: รหัสสินค้าไม่ถูกต้อง");
      const productRefs = productIds.map((id) =>
        doc(firestore, "products", id),
      );
      const availabilityRef = doc(firestore, "settings", "toppingAvailability");
      const [counter, availabilitySnapshot, ...productSnapshots] =
        await Promise.all([
          transaction.get(counterRef),
          transaction.get(availabilityRef),
          ...productRefs.map((ref) => transaction.get(ref)),
        ]);
      const privateProducts = productSnapshots.map((snapshot, index) => {
        if (!snapshot.exists())
          throw new Error(
            "คำขอไม่ตรงกับเมนูปัจจุบัน: ไม่พบสินค้าในเมนูปัจจุบัน",
          );
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
      if (persisted.schemaVersion === 2 && !("items" in persisted)) {
        const { items: _items, ...requestUpdate } = result.request;
        void _items;
        transaction.set(requestRef, toFirestoreData(requestUpdate), {
          merge: true,
        });
      } else transaction.set(requestRef, toFirestoreData(result.request));
      if (staffUid)
        transaction.set(
          doc(firestore, "customerOrderingAuditEvents", crypto.randomUUID()),
          {
            eventType: "confirmation_attempt",
            outcome: "confirmed",
            actorUid: staffUid,
            requestId,
            occurredAt: serverTimestamp(),
            schemaVersion: operationalAuditSchemaVersion,
          },
        );
    });
  } catch (cause) {
    if (staffUid) {
      try {
        await writeOperationalAuditEvent(firestore, {
          eventType: "confirmation_attempt",
          outcome: confirmationAuditOutcome(cause),
          actorUid: staffUid,
          requestId,
        });
      } catch {
        // Failure evidence is best effort when the original transaction aborts.
      }
    }
    throw cause;
  }
}

export async function rejectCustomerRequestTransaction(
  firestore: Firestore,
  requestId: string,
  reason?: string,
  staffUid?: string,
): Promise<void> {
  await runTransaction(firestore, async (transaction) => {
    const requestRef = doc(firestore, "customerOrderRequests", requestId);
    const current = (await transaction.get(requestRef)).data() as
      | CustomerOrderRequest
      | PersistedCustomerRequestV2
      | undefined;
    if (!current) throw new Error("ไม่พบคำขอ");
    transaction.set(
      requestRef,
      toFirestoreData(
        rejectCustomerRequest(current as CustomerOrderRequest, reason),
      ),
    );
    if (staffUid)
      transaction.set(
        doc(firestore, "customerOrderingAuditEvents", crypto.randomUUID()),
        {
          eventType: "request_decision",
          outcome: "rejected",
          actorUid: staffUid,
          requestId,
          occurredAt: serverTimestamp(),
          schemaVersion: operationalAuditSchemaVersion,
        },
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
