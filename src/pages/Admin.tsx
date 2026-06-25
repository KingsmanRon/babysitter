import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatZarFromCents } from "../lib/api";

type AdminSummary = {
  orders: Array<{
    id: string;
    order_number: string;
    status: string;
    amount_cents: number;
    currency: string;
    customer_email: string | null;
    customer_name: string | null;
    created_at: string;
  }>;
  transactions: Array<{
    id: string;
    order_id: string;
    provider_checkout_id: string | null;
    provider_payment_id: string | null;
    provider_status: string | null;
    amount_cents: number;
    processing_mode: string | null;
    payment_method_brand: string | null;
    payment_method_last4: string | null;
    paid_at: string | null;
    failed_at: string | null;
    created_at: string;
  }>;
  products: Array<{
    id: string;
    slug: string;
    name: string;
    stock_count: number;
    price_cents: number;
    currency: string;
    is_active: boolean;
  }>;
};

export default function Admin() {
  const envToken = (import.meta.env.VITE_ADMIN_TOKEN as string | undefined) || "";
  const [token, setToken] = useState(() => sessionStorage.getItem("admin_token") || envToken);
  const [data, setData] = useState<AdminSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (t: string) => {
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/summary", {
        headers: { "x-admin-token": t },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = (await res.json()) as AdminSummary;
      setData(json);
      sessionStorage.setItem("admin_token", t);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) load(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Admin</h1>
          <Link to="/" className="text-sm text-purple-400 hover:text-purple-300">
            ← Back to store
          </Link>
        </div>

        <div className="p-4 rounded-xl bg-gray-900 border border-gray-800 flex gap-3 items-center">
          <input
            type="password"
            placeholder="Admin token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
          />
          <button
            onClick={() => load(token)}
            disabled={!token || loading}
            className="px-4 py-2 bg-purple-600 rounded-lg font-semibold disabled:opacity-50"
          >
            {loading ? "Loading..." : "Load"}
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
            {error}
          </div>
        )}

        {data && (
          <>
            <section className="space-y-3">
              <h2 className="text-xl font-bold">Stock</h2>
              <div className="overflow-x-auto rounded-xl border border-gray-800">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900 text-gray-400">
                    <tr>
                      <th className="text-left p-3">Product</th>
                      <th className="text-left p-3">Slug</th>
                      <th className="text-right p-3">Price</th>
                      <th className="text-right p-3">Stock</th>
                      <th className="text-right p-3">Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.products.map((p) => (
                      <tr key={p.id} className="border-t border-gray-800">
                        <td className="p-3">{p.name}</td>
                        <td className="p-3 font-mono text-xs text-gray-400">{p.slug}</td>
                        <td className="p-3 text-right">{formatZarFromCents(p.price_cents)}</td>
                        <td className="p-3 text-right font-semibold">{p.stock_count}</td>
                        <td className="p-3 text-right">{p.is_active ? "yes" : "no"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold">Orders ({data.orders.length})</h2>
              <div className="overflow-x-auto rounded-xl border border-gray-800">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900 text-gray-400">
                    <tr>
                      <th className="text-left p-3">Order #</th>
                      <th className="text-left p-3">Status</th>
                      <th className="text-right p-3">Amount</th>
                      <th className="text-left p-3">Customer</th>
                      <th className="text-left p-3">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.orders.map((o) => (
                      <tr key={o.id} className="border-t border-gray-800">
                        <td className="p-3 font-mono text-purple-400">{o.order_number}</td>
                        <td className="p-3">
                          <span
                            className={
                              o.status === "paid"
                                ? "text-green-400"
                                : o.status === "payment_failed"
                                  ? "text-red-400"
                                  : "text-gray-300"
                            }
                          >
                            {o.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">{formatZarFromCents(o.amount_cents)}</td>
                        <td className="p-3">
                          <div>{o.customer_name || "—"}</div>
                          <div className="text-xs text-gray-500">{o.customer_email || "—"}</div>
                        </td>
                        <td className="p-3 text-xs text-gray-400">
                          {new Date(o.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold">Transactions ({data.transactions.length})</h2>
              <div className="overflow-x-auto rounded-xl border border-gray-800">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900 text-gray-400">
                    <tr>
                      <th className="text-left p-3">Checkout ID</th>
                      <th className="text-left p-3">Payment ID</th>
                      <th className="text-left p-3">Status</th>
                      <th className="text-right p-3">Amount</th>
                      <th className="text-left p-3">Method</th>
                      <th className="text-left p-3">Mode</th>
                      <th className="text-left p-3">Paid / Failed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.transactions.map((t) => (
                      <tr key={t.id} className="border-t border-gray-800">
                        <td className="p-3 font-mono text-xs break-all">
                          {t.provider_checkout_id || "—"}
                        </td>
                        <td className="p-3 font-mono text-xs break-all">
                          {t.provider_payment_id || "—"}
                        </td>
                        <td className="p-3">{t.provider_status || "—"}</td>
                        <td className="p-3 text-right">{formatZarFromCents(t.amount_cents)}</td>
                        <td className="p-3">
                          {t.payment_method_brand
                            ? `${t.payment_method_brand}${t.payment_method_last4 ? ` ···${t.payment_method_last4}` : ""}`
                            : "—"}
                        </td>
                        <td className="p-3">{t.processing_mode || "—"}</td>
                        <td className="p-3 text-xs text-gray-400">
                          {t.paid_at ? `paid ${new Date(t.paid_at).toLocaleString()}` : ""}
                          {t.failed_at ? `failed ${new Date(t.failed_at).toLocaleString()}` : ""}
                          {!t.paid_at && !t.failed_at ? "—" : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
