import { Bell, BellOff, Clock, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatThaiDateTime, money } from '../lib'
import { useData } from '../store'

function beep() { const Audio = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext; const context = new Audio(); const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.frequency.value = 880; gain.gain.value = .08; oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .18) }

export default function QueuePage() {
  const { orders } = useData(); const waiting = orders.filter((order) => order.status === 'pending').sort((a,b) => a.createdAt.localeCompare(b.createdAt)); const [sound, setSound] = useState(localStorage.getItem('gym-sound') === 'on'); const known = useRef(new Set(waiting.map((order) => order.id))); const first = useRef(true)
  useEffect(() => { const current = new Set(waiting.map((order) => order.id)); if (!first.current && sound && waiting.some((order) => !known.current.has(order.id))) { try { beep() } catch { setSound(false) } } first.current = false; known.current = current }, [waiting, sound])
  const toggle = () => { const next = !sound; setSound(next); localStorage.setItem('gym-sound', next ? 'on' : 'off'); if (next) try { beep() } catch { setSound(false) } }
  return <div className="page"><div className="page-heading"><div><p className="eyebrow">อัปเดตแบบเรียลไทม์</p><h1>คิวรอจัดเตรียม <span className="count-bubble">{waiting.length}</span></h1><p>เรียงตามเวลาที่รับออเดอร์</p></div><button className="secondary" onClick={toggle}>{sound ? <Bell/> : <BellOff/>}{sound ? ' เปิดเสียงแล้ว' : ' เปิดเสียงแจ้งเตือน'}</button></div>{!waiting.length ? <div className="empty"><span className="big-emoji">✨</span><h2>จัดเตรียมครบทุกคิวแล้ว</h2><p>ออเดอร์ใหม่จะปรากฏที่นี่อัตโนมัติ</p></div> : <section className="queue-grid">{waiting.map((order) => <Link className="queue-card" key={order.id} to={`/orders/${order.id}`}><div className="queue-top"><strong>{order.queueNumber}</strong><span>รอจัดเตรียม</span></div><h2>{order.customerName}</h2><p className="meta"><UserRound/> {order.channel} <Clock/> {formatThaiDateTime(order.createdAt).split(' ').slice(-1)}</p><div className="order-summary">{order.items.map((item) => <p key={item.id}><b>{item.quantity}×</b> {item.productName}</p>)}</div><footer><span>{order.items.reduce((sum,item) => sum + item.quantity, 0)} แก้ว</span><strong>{money(order.total)}</strong></footer></Link>)}</section>}</div>
}
