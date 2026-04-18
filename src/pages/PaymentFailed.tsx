import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle } from "lucide-react";

export default function PaymentFailed() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("orderId");

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-gray-900 rounded-3xl border border-gray-800 shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-red-600 to-rose-500 p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-3 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Payment failed</h1>
          <p className="text-white/80 mt-1 text-sm">
            Your bank or Yoco declined the transaction.
          </p>
        </div>
        <div className="p-6 space-y-4">
          {orderId && (
            <p className="text-xs text-gray-500 font-mono break-all">Order ref: {orderId}</p>
          )}
          <p className="text-gray-400 text-sm">
            Common causes: insufficient funds, 3-D Secure declined, or a typo in your card details.
            Try again, or use a different card.
          </p>
          <Link
            to="/"
            className="block w-full text-center py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-purple-500/25 transition"
          >
            Try again
          </Link>
        </div>
      </div>
    </div>
  );
}
