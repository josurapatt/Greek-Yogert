import {
  AlertTriangle,
  Copy,
  Minus,
  Pencil,
  Plus,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import ProductModal from "../components/ProductModal";
import { channelLabels, money, orderChannels, orderTotals } from "../lib";
import { useCart, useData } from "../store";
import type { CartItem, OrderChannel, PaymentMethod } from "../types";

export default function CartPage() {
  const {
    items,
    editingOrder,
    channel,
    update,
    remove,
    duplicate,
    clear,
    changeChannel,
  } = useCart();
  const { products, submitOrder, replaceOrder } = useData();
  const navigate = useNavigate();
  const [editingItem, setEditingItem] = useState<CartItem | null>(null);
  const [customerName, setCustomerName] = useState(
    editingOrder?.customerName === "ลูกค้าทั่วไป"
      ? ""
      : (editingOrder?.customerName ?? ""),
  );
  const [paymentMethod, setPayment] = useState<PaymentMethod>(
    editingOrder?.paymentMethod ?? "สด",
  );
  const [discount, setDiscount] = useState(editingOrder?.discount ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (editingOrder) {
      setCustomerName(
        editingOrder.customerName === "ลูกค้าทั่วไป"
          ? ""
          : editingOrder.customerName,
      );
      setPayment(editingOrder.paymentMethod);
      setDiscount(editingOrder.discount);
    }
  }, [editingOrder]);
  const totals = useMemo(() => orderTotals(items, discount), [items, discount]);
  const invalidItems = items.filter((item) => item.validationError);

  const chooseChannel = (next: OrderChannel) => {
    if (next === channel) return;
    if (
      items.length > 0 &&
      !window.confirm(
        `เปลี่ยนช่องทางเป็น ${channelLabels[next]}? ระบบจะคำนวณราคาใหม่และรายการที่ไม่ผ่านกฎจะต้องแก้ไขก่อนส่งออเดอร์`,
      )
    )
      return;
    changeChannel(next, products);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!items.length) return;
    if (!channel) {
      setError("กรุณาเลือกช่องทางการขายก่อนส่งออเดอร์");
      return;
    }
    if (invalidItems.length) {
      setError("มีสินค้าที่ต้องแก้ไขก่อนส่งออเดอร์");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const draft = { customerName, channel, paymentMethod, items, discount };
      if (editingOrder) {
        await replaceOrder(editingOrder.id, draft);
        clear();
        navigate(`/orders/${editingOrder.id}`);
      } else {
        const order = await submitOrder(draft);
        clear();
        navigate(`/orders/${order.id}?created=1`);
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "บันทึกออเดอร์ไม่สำเร็จ",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!channel)
    return (
      <div className="page">
        <div className="empty">
          <ShoppingBag />
          <h2>กรุณาเลือกช่องทางก่อน</h2>
          <p>ระบบต้องใช้ช่องทางเพื่อคำนวณราคาและกฎท็อปปิ้ง</p>
          <Link className="primary" to="/order">
            เลือกช่องทาง
          </Link>
        </div>
      </div>
    );

  return (
    <div className="page">
      <div className="channel-banner cart-channel">
        <div>
          <span>ช่องทางออเดอร์</span>
          <strong>{channelLabels[channel]}</strong>
        </div>
        <div className="channel-switches">
          {orderChannels
            .filter((value) => value !== channel)
            .map((value) => (
              <button key={value} onClick={() => chooseChannel(value)}>
                เปลี่ยนเป็น {channelLabels[value]}
              </button>
            ))}
        </div>
      </div>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {editingOrder
              ? `แก้ไข ${editingOrder.queueNumber}`
              : `ตรวจสอบออเดอร์ • ${channelLabels[channel]}`}
          </p>
          <h1>ตะกร้าสินค้า</h1>
        </div>
        <Link className="secondary" to="/order">
          + เพิ่มสินค้า
        </Link>
      </div>
      {!items.length ? (
        <div className="empty">
          <ShoppingBag />
          <h2>ยังไม่มีสินค้าในตะกร้า</h2>
          <p>เลือกสินค้าอย่างน้อย 1 รายการก่อนส่งออเดอร์</p>
          <Link className="primary" to="/order">
            เลือกสินค้า
          </Link>
        </div>
      ) : (
        <form className="cart-layout" onSubmit={submit}>
          <section className="cart-items">
            {items.map((item) => (
              <article
                className={`cart-item ${item.validationError ? "invalid-item" : ""}`}
                key={item.id}
              >
                <div className="cart-item-main">
                  <div>
                    <h3>{item.productName}</h3>
                    {item.selectedOptions.length > 0 && (
                      <p>{item.selectedOptions.join(" • ")}</p>
                    )}
                    <strong>{money(item.unitPrice)} / ชิ้น</strong>
                    {item.priceBreakdown && (
                      <small className="snapshot-line">
                        ราคาหลัก {money(item.priceBreakdown.basePrice)}
                        {item.priceBreakdown.premiumIncludedSurcharge > 0 &&
                          ` • พรีเมียม +${money(item.priceBreakdown.premiumIncludedSurcharge)}`}
                        {item.priceBreakdown.extraToppingCharges > 0 &&
                          ` • เพิ่มพิเศษ +${money(item.priceBreakdown.extraToppingCharges)}`}
                      </small>
                    )}
                    {item.validationError && (
                      <p className="item-error">
                        <AlertTriangle /> {item.validationError}
                      </p>
                    )}
                  </div>
                  <div className="item-actions">
                    <button
                      type="button"
                      title="แก้ไข"
                      onClick={() => setEditingItem(item)}
                    >
                      <Pencil />
                    </button>
                    <button
                      type="button"
                      title="ทำสำเนา"
                      onClick={() => duplicate(item.id)}
                    >
                      <Copy />
                    </button>
                    <button
                      type="button"
                      title="ลบ"
                      className="danger-text"
                      onClick={() => remove(item.id)}
                    >
                      <Trash2 />
                    </button>
                  </div>
                </div>
                <div className="cart-item-foot">
                  <div className="quantity">
                    <button
                      type="button"
                      onClick={() =>
                        item.quantity === 1
                          ? remove(item.id)
                          : update(item.id, { quantity: item.quantity - 1 })
                      }
                    >
                      <Minus />
                    </button>
                    <b>{item.quantity}</b>
                    <button
                      type="button"
                      onClick={() =>
                        update(item.id, { quantity: item.quantity + 1 })
                      }
                    >
                      <Plus />
                    </button>
                  </div>
                  <strong>{money(item.unitPrice * item.quantity)}</strong>
                </div>
              </article>
            ))}
          </section>
          <aside className="checkout-card">
            <h2>ข้อมูลออเดอร์</h2>
            <div className="selected-channel-summary">
              <span>ช่องทาง</span>
              <strong>{channelLabels[channel]}</strong>
            </div>
            <label>
              ชื่อลูกค้า <small>(ไม่บังคับ)</small>
              <input
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="ลูกค้าทั่วไป"
              />
            </label>
            <fieldset>
              <legend>วิธีชำระเงิน</legend>
              <div className="segmented">
                {(["สด", "โอน", "โครงการ", "Platform"] as PaymentMethod[]).map(
                  (value) => (
                    <label key={value}>
                      <input
                        type="radio"
                        name="payment"
                        checked={paymentMethod === value}
                        onChange={() => setPayment(value)}
                      />
                      <span>{value}</span>
                    </label>
                  ),
                )}
              </div>
            </fieldset>
            <label>
              ส่วนลด (บาท)
              <input
                type="number"
                min="0"
                max={totals.subtotal}
                value={discount}
                onChange={(event) => setDiscount(Number(event.target.value))}
              />
            </label>
            <div className="totals">
              <p>
                <span>ยอดสินค้า</span>
                <b>{money(totals.subtotal)}</b>
              </p>
              {totals.discount > 0 && (
                <p>
                  <span>ส่วนลด</span>
                  <b>-{money(totals.discount)}</b>
                </p>
              )}
              <p className="grand">
                <span>ยอดสุทธิ</span>
                <b>{money(totals.total)}</b>
              </p>
            </div>
            {invalidItems.length > 0 && (
              <p className="validation">
                มี {invalidItems.length} รายการที่ต้องแก้ไข
              </p>
            )}
            {error && <p className="validation">{error}</p>}
            <button
              className="primary large"
              disabled={busy || invalidItems.length > 0}
            >
              {busy
                ? "กำลังบันทึก…"
                : editingOrder
                  ? "บันทึกการแก้ไข"
                  : "สั่งออเดอร์"}
            </button>
          </aside>
        </form>
      )}
      {editingItem &&
        (() => {
          const product = products.find(
            (entry) => entry.id === editingItem.productId,
          );
          return product ? (
            <ProductModal
              product={product}
              channel={channel}
              initial={editingItem}
              onClose={() => setEditingItem(null)}
              onSave={(item) => {
                update(item.id, item);
                setEditingItem(null);
              }}
            />
          ) : null;
        })()}
    </div>
  );
}
