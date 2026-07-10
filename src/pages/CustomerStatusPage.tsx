import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import OrderItemSummary from "../components/OrderItemSummary";
import { formatThaiDateTime, money } from "../lib";
import { db } from "../firebase";
import { useCustomer } from "../customerFirebase";
import type { CustomerOrderRequest } from "../types";

export default function CustomerStatusPage() {
  const { requestId } = useParams();
  const { uid, loading } = useCustomer();
  const [request, setRequest] = useState<CustomerOrderRequest | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!db || !uid || !requestId) return;
    return onSnapshot(
      doc(db, "customerOrderRequests", requestId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setError("ไม่พบคำขอ");
          return;
        }
        const value = snapshot.data() as CustomerOrderRequest;
        if (value.ownerUid !== uid) {
          setError("ไม่มีสิทธิ์ดูคำขอนี้");
          return;
        }
        setRequest(value);
      },
      () => setError("ไม่สามารถเปิดสถานะคำขอได้"),
    );
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
      <span className="demo-pill">โหมดทดลอง</span>
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
      <Link className="secondary" to="/order">
        สั่งรายการใหม่
      </Link>
    </main>
  );
}
