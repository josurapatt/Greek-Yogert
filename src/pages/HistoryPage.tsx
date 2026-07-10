import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import HistoryOrderCard from '../components/HistoryOrderCard'
import { filterHistoryOrders, type HistoryPaymentFilter } from '../history'
import { useData } from '../store'

export default function HistoryPage() {
  const { orders } = useData()
  const [query, setQuery] = useState('')
  const [date, setDate] = useState('')
  const [status, setStatus] = useState<'all' | 'completed' | 'cancelled'>('all')
  const [paymentMethod, setPaymentMethod] = useState<HistoryPaymentFilter>('all')
  const rows = useMemo(
    () => filterHistoryOrders(orders, { query, date, status, paymentMethod }),
    [orders, query, date, status, paymentMethod],
  )
  return (
    <div className="page">
      <div className="page-heading"><div><p className="eyebrow">ค้นหาและเรียกคืนได้</p><h1>ประวัติออเดอร์</h1></div></div>
      <section className="filters history-filters">
        <label className="search"><Search /><input placeholder="ค้นหาชื่อลูกค้า เลขคิว หรือเลขออเดอร์" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
          <option value="all">ทุกสถานะ</option><option value="completed">พร้อมส่ง</option><option value="cancelled">ยกเลิก</option>
        </select>
        <select aria-label="วิธีชำระเงิน" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as HistoryPaymentFilter)}>
          <option value="all">ทุกวิธีชำระเงิน</option><option value="สด">สด</option><option value="โอน">โอน</option><option value="โครงการ">โครงการ</option><option value="Platform">Platform</option><option value="missing">ไม่ระบุ</option>
        </select>
      </section>
      <section className="history-list">
        {rows.map((order) => <HistoryOrderCard order={order} key={order.id} />)}
        {!rows.length && <div className="empty"><h2>ไม่พบออเดอร์</h2><p>ลองเปลี่ยนคำค้นหา วันที่ สถานะ หรือวิธีชำระเงิน</p></div>}
      </section>
    </div>
  )
}
