import { ClipboardList, History, Home, LogOut, Package, PlusCircle, Settings, ShoppingBasket, BarChart3, MessageSquare } from 'lucide-react'
import { customerQrUatEnabled } from '../firebase'
import { NavLink } from 'react-router-dom'
import { useAuth, useCart, useData } from '../store'
import { channelLabels } from '../lib'
import type { ReactNode } from 'react'

const nav = [
  { to: '/', label: 'หน้าหลัก', icon: Home }, { to: '/order', label: 'สั่งสินค้า', icon: PlusCircle },
  { to: '/queue', label: 'คิว', icon: ClipboardList }, { to: '/history', label: 'ประวัติ', icon: History },
  { to: '/reports', label: 'รายงาน', icon: BarChart3 }, { to: '/products', label: 'สินค้า', icon: Package },
  { to: '/settings', label: 'ตั้งค่า', icon: Settings },
]
if (customerQrUatEnabled) nav.splice(3, 0, { to: '/customer-requests', label: 'คำขอลูกค้า', icon: MessageSquare })

export default function Layout({ children }: { children: ReactNode }) {
  const { logout, isDemo } = useAuth(); const { items, channel } = useCart(); const { orders } = useData()
  const quantity = items.reduce((sum, item) => sum + item.quantity, 0)
  const waiting = orders.filter((order) => order.status === 'pending').length
  return <div className="app-shell">
    <aside className="sidebar">
      <NavLink className="brand" to="/"><span className="brand-mark">G&amp;M</span><span><strong>Greek &amp; More</strong><small>Order Manager</small></span></NavLink>
      <nav>{nav.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'}><Icon /> <span>{label}</span>{to === '/queue' && waiting > 0 && <b className="badge">{waiting}</b>}</NavLink>)}</nav>
      <button className="logout" onClick={() => void logout()}><LogOut /> ออกจากระบบ</button>
    </aside>
    <div className="content-shell">
      <header className="topbar"><div><strong>Greek &amp; More</strong><span className="demo-pill">{isDemo ? 'โหมดทดลอง' : 'ระบบจริง'}</span>{channel && <span className="channel-pill">{channelLabels[channel]}</span>}</div><NavLink className="cart-chip" to="/cart"><ShoppingBasket /> ตะกร้า {quantity > 0 && <b>{quantity}</b>}</NavLink></header>
      <main>{children}</main>
      <nav className="bottom-nav">{nav.slice(0, 4).map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'}><Icon /><span>{label}</span>{to === '/queue' && waiting > 0 && <b className="badge">{waiting}</b>}</NavLink>)}</nav>
    </div>
  </div>
}
