import { Navigate, Route, Routes } from "react-router-dom";
import { CustomerProvider } from "./customerFirebase";
import CustomerOrderPage from "./pages/CustomerOrderPage";
import CustomerStatusPage from "./pages/CustomerStatusPage";

export default function CustomerOrderingApp() {
  return (
    <CustomerProvider>
      <Routes>
        <Route path="/order" element={<CustomerOrderPage />} />
        <Route
          path="/order/status/:requestId"
          element={<CustomerStatusPage />}
        />
        <Route path="*" element={<Navigate to="/order" replace />} />
      </Routes>
    </CustomerProvider>
  );
}
