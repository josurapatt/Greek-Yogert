import {
  BarChart3,
  ClipboardList,
  History,
  Package,
  PlusCircle,
  ArrowRight,
  Settings,
} from "lucide-react";
import { Link } from "react-router-dom";
import { businessDate, money } from "../lib";
import { useData } from "../store";

export default function HomePage() {
  const { orders } = useData();
  const today = businessDate();
  const todays = orders.filter((order) => order.businessDate === today);
  const waiting = todays.filter((order) => order.status === "pending");
  const completed = todays.filter((order) => order.status === "completed");
  const sales = completed.reduce((sum, order) => sum + order.total, 0);
  const links = [
    {
      to: "/order",
      title: "สั่งสินค้า",
      text: "เปิดออเดอร์ใหม่",
      icon: PlusCircle,
      tone: "purple",
    },
    {
      to: "/queue",
      title: "คิวรอจัดเตรียม",
      text: `${waiting.length} ออเดอร์กำลังรอ`,
      icon: ClipboardList,
      tone: "pink",
    },
    {
      to: "/history",
      title: "ประวัติจัดส่ง",
      text: "ค้นหาและเรียกคืนออเดอร์",
      icon: History,
      tone: "yellow",
    },
    {
      to: "/reports",
      title: "รายงาน",
      text: "ยอดขายและสินค้ายอดนิยม",
      icon: BarChart3,
      tone: "blue",
    },
    {
      to: "/products",
      title: "จัดการสินค้า",
      text: "ราคา ตัวเลือก และสถานะขาย",
      icon: Package,
      tone: "green",
    },
    {
      to: "/settings",
      title: "ตั้งค่าร้าน",
      text: "ตั้งค่ารวมและแยกท็อปปิ้ง",
      icon: Settings,
      tone: "purple",
    },
  ];
  return (
    <div className="page">
      <section className="welcome">
        <div>
          <p className="eyebrow">ภาพรวมวันนี้</p>
          <h1>พร้อมรับออเดอร์แล้ว 👋</h1>
          <p>ทุกคิวจะอัปเดตทันทีบนอุปกรณ์ที่เข้าสู่ระบบ</p>
        </div>
        <div className="mini-bowl">🥣</div>
      </section>
      <section className="stats">
        <article>
          <span>คิวที่รอ</span>
          <strong>{waiting.length}</strong>
          <small>ออเดอร์</small>
        </article>
        <article>
          <span>เสร็จแล้ว</span>
          <strong>{completed.length}</strong>
          <small>ออเดอร์</small>
        </article>
        <article>
          <span>ยอดขายวันนี้</span>
          <strong>{money(sales)}</strong>
          <small>ไม่รวมรายการยกเลิก</small>
        </article>
      </section>
      <div className="section-heading">
        <div>
          <p className="eyebrow">เมนูหลัก</p>
          <h2>ต้องการทำอะไร?</h2>
        </div>
      </div>
      <section className="action-grid">
        {links.map(({ to, title, text, icon: Icon, tone }) => (
          <Link className={`action-card ${tone}`} to={to} key={to}>
            <div className="action-icon">
              <Icon />
            </div>
            <div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
            <ArrowRight className="arrow" />
          </Link>
        ))}
      </section>
    </div>
  );
}
