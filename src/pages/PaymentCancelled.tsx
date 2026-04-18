import { Link, useSearchParams } from "react-router-dom";
import { X } from "lucide-react";

export default function PaymentCancelled() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("orderId");

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-gray-900 rounded-3xl border border-gray-800 shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-3 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
            <X className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Payment cancelled</h1>
          <p className="text-white/80 mt-1 text-sm">No charges were made.</p>
        </div>
        <div className="p-6 space-y-4">
          {orderId && (
            <p className="text-xs text-gray-500 font-mono break-all">Order ref: {orderId}</p>
          )}
          <p className="text-gray-400 text-sm">
            You cancelled the payment before it completed. You can try again whenever you're ready.
          </p>
          <Link
            to="/"
            className="block w-full text-center py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-purple-500/25 transition"
          >
            Back to store
          </Link>
        </div>
      </div>
    </div>
  );
}
