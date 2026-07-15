import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { businessDate, channelLabels, money, paymentMethodLabel } from "../lib";
import {
  aggregateSalesChannels,
  aggregatePaymentMethodSales,
  buildOrderExportRows,
  completedSalesSummary,
  reportChannels,
  salesChannelColors,
} from "../reporting";
import { useData } from "../store";
import { db } from "../firebase";
import { loadReportOrders } from "../staffFirestore";
import type { ShopOrder } from "../types";

const startOfRange = (range: string) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  if (range === "week") date.setDate(date.getDate() - 6);
  if (range === "month") date.setDate(1);
  return businessDate(date);
};

export default function ReportsPage() {
  const { orders: localOrders } = useData();
  const [range, setRange] = useState("today");
  const [from, setFrom] = useState(businessDate());
  const [to, setTo] = useState(businessDate());
  const [start, end] =
    range === "custom" ? [from, to] : [startOfRange(range), businessDate()];
  const [orders, setOrders] = useState<ShopOrder[]>(() =>
    db ? [] : localOrders,
  );
  const [complete, setComplete] = useState(true);
  const [loading, setLoading] = useState(Boolean(db));
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    if (!db) {
      setOrders(localOrders);
      return;
    }
    let active = true;
    setLoading(true);
    setLoadError("");
    void loadReportOrders(db, start, end)
      .then((result) => {
        if (!active) return;
        setOrders(result.rows);
        setComplete(result.complete);
      })
      .catch(() => active && setLoadError("โหลดข้อมูลรายงานไม่สำเร็จ"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [start, end, localOrders]);
  const inRange = orders.filter(
    (order) => order.businessDate >= start && order.businessDate <= end,
  );
  const { completed: valid, sales, cups } = completedSalesSummary(inRange);
  const exportable = inRange.filter((order) => order.status !== "pending");
  const ranked = (values: string[]) =>
    Object.entries(
      values.reduce<Record<string, number>>(
        (result, name) => ({ ...result, [name]: (result[name] ?? 0) + 1 }),
        {},
      ),
    ).sort((a, b) => b[1] - a[1]);
  const products = ranked(
    valid.flatMap((order) =>
      order.items.flatMap((item) =>
        Array(item.quantity).fill(item.productName),
      ),
    ),
  );
  const selected = ranked(
    valid.flatMap((order) =>
      order.items.flatMap((item) =>
        item.selectedOptions.flatMap((name) => Array(item.quantity).fill(name)),
      ),
    ),
  );
  const channelReport = aggregateSalesChannels(valid);
  const paymentReport = aggregatePaymentMethodSales(valid);
  const maxHourlySales = Math.max(
    0,
    ...channelReport.hourly.map((entry) => entry.total),
  );

  const exportExcel = async () => {
    if (!complete) throw new Error("ไม่สามารถส่งออกข้อมูลที่โหลดไม่ครบ");
    const XLSX = await import("xlsx");
    const rows = buildOrderExportRows(exportable);
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Orders");
    XLSX.writeFile(book, `GreekMore-${start}-${end}.xlsx`);
  };

  const Chart = ({
    title,
    rows,
  }: {
    title: string;
    rows: [string, number][];
  }) => (
    <article className="report-card">
      <h2>{title}</h2>
      {rows.slice(0, 6).map(([name, value], index) => (
        <div className="bar-row" key={name}>
          <span>{name}</span>
          <div>
            <i
              style={{
                width: `${Math.max(8, (value / (rows[0]?.[1] || 1)) * 100)}%`,
              }}
            />
          </div>
          <b>{value}</b>
          {index === 0 && <small>อันดับ 1</small>}
        </div>
      ))}
      {!rows.length && <p className="muted">ยังไม่มีข้อมูลในช่วงนี้</p>}
    </article>
  );

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ยอดขายไม่รวมออเดอร์ยกเลิก</p>
          <h1>รายงานและยอดขาย</h1>
        </div>
        <button
          className="secondary"
          onClick={() => void exportExcel()}
          disabled={!exportable.length || !complete || loading}
        >
          <Download /> ส่งออก Excel
        </button>
      </div>
      {loading && <p className="notice">กำลังโหลดรายงานแบบแบ่งหน้า…</p>}
      {loadError && <p className="validation">{loadError}</p>}
      {!complete && (
        <p className="validation">
          ข้อมูลเกินขีดจำกัด 5,000 ออเดอร์ ระบบปิดการส่งออก Excel
          เพื่อป้องกันไฟล์ไม่ครบ กรุณาแบ่งช่วงวันที่ให้แคบลง
        </p>
      )}
      <section className="report-filters">
        <div className="segmented">
          {[
            ["today", "วันนี้"],
            ["week", "7 วัน"],
            ["month", "เดือนนี้"],
            ["custom", "กำหนดเอง"],
          ].map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                checked={range === value}
                onChange={() => setRange(value)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        {range === "custom" && (
          <div className="date-pair">
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
            <span>ถึง</span>
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
        )}
      </section>
      <section className="stats">
        <article>
          <span>ยอดขาย</span>
          <strong>{money(sales)}</strong>
          <small>{valid.length} ออเดอร์</small>
        </article>
        <article>
          <span>จำนวนแก้ว</span>
          <strong>{cups}</strong>
          <small>แก้ว</small>
        </article>
        <article>
          <span>ยอดเฉลี่ย/ออเดอร์</span>
          <strong>{money(valid.length ? sales / valid.length : 0)}</strong>
          <small>เฉพาะรายการพร้อมส่ง</small>
        </article>
      </section>
      <section className="sales-channel-layout">
        <article className="report-card sales-channel-summary">
          <h2>ยอดขายตามช่องทาง</h2>
          <div className="report-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ช่องทางการขาย</th>
                  <th>ยอดขายรวม</th>
                  <th>จำนวนออเดอร์</th>
                </tr>
              </thead>
              <tbody>
                {channelReport.channels.map((entry) => (
                  <tr key={entry.channel}>
                    <td>
                      <i
                        className="channel-color"
                        style={{
                          background: salesChannelColors[entry.channel],
                        }}
                      />
                      {channelLabels[entry.channel]}
                    </td>
                    <td>{money(entry.sales)}</td>
                    <td>{entry.orderCount}</td>
                  </tr>
                ))}
                {channelReport.unknown.orderCount > 0 && (
                  <tr className="unknown-channel-row">
                    <td>ไม่ระบุ / ไม่รู้จัก</td>
                    <td>{money(channelReport.unknown.sales)}</td>
                    <td>{channelReport.unknown.orderCount}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {channelReport.unknown.orderCount > 0 && (
            <p className="muted report-note">
              แยกรายการช่องทางเดิมที่ไม่รู้จักออกจากยอดของ 4 ช่องทางหลัก
            </p>
          )}
        </article>
        <article className="report-card sales-channel-summary">
          <h2>ยอดขายตามวิธีชำระเงิน</h2>
          <div className="report-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>วิธีชำระเงิน</th>
                  <th>ยอดขายรวม</th>
                </tr>
              </thead>
              <tbody>
                {paymentReport.methods.map((entry) => (
                  <tr key={entry.paymentMethod}>
                    <td>{paymentMethodLabel(entry.paymentMethod)}</td>
                    <td>{money(entry.sales)}</td>
                  </tr>
                ))}
                {paymentReport.unknown !== 0 && (
                  <tr className="unknown-channel-row">
                    <td>ไม่ระบุ / ไม่รู้จัก</td>
                    <td>{money(paymentReport.unknown)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
        <article className="report-card hourly-sales-card">
          <div className="chart-heading">
            <div>
              <h2>ยอดขายรายชั่วโมงตามช่องทาง</h2>
              <p className="muted">เวลาไทย (Asia/Bangkok)</p>
            </div>
            <div className="channel-legend" aria-label="คำอธิบายช่องทางการขาย">
              {reportChannels.map((channel) => (
                <span key={channel}>
                  <i style={{ background: salesChannelColors[channel] }} />
                  {channelLabels[channel]}
                </span>
              ))}
            </div>
          </div>
          {channelReport.hourly.length ? (
            <div className="hourly-chart-scroll">
              <div
                className="hourly-chart"
                role="img"
                aria-label="กราฟแท่งซ้อนยอดขายรายชั่วโมง แยกตามช่องทางการขาย"
              >
                <div className="chart-y-label">ยอดขาย</div>
                {channelReport.hourly.map((entry) => (
                  <div className="hour-column" key={entry.hour}>
                    <b>{money(entry.total)}</b>
                    <div className="hour-stack">
                      {reportChannels.map((channel) => {
                        const value = entry.channels[channel];
                        return (
                          <i
                            key={channel}
                            className="hour-segment"
                            style={{
                              background: salesChannelColors[channel],
                              height: `${maxHourlySales ? (value / maxHourlySales) * 100 : 0}%`,
                            }}
                            title={`${entry.label} • ${channelLabels[channel]}: ${money(value)}`}
                          />
                        );
                      })}
                    </div>
                    <span>{String(entry.hour).padStart(2, "0")}:00</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="muted chart-empty">ยังไม่มียอดขายในช่วงนี้</p>
          )}
        </article>
      </section>
      <section className="report-grid">
        <Chart title="สินค้าขายดี" rows={products} />
        <Chart title="ท็อปปิ้งยอดนิยม" rows={selected} />
      </section>
    </div>
  );
}
