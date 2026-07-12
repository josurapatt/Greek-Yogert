import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import OrderItemSummary from "../components/OrderItemSummary";
import {
  confirmCustomerRequestTransaction,
  rejectCustomerRequestTransaction,
  requestIsStillPending,
} from "../customerRequestActions";
import {
  customerPaymentMethods,
  waitingForShop,
  type StaffPaymentAllocation,
} from "../customerOrder";
import { db } from "../firebase";
import { formatThaiDateTime, money } from "../lib";
import { useAuth, useData } from "../store";
import type { StaffPaymentMethod } from "../types";

export default function CustomerRequestDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { customerRequests, dismissCustomerRequest } = useData();
  const request = customerRequests.find((entry) => entry.id === id);
  const [payments, setPayments] = useState<
    Record<string, StaffPaymentMethod | undefined>
  >({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const complete = useMemo(
    () => Boolean(request?.items.every((item) => payments[item.id])),
    [payments, request],
  );
  const reconcile = async () => {
    if (db && id && !(await requestIsStillPending(db, id))) {
      dismissCustomerRequest(id);
      return true;
    }
    return false;
  };
  if (!request)
    return (
      <div className="page narrow">
        <Link className="back-link" to="/customer-requests">
          <ArrowLeft /> กลับคำขอลูกค้า
        </Link>
        <div className="empty">ไม่พบคำขอที่รอยืนยัน</div>
      </div>
    );
  const confirm = async () => {
    if (!db || !id || busy || !complete) return;
    try {
      setBusy(true);
      setError("");
      await confirmCustomerRequestTransaction(
        db,
        id,
        payments as StaffPaymentAllocation,
        user?.uid,
      );
      dismissCustomerRequest(id);
      navigate("/queue");
    } catch (cause) {
      await reconcile();
      setError(cause instanceof Error ? cause.message : "ยืนยันไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };
  const reject = async () => {
    if (!db || !id || busy) return;
    const reason = window.prompt("เหตุผล (ไม่บังคับ)") ?? undefined;
    try {
      setBusy(true);
      setError("");
      await rejectCustomerRequestTransaction(db, id, reason);
      dismissCustomerRequest(id);
      navigate("/customer-requests");
    } catch (cause) {
      await reconcile();
      setError(cause instanceof Error ? cause.message : "ปฏิเสธไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page narrow">
      <Link className="back-link" to="/customer-requests">
        <ArrowLeft /> กลับคำขอลูกค้า
      </Link>
      <section className="order-detail">
        <header>
          <div>
            <p className="eyebrow">Customer QR Demo/UAT</p>
            <h1>{request.customerName || "ลูกค้าทั่วไป"}</h1>
            <span className="status pending">{request.status}</span>
          </div>
          <div className="order-total">
            <span>ยอดสุทธิ</span>
            <strong>{money(request.total)}</strong>
          </div>
        </header>
        <div className="detail-meta">
          <p>
            <span>รหัสคำขอ</span>
            <b>{request.id}</b>
          </p>
          <p>
            <span>เวลาสั่ง</span>
            <b>{formatThaiDateTime(request.createdAt)}</b>
          </p>
          {request.customerNote && (
            <p>
              <span>หมายเหตุ</span>
              <b>{request.customerNote}</b>
            </p>
          )}
        </div>
        <div className="detail-items">
          <h2>รายการและวิธีชำระเงิน</h2>
          {request.items.map((item) => (
            <article key={item.id}>
              <span className="item-qty">{item.quantity}</span>
              <div>
                <OrderItemSummary item={item} />
                <strong>
                  {money(item.lineTotal ?? item.unitPrice * item.quantity)}
                </strong>
                <label>
                  วิธีชำระเงิน
                  <select
                    aria-label={`วิธีชำระเงิน ${item.productName}`}
                    value={payments[item.id] ?? ""}
                    onChange={(event) =>
                      setPayments((rows) => ({
                        ...rows,
                        [item.id]: event.target.value as StaffPaymentMethod,
                      }))
                    }
                  >
                    <option value="">เลือกวิธีชำระเงิน</option>
                    {customerPaymentMethods.map((method) => (
                      <option value={method} key={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="detail-actions">
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void reject()}
        >
          <XCircle /> ปฏิเสธ
        </button>
        <button
          className="primary"
          disabled={busy || !complete || request.status !== waitingForShop}
          onClick={() => void confirm()}
        >
          <CheckCircle2 /> ยืนยันและสร้างคิว
        </button>
      </section>
      {error && <p className="validation">{error}</p>}
    </div>
  );
}
