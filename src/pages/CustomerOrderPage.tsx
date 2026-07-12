import { ShoppingBasket } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ProductModal from "../components/ProductModal";
import ToppingPackagingDetails from "../components/ToppingPackagingDetails";
import { money, orderTotals, repriceCartItems } from "../lib";
import { toppings } from "../data";
import { customerStorefrontChannel } from "../customerOrder";
import { useCustomer } from "../customerFirebase";
import type { CartItem, Product } from "../types";

export default function CustomerOrderPage() {
  const { products, availability, loading, submit } = useCustomer();
  const navigate = useNavigate();
  const [items, setItems] = useState<CartItem[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
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
  const add = (item: CartItem) => setItems((rows) => [...rows, item]);
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
        <span className="demo-pill">โหมดทดลอง</span>
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
            <p>
              {item.productName} × {item.quantity} —{" "}
              {money(item.lineTotal ?? item.unitPrice * item.quantity)}{" "}
              {item.validationError && <em>{item.validationError}</em>}
            </p>
            <ToppingPackagingDetails item={item} />
          </div>
        ))}
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
          availability={availability}
          onClose={() => setSelected(null)}
          onSave={(item) => {
            add(item);
            setSelected(null);
          }}
        />
      )}
    </main>
  );
}
