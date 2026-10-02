import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2, X } from "lucide-react";
import { createYocoCheckout } from "../lib/api";

// /pay/:orderId — the "complete payment" link sent in WhatsApp reminders.
// Reopens Yoco's checkout for an unpaid order (re-holding its stock) or says
// why it can't (already paid, sold out, cancelled).
export default function Pay() {
  const { orderId } = useParams();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!orderId || started.current) return;
    started.current = true;
    createYocoCheckout(orderId)
      .then(({ redirectUrl }) => window.location.replace(redirectUrl))
      .catch((err: Error) => setError(err.message || "We couldn't open the payment page."));
  }, [orderId]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-gray-900 rounded-3xl border border-gray-800 shadow-2xl overflow-hidden">
        {error || !orderId ? (
          <>
            <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-8 text-center">
              <div className="w-20 h-20 mx-auto mb-3 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                <X className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">Can't open payment</h1>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-gray-300 text-sm">{error || "This payment link is incomplete."}</p>
              <Link
                to="/smilano"
                className="block w-full text-center py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-purple-500/25 transition"
              >
                Back to store
              </Link>
            </div>
          </>
        ) : (
          <div className="p-10 text-center">
            <Loader2 className="w-10 h-10 mx-auto text-purple-400 animate-spin" />
            <p className="mt-4 text-gray-300">Taking you to secure payment…</p>
          </div>
        )}
      </div>
    </div>
  );
}
