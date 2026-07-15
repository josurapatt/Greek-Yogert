import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { QueryDocumentSnapshot } from "firebase/firestore";
import HistoryOrderCard from "../components/HistoryOrderCard";
import { filterHistoryOrders, type HistoryPaymentFilter } from "../history";
import { useData } from "../store";
import { db } from "../firebase";
import { loadHistoryPage } from "../staffFirestore";
import type { ShopOrder } from "../types";

export default function HistoryPage() {
  const { orders: localOrders } = useData();
  const [queryText, setQueryText] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<"all" | "completed" | "cancelled">(
    "all",
  );
  const [paymentMethod, setPaymentMethod] =
    useState<HistoryPaymentFilter>("all");
  const [orders, setOrders] = useState<ShopOrder[]>(() =>
    db ? [] : localOrders,
  );
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(Boolean(db));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!db) {
      setOrders(localOrders);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    void loadHistoryPage(db, { status, businessDate: date || undefined })
      .then((page) => {
        if (!active) return;
        setOrders(page.rows);
        setCursor(page.cursor);
        setHasMore(page.hasMore);
      })
      .catch(() => active && setError("เปิดประวัติออเดอร์ไม่สำเร็จ"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [date, status, localOrders]);

  const rows = useMemo(
    () =>
      filterHistoryOrders(orders, {
        query: queryText,
        date,
        status,
        paymentMethod,
      }),
    [orders, queryText, date, status, paymentMethod],
  );
  const loadMore = async () => {
    if (!db || !cursor || loading) return;
    try {
      setLoading(true);
      const page = await loadHistoryPage(db, {
        status,
        businessDate: date || undefined,
        cursor,
      });
      setOrders((current) => [
        ...current,
        ...page.rows.filter(
          (row) => !current.some((existing) => existing.id === row.id),
        ),
      ]);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch {
      setError("เปิดหน้าประวัติเพิ่มไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ค้นหาและเรียกคืนได้</p>
          <h1>ประวัติออเดอร์</h1>
        </div>
      </div>
      <section className="filters history-filters">
        <label className="search">
          <Search />
          <input
            placeholder="ค้นหาชื่อลูกค้า เลขคิว หรือเลขออเดอร์"
            value={queryText}
            onChange={(event) => setQueryText(event.target.value)}
          />
        </label>
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as typeof status)}
        >
          <option value="all">ทุกสถานะ</option>
          <option value="completed">พร้อมส่ง</option>
          <option value="cancelled">ยกเลิก</option>
        </select>
        <select
          aria-label="วิธีชำระเงิน"
          value={paymentMethod}
          onChange={(event) =>
            setPaymentMethod(event.target.value as HistoryPaymentFilter)
          }
        >
          <option value="all">ทุกวิธีชำระเงิน</option>
          <option value="สด">สด</option>
          <option value="โอน">โอน</option>
          <option value="โครงการ">โครงการ</option>
          <option value="Platform">Platform</option>
          <option value="missing">ไม่ระบุ</option>
        </select>
      </section>
      {hasMore && (
        <p className="notice">
          กำลังแสดงข้อมูลเป็นหน้า การค้นหาจะครอบคลุมเฉพาะหน้าที่โหลดแล้ว
        </p>
      )}
      {error && <p className="validation">{error}</p>}
      <section className="history-list">
        {rows.map((order) => (
          <HistoryOrderCard order={order} key={order.id} />
        ))}
        {!rows.length && !loading && (
          <div className="empty">
            <h2>ไม่พบออเดอร์</h2>
            <p>ลองเปลี่ยนคำค้นหา วันที่ สถานะ หรือวิธีชำระเงิน</p>
          </div>
        )}
      </section>
      {hasMore && (
        <button
          className="secondary"
          disabled={loading}
          onClick={() => void loadMore()}
        >
          {loading ? "กำลังโหลด…" : "โหลดเพิ่ม 50 รายการ"}
        </button>
      )}
    </div>
  );
}
