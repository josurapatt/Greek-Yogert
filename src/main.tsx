import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./styles.css";
import "./channel.css";
import "./staff-ux.css";
import "./customer.css";
import "./report.css";
import App from "./App";
import AppErrorBoundary from "./components/AppErrorBoundary";
import { AuthProvider, CartProvider, DataProvider } from "./store";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AppErrorBoundary>
        <AuthProvider>
          <DataProvider>
            <CartProvider>
              <App />
            </CartProvider>
          </DataProvider>
        </AuthProvider>
      </AppErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
);
