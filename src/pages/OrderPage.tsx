import {
  ArrowLeftRight,
  Building2,
  MessageCircle,
  ShoppingBasket,
  Store,
  Truck,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import ProductModal from "../components/ProductModal";
import { channelLabels, getProductPrice, money, orderChannels } from "../lib";
import { useCart, useData } from "../store";
import type { OrderChannel, Product } from "../types";

const channelDetails: Record<
  OrderChannel,
  { text: string; icon: typeof Store; tone: string }
> = {
  หน้าร้าน: { text: "ราคาและกฎหน้าร้าน", icon: Store, tone: "purple" },
  Openchat: { text: "ราคาเดียวกับหน้าร้าน", icon: MessageCircle, tone: "blue" },
  Lineman: { text: "ราคาและกฎแพลตฟอร์ม", icon: Truck, tone: "green" },
  Grab: { text: "ราคาและกฎแพลตฟอร์ม", icon: Building2, tone: "yellow" },
};

export default function OrderPage() {
  const { products, toppingAvailability } = useData();
  const { items, add, channel, changeChannel } = useCart();
  const [selected, setSelected] = useState<Product | null>(null);
  const active = products.filter((product) => product.active);
  const count = items.reduce((sum, item) => sum + item.quantity, 0);

  const chooseChannel = (next: OrderChannel) => {
    if (next === channel) return;
    if (
      channel &&
      items.length > 0 &&
      !window.confirm(
        `เปลี่ยนช่องทางจาก ${channelLabels[channel]} เป็น ${channelLabels[next]}? ระบบจะคำนวณราคาใหม่และตรวจสอบท็อปปิ้งทุกชิ้น`,
      )
    )
      return;
    changeChannel(next, products, toppingAvailability);
  };

  if (!channel)
    return (
      <div className="page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">เริ่มออเดอร์</p>
            <h1>เลือกช่องทางการขาย</h1>
            <p>เลือกช่องทางก่อนเพื่อแสดงราคาและกฎการสั่งที่ถูกต้อง</p>
          </div>
          {count > 0 && (
            <Link className="secondary cart-button" to="/cart">
              <ShoppingBasket /> ตะกร้า <b>{count}</b>
            </Link>
          )}
        </div>
        <section className="channel-grid">
          {orderChannels.map((value) => {
            const detail = channelDetails[value];
            const Icon = detail.icon;
            return (
              <button
                className={`channel-card ${detail.tone}`}
                key={value}
                onClick={() => chooseChannel(value)}
              >
                <span>
                  <Icon />
                </span>
                <div>
                  <h2>{channelLabels[value]}</h2>
                  <p>{detail.text}</p>
                </div>
              </button>
            );
          })}
        </section>
      </div>
    );

  return (
    <div className="page">
      <div className="channel-banner">
        <div>
          <span>ช่องทางปัจจุบัน</span>
          <strong>{channelLabels[channel]}</strong>
        </div>
        <div className="channel-switches">
          {orderChannels
            .filter((value) => value !== channel)
            .map((value) => (
              <button key={value} onClick={() => chooseChannel(value)}>
                <ArrowLeftRight /> {channelLabels[value]}
              </button>
            ))}
        </div>
      </div>
      <div className="page-heading">
        <div>
          <p className="eyebrow">สร้างออเดอร์ • {channelLabels[channel]}</p>
          <h1>เลือกสินค้า</h1>
          <p>ราคาด้านล่างเป็นราคาสำหรับช่องทางที่เลือก</p>
        </div>
        <Link className="secondary cart-button" to="/cart">
          <ShoppingBasket /> ตะกร้า {count > 0 && <b>{count}</b>}
        </Link>
      </div>
      <section className="product-grid">
        {active.map((product, index) => (
          <button
            className={`product-card product-${index % 5}`}
            key={product.id}
            onClick={() => setSelected(product)}
          >
            <span className="product-emoji">{product.emoji}</span>
            <div>
              <h2>{product.name}</h2>
              <p>{product.description.slice(0, 2).join(" • ")}</p>
              <strong>{money(getProductPrice(product, channel))}</strong>
              {product.optionMode === "toppings" && (
                <small>เลือก {product.includedToppings} ท็อปปิ้ง</small>
              )}
              {product.optionMode === "granola" && (
                <small>เลือกรสกราโนล่า</small>
              )}
            </div>
          </button>
        ))}
      </section>
      {!active.length && <div className="empty">ยังไม่มีสินค้าที่เปิดขาย</div>}
      {selected && (
        <ProductModal
          product={selected}
          channel={channel}
          availability={toppingAvailability}
          onClose={() => setSelected(null)}
          onSave={(item) => {
            add(item);
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}
