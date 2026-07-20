import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./store";
import { runtimeConfig } from "@runtime-config";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/HomePage";
import OrderPage from "./pages/OrderPage";
import CartPage from "./pages/CartPage";
import QueuePage from "./pages/QueuePage";
import HistoryPage from "./pages/HistoryPage";
import OrderDetailPage from "./pages/OrderDetailPage";
import ReportsPage from "./pages/ReportsPage";
import ProductsPage from "./pages/ProductsPage";
import SettingsPage from "./pages/SettingsPage";
import CustomerRequestsPage from "./pages/CustomerRequestsPage";
import CustomerRequestDetailPage from "./pages/CustomerRequestDetailPage";
import CustomerUnavailablePage from "./pages/CustomerUnavailablePage";
import {
  shouldShowCustomerUnavailable,
  shouldUseCustomerOrdering,
} from "./routes";

const CustomerOrderingApp = lazy(() => import("./CustomerOrderingApp"));

export default function App() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <div className="splash">
        <div className="brand-mark">G&amp;M</div>
        <p>กำลังโหลดร้าน…</p>
      </div>
    );
  if (
    shouldUseCustomerOrdering(
      location.pathname,
      runtimeConfig.customerQrEnabled,
      user,
    )
  )
    return (
      <Suspense
        fallback={
          <div className="splash">
            <div className="brand-mark">G&amp;M</div>
            <p>กำลังโหลดร้าน…</p>
          </div>
        }
      >
        <CustomerOrderingApp />
      </Suspense>
    );
  if (
    shouldShowCustomerUnavailable(
      location.pathname,
      runtimeConfig.customerQrEnabled,
      user,
    )
  )
    return <CustomerUnavailablePage />;
  if (!user || user.isAnonymous)
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/order" element={<OrderPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/queue" element={<QueuePage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        {runtimeConfig.customerQrEnabled && (
          <Route path="/customer-requests" element={<CustomerRequestsPage />} />
        )}
        {runtimeConfig.customerQrEnabled && (
          <Route
            path="/customer-requests/:id"
            element={<CustomerRequestDetailPage />}
          />
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
