import { Minus, Pencil, Plus, ShoppingBasket, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { runtimeConfig } from "../runtimeConfig";
import type { CartItem, Product } from "../types";

export default function CustomerOrderPage() {
  const { products, availability, loading, submit } = useCustomer();
  const navigate = useNavigate();
  const [items, setItems] = useState<CartItem[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [editingItem, setEditingItem] = useState<CartItem | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
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
  const updateQuantity = (id: string, quantity: number) =>
    setItems((rows) =>
      rows.map((item) =>
        item.id === id
          ? applyCartItemUpdate(item, { quantity: Math.max(1, quantity) })
          : item,
      ),
    );
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
      <section className="product-grid">
        {products
          .filter((p) => p.active)
          .map((product, index) => (
            <button
              className={`product-card product-${index % 5}`}
              key={product.id}
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
          </div>
        ))}
        {!priced.length && (
          <p className="customer-cart-empty">ยังไม่มีสินค้าในตะกร้า</p>
        )}
        <input
          value={name}
          maxLength={40}
          onChange={(event) => setName(event.target.value)}
          placeholder="ชื่อเล่น (ไม่บังคับ)"
        />
        <textarea
          value={note}
          maxLength={200}
          onChange={(event) => setNote(event.target.value)}
          placeholder="หมายเหตุถึงร้าน (ไม่บังคับ)"
        />
        <strong>{money(totals.total)}</strong>
        {error && <p className="validation">{error}</p>}
        <button
          className="primary"
          disabled={!priced.length || Boolean(invalid) || sending}
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
          onClose={closeEditor}
          onSave={(item) => {
            setItems((rows) =>
              editingItem
                ? rows.map((row) => (row.id === editingItem.id ? item : row))
                : [...rows, item],
            );
            closeEditor();
          }}
        />
      )}
    </main>
  );
}
