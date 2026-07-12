import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './store'
import { customerQrUatEnabled } from './firebase'
import { CustomerProvider } from './customerFirebase'
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
import CustomerOrderPage from './pages/CustomerOrderPage'
import CustomerStatusPage from './pages/CustomerStatusPage'
import CustomerRequestsPage from './pages/CustomerRequestsPage'
import CustomerRequestDetailPage from './pages/CustomerRequestDetailPage'
import { shouldUseCustomerOrdering } from './routes'

export default function App() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="splash"><div className="brand-mark">G&amp;M</div><p>กำลังโหลดร้าน…</p></div>
  if (shouldUseCustomerOrdering(location.pathname, customerQrUatEnabled, user)) return <CustomerProvider><Routes>
    <Route path="/order" element={<CustomerOrderPage />} />
    <Route path="/order/status/:requestId" element={<CustomerStatusPage />} />
    <Route path="*" element={<Navigate to="/order" replace />} />
  </Routes></CustomerProvider>
  if (!user || user.isAnonymous) return <Routes><Route path="*" element={<LoginPage />} /></Routes>
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
    <Route path="/customer-requests" element={<CustomerRequestsPage />} />
    <Route path="/customer-requests/:id" element={<CustomerRequestDetailPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></Layout>
}
