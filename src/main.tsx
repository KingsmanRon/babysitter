import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";
import Home from "./pages/Home";

// Everything off the landing page loads on demand to keep the first paint small.
const Smilano = lazy(() => import("./pages/Smilano"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const PaymentCancelled = lazy(() => import("./pages/PaymentCancelled"));
const PaymentFailed = lazy(() => import("./pages/PaymentFailed"));
const Admin = lazy(() => import("./pages/Admin"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={<div className="min-h-screen bg-[#0b0b0b]" />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/help" element={<Home />} />
          <Route path="/smilano" element={<Smilano />} />
          <Route path="/payment/success" element={<PaymentSuccess />} />
          <Route path="/payment/cancelled" element={<PaymentCancelled />} />
          <Route path="/payment/failed" element={<PaymentFailed />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
