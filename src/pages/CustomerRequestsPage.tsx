import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase";
import {
  confirmCustomerRequest,
  customerPaymentMethods,
  rejectCustomerRequest,
  toCustomerPublicProduct,
  waitingForShop,
} from "../customerOrder";
import { businessDate, formatThaiDateTime, money } from "../lib";
import { toFirestoreData } from "../firestoreData";
import { defaultProducts } from "../data";
import { useAuth } from "../store";
import type { CustomerOrderRequest, PaymentMethod } from "../types";

export default function CustomerRequestsPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<CustomerOrderRequest[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!db) return;
    return onSnapshot(collection(db, "customerOrderRequests"), (snapshot) =>
      setRequests(
        snapshot.docs
          .map((row) => row.data() as CustomerOrderRequest)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      ),
    );
  }, []);
  const confirm = async (
    request: CustomerOrderRequest,
    paymentMethod: PaymentMethod,
  ) => {
    if (!db || busy) return;
    try {
      setBusy(request.id);
      const firestore = db;
      await runTransaction(firestore, async (transaction) => {
        const requestRef = doc(firestore, "customerOrderRequests", request.id);
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
          paymentMethod,
          (counter.data()?.lastSequence ?? 0) + 1,
          user?.uid,
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
      setMessage("ยืนยันคำขอและสร้างคิวแล้ว");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "ยืนยันไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  };
  const reject = async (request: CustomerOrderRequest) => {
    if (!db || busy) return;
    const reason = window.prompt("เหตุผล (ไม่บังคับ)") ?? undefined;
    try {
      setBusy(request.id);
      await runTransaction(db, async (transaction) => {
        const ref = doc(db!, "customerOrderRequests", request.id);
        const current = (await transaction.get(ref)).data() as
          | CustomerOrderRequest
          | undefined;
        if (!current) throw new Error("ไม่พบคำขอ");
        transaction.set(
          ref,
          toFirestoreData(rejectCustomerRequest(current, reason)),
        );
      });
      setMessage("ปฏิเสธคำขอแล้ว");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "ปฏิเสธไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  };
  const pending = requests.filter(
    (request) => request.status === waitingForShop,
  );
  const seed = async () => {
    if (!db || busy) return;
    try {
      setBusy("seed");
      await runTransaction(db, async (transaction) => {
        for (const product of defaultProducts) {
          const ref = doc(db!, "publicMenu", product.id);
          if (!(await transaction.get(ref)).exists())
            transaction.set(ref, toCustomerPublicProduct(product));
        }
        const availabilityRef = doc(
          db!,
          "publicSettings",
          "toppingAvailability",
        );
        if (!(await transaction.get(availabilityRef)).exists())
          transaction.set(availabilityRef, {
            availability: {},
            updatedAt: new Date().toISOString(),
          });
      });
      setMessage("เพิ่มเมนู UAT ที่ยังไม่มีแล้ว");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "seed ไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Customer QR Demo/UAT</p>
          <h1>คำขอจากลูกค้า</h1>
          <p>คำขอจะได้รับเลขคิวเมื่อร้านยืนยันเท่านั้น</p>
        </div>
        <button
          className="secondary"
          disabled={busy === "seed"}
          onClick={() => void seed()}
        >
          Seed เมนู UAT
        </button>
      </div>
      {message && <p className="notice">{message}</p>}
      {!pending.length ? (
        <div className="empty">ไม่มีคำขอที่รอยืนยัน</div>
      ) : (
        <section className="queue-grid">
          {pending.map((request) => (
            <article className="queue-card" key={request.id}>
              <h2>{request.customerName || "ลูกค้าทั่วไป"}</h2>
              <p>
                {formatThaiDateTime(request.createdAt)} • {request.itemCount}{" "}
                รายการ • {money(request.total)}
              </p>
              {request.customerNote && <p>หมายเหตุ: {request.customerNote}</p>}
              {request.items.map((item) => (
                <p key={item.id}>
                  <strong>
                    {item.productName} × {item.quantity}
                  </strong>
                  <br />
                  {item.selectedOptions.join(", ")}
                </p>
              ))}
              <div className="button-row">
                {customerPaymentMethods.map((method) => (
                  <button
                    className="primary"
                    disabled={busy === request.id}
                    key={method}
                    onClick={() => void confirm(request, method)}
                  >
                    ยืนยัน • {method}
                  </button>
                ))}
                <button
                  className="secondary"
                  disabled={busy === request.id}
                  onClick={() => void reject(request)}
                >
                  ปฏิเสธ
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
