import { doc, runTransaction } from "firebase/firestore";
import { useState } from "react";
import { Link } from "react-router-dom";
import { db } from "../firebase";
import {
  customerPaymentMethods,
  toCustomerPublicProduct,
} from "../customerOrder";
import { formatThaiDateTime, money } from "../lib";
import { defaultProducts } from "../data";
import { useAuth, useData } from "../store";
import { confirmCustomerRequestTransaction, rejectCustomerRequestTransaction, requestIsStillPending } from "../customerRequestActions";
import type { CustomerOrderRequest, StaffPaymentMethod } from "../types";
import { pendingCustomerRequests } from "../customerRequests";

export default function CustomerRequestsPage() {
  const { user } = useAuth();
  const { customerRequests: requests, dismissCustomerRequest } = useData();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const confirm = async (
    request: CustomerOrderRequest,
    paymentMethod: StaffPaymentMethod,
  ) => {
    if (!db || busy) return;
    try {
      setBusy(request.id);
      await confirmCustomerRequestTransaction(db, request.id, paymentMethod, user?.uid);
      dismissCustomerRequest(request.id);
      setMessage("ยืนยันคำขอและสร้างคิวแล้ว");
    } catch (cause) {
      if (db && !(await requestIsStillPending(db, request.id))) dismissCustomerRequest(request.id);
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
      await rejectCustomerRequestTransaction(db, request.id, reason);
      dismissCustomerRequest(request.id);
      setMessage("ปฏิเสธคำขอแล้ว");
    } catch (cause) {
      if (db && !(await requestIsStillPending(db, request.id))) dismissCustomerRequest(request.id);
      setMessage(cause instanceof Error ? cause.message : "ปฏิเสธไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  };
  const pending = pendingCustomerRequests(requests);
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
              <h2><Link to={`/customer-requests/${request.id}`}>{request.customerName || "ลูกค้าทั่วไป"}</Link></h2>
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
                <Link className="secondary" to={`/customer-requests/${request.id}`}>ดูรายละเอียด</Link>
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
