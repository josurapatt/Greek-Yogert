import { Minus, Pencil, Plus, ShoppingBasket, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ProductModal from "../components/ProductModal";
import ToppingPackagingDetails from "../components/ToppingPackagingDetails";
import {
  applyCartItemUpdate,
  money,
  orderTotals,
  repriceCartItems,
} from "../lib";
import { toppings } from "../data";
import { customerStorefrontChannel } from "../customerOrder";
import { useCustomer } from "../customerFirebase";
import { runtimeConfig } from "@runtime-config";
import { customerRequestLimits } from "../customerRequestPolicy";
import type { CartItem, Product } from "../types";

export default function CustomerOrderPage() {
  const {
    products,
    availability,
    loading,
    orderingControl = { status: "enabled", enabled: true, message: "" },
    pendingSubmission = null,
    activeRequestId = null,
    submit,
    retryPending = async () => {
      throw new Error("ไม่พบคำขอที่รอตรวจสอบ");
    },
  } = useCustomer();
  const navigate = useNavigate();
  const [items, setItems] = useState<CartItem[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [editingItem, setEditingItem] = useState<CartItem | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [quantityError, setQuantityError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const priced = repriceCartItems(
    items,
    products,
    customerStorefrontChannel,
    toppings,
    availability,
  );
  const invalid = priced.find((item) => item.validationError);
  const totals = orderTotals(priced);
  const totalUnits = priced.reduce((sum, item) => sum + item.quantity, 0);
  const nameError =
    name.length > customerRequestLimits.maxCustomerNameLength
      ? `ชื่อเล่นยาวเกิน ${customerRequestLimits.maxCustomerNameLength} ตัวอักษร`
      : "";
  const noteError =
    note.length > customerRequestLimits.maxCustomerNoteLength
      ? `หมายเหตุยาวเกิน ${customerRequestLimits.maxCustomerNoteLength} ตัวอักษร`
      : "";
  const capError =
    priced.length > customerRequestLimits.maxProductLines
      ? `สั่งได้ไม่เกิน ${customerRequestLimits.maxProductLines} รายการสินค้า`
      : totalUnits > customerRequestLimits.maxTotalUnits
        ? `สั่งได้ไม่เกิน ${customerRequestLimits.maxTotalUnits} ถ้วยต่อคำขอ หากต้องการจำนวนมากกรุณาติดต่อร้าน`
        : totals.total > customerRequestLimits.maxRequestTotal
          ? `ยอดคำขอต้องไม่เกิน ${customerRequestLimits.maxRequestTotal.toLocaleString("th-TH")} บาท`
          : "";
  const updateQuantity = (id: string, quantity: number) =>
    setItems((rows) => {
      const current = rows.find((item) => item.id === id);
      const nextTotal = rows.reduce(
        (sum, item) => sum + (item.id === id ? quantity : item.quantity),
        0,
      );
      if (!current || quantity < 1) return rows;
      if (quantity > customerRequestLimits.maxQuantityPerLine) {
        setQuantityError({
          id,
          message: `รายการนี้มี ${current.quantity} ถ้วย สั่งได้สูงสุด ${customerRequestLimits.maxQuantityPerLine} ถ้วยต่อรายการ`,
        });
        return rows;
      }
      if (nextTotal > customerRequestLimits.maxTotalUnits) {
        setQuantityError({
          id,
          message: `คำขอนี้มี ${totalUnits} ถ้วย สั่งได้สูงสุด ${customerRequestLimits.maxTotalUnits} ถ้วย หากต้องการมากกว่านี้กรุณาติดต่อร้านเพื่อสั่งแบบจำนวนมาก`,
        });
        return rows;
      }
      setQuantityError(null);
      return rows.map((item) =>
        item.id === id ? applyCartItemUpdate(item, { quantity }) : item,
      );
    });
  const remove = (id: string) =>
    setItems((rows) => rows.filter((item) => item.id !== id));
  const edit = (item: CartItem) => {
    const product = products.find((entry) => entry.id === item.productId);
    if (!product) return;
    setEditingItem(item);
    setSelected(product);
  };
  const closeEditor = () => {
    setEditingItem(null);
    setSelected(null);
  };
  const send = async () => {
    try {
      setSending(true);
      setError("");
      const request = await submit(priced, {
        customerName: name,
        customerNote: note,
      });
      setItems([]);
      navigate(`/order/status/${request.id}`, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ส่งคำขอไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  };
  const retry = async () => {
    try {
      setSending(true);
      setError("");
      const request = await retryPending();
      setItems([]);
      navigate(`/order/status/${request.id}`, { replace: true });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "ตรวจสอบคำขอเดิมไม่สำเร็จ",
      );
    } finally {
      setSending(false);
    }
  };
  if (loading)
    return (
      <main className="customer-page">
        <p>กำลังเปิดเมนู…</p>
      </main>
    );
  return (
    <main className="customer-page">
      <header>
        {runtimeConfig.isCustomerQrUat && (
          <span className="demo-pill">โหมดทดลอง</span>
        )}
        <h1>สั่ง Greek &amp; More</h1>
        <p>คำสั่งซื้อจะรอร้านยืนยันก่อนรับเลขคิว</p>
      </header>
      {!orderingControl.enabled && (
        <section className="notice" role="status">
          <strong>ปิดรับคำสั่งซื้อใหม่ชั่วคราว</strong>
          <p>{orderingControl.message}</p>
        </section>
      )}
      {pendingSubmission && (
        <section className="notice" role="status">
          <strong>มีคำขอเดิมที่ยังต้องตรวจสอบ</strong>
          <p>ระบบจะใช้รหัสเดิมเพื่อป้องกันคำขอซ้ำ กรุณาอย่าสร้างรายการใหม่</p>
          <button
            className="secondary"
            disabled={sending}
            onClick={() => void retry()}
          >
            ตรวจสอบและส่งคำขอเดิมอีกครั้ง
          </button>
        </section>
      )}
      {activeRequestId && (
        <section className="notice" role="status">
          <strong>มีคำขอที่รอร้านยืนยันอยู่</strong>
          <p>กรุณากลับไปดูคำขอเดิม ระบบจะไม่สร้างคำขอใหม่จากแท็บนี้</p>
          <Link className="secondary" to={`/order/status/${activeRequestId}`}>
            กลับไปดูสถานะคำขอเดิม
          </Link>
        </section>
      )}
      <section className="product-grid">
        {products
          .filter((p) => p.active)
          .map((product, index) => (
            <button
              className={`product-card product-${index % 5}`}
              key={product.id}
              disabled={
                !orderingControl.enabled ||
                Boolean(pendingSubmission) ||
                Boolean(activeRequestId)
              }
              onClick={() => setSelected(product)}
            >
              <span className="product-emoji">{product.emoji}</span>
              <div>
                <h2>{product.name}</h2>
                <p>{product.description.slice(0, 2).join(" • ")}</p>
                <strong>
                  {money(product.channelPrices?.["หน้าร้าน"] ?? product.price)}
                </strong>
              </div>
            </button>
          ))}
      </section>
      <section className="customer-cart">
        <h2>
          <ShoppingBasket /> ตะกร้า (
          {totals.subtotal
            ? priced.reduce((sum, item) => sum + item.quantity, 0)
            : 0}
          )
        </h2>
        {priced.map((item) => (
          <div className="customer-cart-line" key={item.id}>
            <div className="customer-cart-line-heading">
              <p>
                <strong>{item.productName}</strong> —{" "}
                {money(item.lineTotal ?? item.unitPrice * item.quantity)}{" "}
                {item.validationError && <em>{item.validationError}</em>}
              </p>
              <div className="customer-cart-actions">
                <button
                  type="button"
                  onClick={() => edit(item)}
                  aria-label={`แก้ไข ${item.productName}`}
                >
                  <Pencil />
                </button>
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  aria-label={`ลบ ${item.productName}`}
                >
                  <Trash2 />
                </button>
              </div>
            </div>
            {item.selectedOptions.length > 0 && (
              <p className="customer-cart-options">
                {item.selectedOptions.join(" • ")}
              </p>
            )}
            <ToppingPackagingDetails item={item} />
            <div className="customer-cart-quantity" aria-label="จำนวนสินค้า">
              <button
                type="button"
                disabled={item.quantity <= 1}
                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                aria-label={`ลดจำนวน ${item.productName}`}
              >
                <Minus />
              </button>
              <b>{item.quantity}</b>
              <button
                type="button"
                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                aria-label={`เพิ่มจำนวน ${item.productName}`}
              >
                <Plus />
              </button>
            </div>
            {quantityError?.id === item.id && (
              <p className="validation" role="alert">
                {quantityError.message}
              </p>
            )}
          </div>
        ))}
        {!priced.length && (
          <p className="customer-cart-empty">ยังไม่มีสินค้าในตะกร้า</p>
        )}
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="ชื่อเล่น (ไม่บังคับ)"
          aria-describedby="customer-name-limit"
        />
        <small id="customer-name-limit" className="customer-field-helper">
          ชื่อเล่น {name.length}/{customerRequestLimits.maxCustomerNameLength}{" "}
          ตัวอักษร
        </small>
        {nameError && (
          <p className="validation" role="alert">
            {nameError}
          </p>
        )}
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="หมายเหตุถึงร้าน (ไม่บังคับ)"
          aria-describedby="customer-note-limit"
        />
        <small id="customer-note-limit" className="customer-field-helper">
          หมายเหตุ {note.length}/{customerRequestLimits.maxCustomerNoteLength}{" "}
          ตัวอักษร
        </small>
        {noteError && (
          <p className="validation" role="alert">
            {noteError}
          </p>
        )}
        <strong>{money(totals.total)}</strong>
        {capError && <p className="validation">{capError}</p>}
        {error && <p className="validation">{error}</p>}
        <button
          className="primary"
          disabled={
            !priced.length ||
            Boolean(invalid) ||
            Boolean(capError) ||
            Boolean(nameError) ||
            Boolean(noteError) ||
            sending ||
            !orderingControl.enabled ||
            Boolean(pendingSubmission) ||
            Boolean(activeRequestId)
          }
          onClick={() => void send()}
        >
          ส่งคำขอให้ร้านยืนยัน
        </button>
      </section>
      {selected && (
        <ProductModal
          product={selected}
          channel={customerStorefrontChannel}
          initial={editingItem ?? undefined}
          availability={availability}
          customerLimits
          onClose={closeEditor}
          onSave={(item) => {
            const next = editingItem
              ? items.map((row) => (row.id === editingItem.id ? item : row))
              : [...items, item];
            const nextUnits = next.reduce((sum, row) => sum + row.quantity, 0);
            if (
              next.length > customerRequestLimits.maxProductLines ||
              nextUnits > customerRequestLimits.maxTotalUnits ||
              item.quantity > customerRequestLimits.maxQuantityPerLine
            ) {
              setError(
                `สั่งได้ไม่เกิน ${customerRequestLimits.maxProductLines} รายการ, ${customerRequestLimits.maxQuantityPerLine} ถ้วยต่อรายการ และ ${customerRequestLimits.maxTotalUnits} ถ้วยต่อคำขอ`,
              );
              return;
            }
            setItems(next);
            setError("");
            closeEditor();
          }}
        />
      )}
    </main>
  );
}
