import { ArrowLeft, Ban, CheckCircle2, Pencil, RotateCcw } from "lucide-react";
import { useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { channelLabels, formatThaiDateTime, money, paymentMethodLabel } from "../lib";
import { updateOrderStatusAndNavigate } from "../orderActions";
import { useCart, useData } from "../store";

export default function OrderDetailPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { orders, products, toppingAvailability, setOrderStatus } = useData();
  const { editOrder } = useCart();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const order = orders.find((entry) => entry.id === id);
  if (!order)
    return (
      <div className="page">
        <div className="empty">
          <h2>ไม่พบออเดอร์</h2>
          <Link className="primary" to="/queue">
            กลับไปหน้าคิว
          </Link>
        </div>
      </div>
    );
  const changeStatus = async (status: typeof order.status) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await updateOrderStatusAndNavigate(order.id, status, setOrderStatus, navigate);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "อัปเดตสถานะไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page narrow">
      <Link
        className="back-link"
        to={order.status === "pending" ? "/queue" : "/history"}
      >
        <ArrowLeft /> กลับ
      </Link>
      {params.get("created") && (
        <div className="success-banner">
          <CheckCircle2 />
          <div>
            <strong>รับออเดอร์เรียบร้อย</strong>
            <span>คิว {order.queueNumber} ถูกส่งไปหน้าจัดเตรียมแล้ว</span>
          </div>
        </div>
      )}
      <section className="order-detail">
        <header>
          <div>
            <p className="eyebrow">เลขคิว</p>
            <h1>{order.queueNumber}</h1>
            <span className={`status ${order.status}`}>
              {order.status === "pending"
                ? "รอจัดเตรียม"
                : order.status === "completed"
                  ? "พร้อมส่ง"
                  : "ยกเลิก"}
            </span>
          </div>
          <div className="order-total">
            <span>ยอดสุทธิ</span>
            <strong>{money(order.total)}</strong>
          </div>
        </header>
        <div className="detail-meta">
          <p>
            <span>เลขออเดอร์</span>
            <b>{order.id}</b>
          </p>
          <p>
            <span>ลูกค้า</span>
            <b>{order.customerName}</b>
          </p>
          <p>
            <span>ช่องทาง</span>
            <b>{channelLabels[order.channel] ?? order.channel}</b>
          </p>
          <p>
            <span>ชำระเงิน</span>
            <b>{paymentMethodLabel(order.paymentMethod)}</b>
          </p>
          <p>
            <span>เวลาสั่ง</span>
            <b>{formatThaiDateTime(order.createdAt)}</b>
          </p>
          {order.completedAt && (
            <p>
              <span>เวลาเสร็จ</span>
              <b>{formatThaiDateTime(order.completedAt)}</b>
            </p>
          )}
        </div>
        <div className="detail-items">
          <h2>รายการสินค้า</h2>
          {order.items.map((item) => (
            <article key={item.id}>
              <span className="item-qty">{item.quantity}×</span>
              <div>
                <h3>{item.productName}</h3>
                {(item.selectedOptions?.length ?? 0) > 0 && (
                  <p>{item.selectedOptions.join(" • ")}</p>
                )}
                {item.priceBreakdown && (
                  <small>
                    ราคาหลัก {money(item.priceBreakdown.basePrice)}
                    {item.priceBreakdown.premiumIncludedSurcharge > 0 &&
                      ` • พรีเมียม +${money(item.priceBreakdown.premiumIncludedSurcharge)}`}
                    {item.priceBreakdown.extraToppingCharges > 0 &&
                      ` • เพิ่มพิเศษ +${money(item.priceBreakdown.extraToppingCharges)}`}
                  </small>
                )}
                <small>{money(item.unitPrice)} / ชิ้น</small>
              </div>
              <strong>
                {money(item.lineTotal ?? item.unitPrice * item.quantity)}
              </strong>
            </article>
          ))}
        </div>
        <div className="totals detail-totals">
          <p>
            <span>ยอดสินค้า</span>
            <b>{money(order.subtotal)}</b>
          </p>
          {order.discount > 0 && (
            <p>
              <span>ส่วนลด</span>
              <b>-{money(order.discount)}</b>
            </p>
          )}
          <p className="grand">
            <span>ยอดสุทธิ</span>
            <b>{money(order.total)}</b>
          </p>
        </div>
      </section>
      <section className="detail-actions">
        {order.status === "pending" && (
          <>
            <button
              className="secondary"
              onClick={() => {
                editOrder(order, products, toppingAvailability);
                navigate("/cart");
              }}
            >
              <Pencil /> แก้ไขออเดอร์
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={() => void changeStatus("cancelled")}
            >
              <Ban /> ยกเลิกออเดอร์
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void changeStatus("completed")}
            >
              <CheckCircle2 /> พร้อมส่ง
            </button>
          </>
        )}
        {order.status !== "pending" && (
          <button
            className="primary"
            disabled={busy}
            onClick={() => void changeStatus("pending")}
          >
            <RotateCcw /> นำกลับเข้าคิว
          </button>
        )}
      </section>
      {error && <p className="validation">{error}</p>}
    </div>
  );
}
