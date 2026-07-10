import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './store'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import OrderPage from './pages/OrderPage'
import CartPage from './pages/CartPage'
import QueuePage from './pages/QueuePage'
import HistoryPage from './pages/HistoryPage'
import OrderDetailPage from './pages/OrderDetailPage'
import ReportsPage from './pages/ReportsPage'
import ProductsPage from './pages/ProductsPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <div className="splash"><div className="brand-mark">G&amp;M</div><p>กำลังโหลดร้าน…</p></div>
  if (!user) return <Routes><Route path="*" element={<LoginPage />} /></Routes>
  return <Layout><Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/order" element={<OrderPage />} />
    <Route path="/cart" element={<CartPage />} />
    <Route path="/queue" element={<QueuePage />} />
    <Route path="/history" element={<HistoryPage />} />
    <Route path="/orders/:id" element={<OrderDetailPage />} />
    <Route path="/reports" element={<ReportsPage />} />
    <Route path="/products" element={<ProductsPage />} />
    <Route path="/settings" element={<SettingsPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></Layout>
}
