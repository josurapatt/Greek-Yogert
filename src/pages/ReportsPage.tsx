import { Download } from 'lucide-react'
import { useState } from 'react'
import { businessDate, money } from '../lib'
import { useData } from '../store'

const startOfRange = (range: string) => {
  const date = new Date(); date.setHours(0, 0, 0, 0)
  if (range === 'week') date.setDate(date.getDate() - 6)
  if (range === 'month') date.setDate(1)
  return businessDate(date)
}

export default function ReportsPage() {
  const { orders } = useData()
  const [range, setRange] = useState('today')
  const [from, setFrom] = useState(businessDate())
  const [to, setTo] = useState(businessDate())
  const [start, end] = range === 'custom' ? [from, to] : [startOfRange(range), businessDate()]
  const inRange = orders.filter((order) => order.businessDate >= start && order.businessDate <= end)
  const valid = inRange.filter((order) => order.status === 'completed')
  const exportable = inRange.filter((order) => order.status !== 'pending')
  const sales = valid.reduce((sum, order) => sum + order.total, 0)
  const cups = valid.flatMap((order) => order.items).reduce((sum, item) => sum + item.quantity, 0)
  const ranked = (values: string[]) => Object.entries(values.reduce<Record<string, number>>((result, name) => ({ ...result, [name]: (result[name] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1])
  const products = ranked(valid.flatMap((order) => order.items.flatMap((item) => Array(item.quantity).fill(item.productName))))
  const selected = ranked(valid.flatMap((order) => order.items.flatMap((item) => item.selectedOptions.flatMap((name) => Array(item.quantity).fill(name)))))
  const channels = ranked(valid.map((order) => order.channel))

  const exportExcel = async () => {
    const XLSX = await import('xlsx')
    const rows = exportable.flatMap((order) => order.items.map((item) => ({
      'เลขออเดอร์': order.id, 'เลขคิว': order.queueNumber, 'วันที่และเวลา': order.createdAt,
      'ชื่อลูกค้า': order.customerName, 'สินค้า': item.productName,
      'ท็อปปิ้ง/ตัวเลือก': item.selectedOptions.join(', '), 'จำนวน': item.quantity,
      'ราคาต่อชิ้น': item.unitPrice, 'ส่วนลดทั้งออเดอร์': order.discount,
      'ยอดสุทธิทั้งออเดอร์': order.total, 'วิธีชำระเงิน': order.paymentMethod,
      'ช่องทางการขาย': order.channel, 'สถานะ': order.status === 'completed' ? 'พร้อมส่ง' : 'ยกเลิก',
    })))
    const sheet = XLSX.utils.json_to_sheet(rows)
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, 'Orders')
    XLSX.writeFile(book, `GreekMore-${start}-${end}.xlsx`)
  }

  const Chart = ({ title, rows }: { title: string; rows: [string, number][] }) => <article className="report-card">
    <h2>{title}</h2>{rows.slice(0, 6).map(([name, value], index) => <div className="bar-row" key={name}>
      <span>{name}</span><div><i style={{ width: `${Math.max(8, value / (rows[0]?.[1] || 1) * 100)}%` }}/></div><b>{value}</b>{index === 0 && <small>อันดับ 1</small>}
    </div>)}{!rows.length && <p className="muted">ยังไม่มีข้อมูลในช่วงนี้</p>}
  </article>

  return <div className="page">
    <div className="page-heading"><div><p className="eyebrow">ยอดขายไม่รวมออเดอร์ยกเลิก</p><h1>รายงานและยอดขาย</h1></div><button className="secondary" onClick={() => void exportExcel()} disabled={!exportable.length}><Download/> ส่งออก Excel</button></div>
    <section className="report-filters"><div className="segmented">{[['today', 'วันนี้'], ['week', '7 วัน'], ['month', 'เดือนนี้'], ['custom', 'กำหนดเอง']].map(([value, label]) => <label key={value}><input type="radio" checked={range === value} onChange={() => setRange(value)}/><span>{label}</span></label>)}</div>{range === 'custom' && <div className="date-pair"><input type="date" value={from} onChange={(event) => setFrom(event.target.value)}/><span>ถึง</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)}/></div>}</section>
    <section className="stats"><article><span>ยอดขาย</span><strong>{money(sales)}</strong><small>{valid.length} ออเดอร์</small></article><article><span>จำนวนแก้ว</span><strong>{cups}</strong><small>แก้ว</small></article><article><span>ยอดเฉลี่ย/ออเดอร์</span><strong>{money(valid.length ? sales / valid.length : 0)}</strong><small>เฉพาะรายการพร้อมส่ง</small></article></section>
    <section className="report-grid"><Chart title="สินค้าขายดี" rows={products}/><Chart title="ท็อปปิ้งยอดนิยม" rows={selected}/><Chart title="ออเดอร์ตามช่องทาง" rows={channels}/></section>
  </div>
}
