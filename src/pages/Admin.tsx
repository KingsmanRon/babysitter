import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatZAR } from "../lib/api";

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
    compare_at_price_cents: number | null;
    discount_percent_bps: number | null;
    sale_price_cents: number | null;
    sale_starts_at: string | null;
    sale_ends_at: string | null;
  }>;
};

type AdminProduct = AdminSummary["products"][number];

function toDatetimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function SaleEditor({
  product,
  token,
  onSaved,
  onCancel,
}: {
  product: AdminProduct;
  token: string;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [saleEnabled, setSaleEnabled] = useState(product.sale_price_cents !== null);
  const [discountPercent, setDiscountPercent] = useState(
    product.discount_percent_bps !== null ? String(product.discount_percent_bps / 100) : "",
  );
  const [saleStartsAt, setSaleStartsAt] = useState(toDatetimeLocal(product.sale_starts_at));
  const [saleEndsAt, setSaleEndsAt] = useState(toDatetimeLocal(product.sale_ends_at));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const discountBps = Math.round((Number(discountPercent) || 0) * 100);
  const preview = saleEnabled
    ? Math.round((product.price_cents * (10000 - discountBps)) / 10000)
    : null;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": token,
        },
        body: JSON.stringify({
          sale_enabled: saleEnabled,
          discount_percent: saleEnabled ? Number(discountPercent) : null,
          sale_starts_at: saleEnabled && saleStartsAt ? new Date(saleStartsAt).toISOString() : null,
          sale_ends_at: saleEnabled && saleEndsAt ? new Date(saleEndsAt).toISOString() : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      await onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-950 p-5 shadow-2xl space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold">Edit sale</h3>
            <p className="text-sm text-gray-400">{product.name}</p>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-white" type="button">
            ✕
          </button>
        </div>

        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={saleEnabled}
            onChange={(e) => setSaleEnabled(e.target.checked)}
            className="h-4 w-4 accent-purple-600"
          />
          Sale enabled
        </label>

        <div className="grid gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-gray-400">Discount %</span>
            <input
              type="number"
              min="0"
              max="99.99"
              step="0.01"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
              disabled={!saleEnabled}
              placeholder="30"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white disabled:opacity-50"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-400">Sale starts (optional)</span>
            <input
              type="datetime-local"
              value={saleStartsAt}
              onChange={(e) => setSaleStartsAt(e.target.value)}
              disabled={!saleEnabled}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white disabled:opacity-50"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-400">Sale ends (optional)</span>
            <input
              type="datetime-local"
              value={saleEndsAt}
              onChange={(e) => setSaleEndsAt(e.target.value)}
              disabled={!saleEnabled}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white disabled:opacity-50"
            />
          </label>
        </div>

        <div className="rounded-lg bg-gray-900 p-3 text-sm text-gray-300">
          Normal: {formatZAR(product.price_cents)} · Preview: {preview !== null ? formatZAR(preview) : "—"}
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} type="button" className="rounded-lg border border-gray-700 px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            onClick={save}
            type="button"
            disabled={saving}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save sale"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Admin() {
  const envToken = (import.meta.env.VITE_ADMIN_TOKEN as string | undefined) || "";
  const [token, setToken] = useState(() => sessionStorage.getItem("admin_token") || envToken);
  const [data, setData] = useState<AdminSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null);

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
      setEditingProduct((current) =>
        current ? json.products.find((product) => product.id === current.id) ?? null : null,
      );
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

        {editingProduct && (
          <SaleEditor
            product={editingProduct}
            token={token}
            onSaved={async () => {
              await load(token);
              setEditingProduct(null);
            }}
            onCancel={() => setEditingProduct(null)}
          />
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
                      <th className="text-right p-3">Normal price</th>
                      <th className="text-left p-3">Sale status</th>
                      <th className="text-right p-3">Sale preview</th>
                      <th className="text-right p-3">Stock</th>
                      <th className="text-right p-3">Active</th>
                      <th className="text-right p-3">Sale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.products.map((p) => (
                      <tr key={p.id} className="border-t border-gray-800">
                        <td className="p-3">{p.name}</td>
                        <td className="p-3 font-mono text-xs text-gray-400">{p.slug}</td>
                        <td className="p-3 text-right">{formatZAR(p.price_cents)}</td>
                        <td className="p-3">
                          {p.sale_price_cents !== null ? (
                            <div>
                              <span className="text-green-400">enabled</span>
                              <div className="text-xs text-gray-500">
                                {p.discount_percent_bps !== null ? `${p.discount_percent_bps / 100}% off` : "—"}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-500">disabled</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          {p.sale_price_cents !== null ? (
                            <div>
                              <span className="font-semibold text-green-300">{formatZAR(p.sale_price_cents)}</span>
                              <div className="text-xs text-gray-500 line-through">
                                {formatZAR(p.compare_at_price_cents ?? p.price_cents)}
                              </div>
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-3 text-right font-semibold">{p.stock_count}</td>
                        <td className="p-3 text-right">{p.is_active ? "yes" : "no"}</td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => setEditingProduct(p)}
                            className="rounded-lg border border-purple-500/50 px-3 py-1 text-xs text-purple-300 hover:bg-purple-500/10"
                          >
                            Edit
                          </button>
                        </td>
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
                        <td className="p-3 text-right">{formatZAR(o.amount_cents)}</td>
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
                        <td className="p-3 text-right">{formatZAR(t.amount_cents)}</td>
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
