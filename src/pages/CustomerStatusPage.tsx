import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import OrderItemSummary from "../components/OrderItemSummary";
import { formatThaiDateTime, money } from "../lib";
import { db } from "../firebase";
import { useCustomer } from "../customerFirebase";
import { runtimeConfig } from "@runtime-config";
import type { CustomerOrderRequest } from "../types";
import { hydrateCustomerRequest } from "../customerRequestChunks";
import { waitingForShop } from "../customerOrder";
import {
  clearCustomerSubmissionEnvelope,
  rememberCustomerActiveRequest,
} from "../customerSubmissionRetry";

export default function CustomerStatusPage() {
  const { requestId } = useParams();
  const { uid, loading } = useCustomer();
  const [request, setRequest] = useState<CustomerOrderRequest | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!db || !uid || !requestId) return;
    let active = true;
    const stop = onSnapshot(
      doc(db, "customerOrderRequests", requestId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setError("ไม่พบคำขอ");
          return;
        }
        void hydrateCustomerRequest(
          db!,
          snapshot.data() as CustomerOrderRequest,
        )
          .then((value) => {
            if (!active) return;
            if (value.ownerUid !== uid) {
              setError("ไม่มีสิทธิ์ดูคำขอนี้");
              return;
            }
            if (value.status === waitingForShop)
              rememberCustomerActiveRequest(uid, value.id);
            else clearCustomerSubmissionEnvelope(uid, requestId);
            setError("");
            setRequest(value);
          })
          .catch(() => active && setError("ข้อมูลรายการสินค้าไม่ครบ"));
      },
      () => setError("ไม่สามารถเปิดสถานะคำขอได้"),
    );
    return () => {
      active = false;
      stop();
    };
  }, [uid, requestId]);
  if (loading)
    return (
      <main className="customer-page">
        <p>กำลังเปิดสถานะ…</p>
      </main>
    );
  if (error)
    return (
      <main className="customer-page">
        <p className="validation">{error}</p>
        <p>
          ระบบยังเก็บรหัสคำขอเดิมไว้และจะไม่สร้างคำขอใหม่
          กรุณาลองเปิดสถานะอีกครั้งด้วยเบราว์เซอร์เดิม
        </p>
        <button className="secondary" onClick={() => window.location.reload()}>
          ลองเปิดสถานะอีกครั้ง
        </button>
      </main>
    );
  if (!request)
    return (
      <main className="customer-page">
        <p>กำลังอัปเดตสถานะ…</p>
      </main>
    );
  return (
    <main className="customer-page">
      {runtimeConfig.isCustomerQrUat && (
        <span className="demo-pill">โหมดทดลอง</span>
      )}
      <h1>{request.status}</h1>
      {request.queueNumber ? (
        <p>
          เลขคิวของคุณ: <strong>{request.queueNumber}</strong>
        </p>
      ) : (
        <p>ร้านได้รับคำขอแล้ว และจะกำหนดเลขคิวหลังยืนยัน</p>
      )}
      <p>อัปเดตล่าสุด {formatThaiDateTime(request.updatedAt)}</p>
      <section className="customer-cart">
        {request.items.map((item) => (
          <OrderItemSummary item={item} key={item.id} />
        ))}
        <strong>{money(request.total)}</strong>
        {request.rejectionReason && <p>เหตุผล: {request.rejectionReason}</p>}
      </section>
      {request.status === waitingForShop ? (
        <p className="notice">
          คำขอนี้ยังรอร้านยืนยัน กรุณาเก็บหน้านี้ไว้ดูสถานะ
        </p>
      ) : (
        <Link className="secondary" to="/order">
          สั่งรายการใหม่
        </Link>
      )}
    </main>
  );
}
