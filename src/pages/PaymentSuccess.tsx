import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, Loader2 } from "lucide-react";
import { fetchOrder, formatZarFromCents, Order, OrderItem } from "../lib/api";

const TERMINAL_STATES = new Set(["paid", "payment_failed", "cancelled", "refunded"]);

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("orderId");
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const data = await fetchOrder(orderId);
        if (cancelled) return;
        setOrder(data.order);
        setItems(data.items);
        if (!TERMINAL_STATES.has(data.order.status)) {
          setTimeout(poll, 2500);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const isPaid = order?.status === "paid";
  const waiting = !isPaid && order?.status !== "payment_failed" && !error;

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-gray-900 rounded-3xl border border-gray-800 shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-green-600 via-emerald-500 to-teal-500 p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-3 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
            {waiting ? (
              <Loader2 className="w-10 h-10 text-white animate-spin" />
            ) : (
              <Check className="w-10 h-10 text-white" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-white">
            {isPaid ? "Payment confirmed!" : waiting ? "Confirming your payment..." : "Payment status"}
          </h1>
          <p className="text-white/80 mt-1 text-sm">
            {isPaid
              ? "Thank you — your order is on its way."
              : "Please wait while we confirm with Yoco. This usually takes a few seconds."}
          </p>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
              {error}
            </div>
          )}

          {order && (
            <div className="p-4 rounded-xl bg-gray-800/50 border border-gray-700 space-y-2">
              <div className="flex justify-between text-gray-400 text-sm">
                <span>Order number</span>
                <span className="font-mono text-purple-400">{order.order_number}</span>
              </div>
              <div className="flex justify-between text-gray-400 text-sm">
                <span>Status</span>
                <span className="text-white font-semibold">{order.status}</span>
              </div>
              <div className="flex justify-between text-gray-400 text-sm">
                <span>Total</span>
                <span className="text-white font-bold">{formatZarFromCents(order.amount_cents)}</span>
              </div>
            </div>
          )}

          {items.length > 0 && (
            <div className="p-4 rounded-xl bg-gray-800/50 border border-gray-700 space-y-2">
              {items.map((it, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-300">
                    {it.product_name}
                    {it.size ? ` · ${it.size}` : ""} × {it.quantity}
                  </span>
                  <span className="text-gray-400">
                    {formatZarFromCents(it.unit_price_cents * it.quantity)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-gray-500 leading-relaxed">
            Your final payment state is determined by our server, not this page. If you've just paid
            and see "pending", give it a few seconds for the webhook to arrive.
          </p>

          <Link
            to="/"
            className="block w-full text-center py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-purple-500/25 transition"
          >
            Continue shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
