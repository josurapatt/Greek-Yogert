import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatThaiDateTime, money } from '../lib'
import { useData } from '../store'

export default function HistoryPage() {
  const { orders } = useData(); const [query, setQuery] = useState(''); const [date, setDate] = useState(''); const [status, setStatus] = useState('all')
  const rows = useMemo(() => orders.filter((order) => order.status !== 'pending').filter((order) => !date || order.businessDate === date).filter((order) => status === 'all' || order.status === status).filter((order) => `${order.queueNumber} ${order.customerName} ${order.id}`.toLowerCase().includes(query.toLowerCase())), [orders, query, date, status])
  return <div className="page"><div className="page-heading"><div><p className="eyebrow">ค้นหาและเรียกคืนได้</p><h1>ประวัติออเดอร์</h1></div></div><section className="filters"><label className="search"><Search/><input placeholder="ค้นหาชื่อลูกค้า เลขคิว หรือเลขออเดอร์" value={query} onChange={(e) => setQuery(e.target.value)}/></label><input type="date" value={date} onChange={(e) => setDate(e.target.value)}/><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">ทุกสถานะ</option><option value="completed">พร้อมส่ง</option><option value="cancelled">ยกเลิก</option></select></section><section className="history-list">{rows.map((order) => <Link className="history-row" key={order.id} to={`/orders/${order.id}`}><strong className="queue-small">{order.queueNumber}</strong><div><h3>{order.customerName}</h3><p>{formatThaiDateTime(order.createdAt)} • {order.channel} • {order.items.reduce((sum,item) => sum + item.quantity, 0)} แก้ว</p></div><span className={`status ${order.status}`}>{order.status === 'completed' ? 'พร้อมส่ง' : 'ยกเลิก'}</span><b>{money(order.total)}</b></Link>)}{!rows.length && <div className="empty"><h2>ไม่พบออเดอร์</h2><p>ลองเปลี่ยนคำค้นหาหรือช่วงวันที่</p></div>}</section></div>
}
