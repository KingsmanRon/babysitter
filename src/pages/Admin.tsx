import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatZarFromCents } from "../lib/api";

type ProductSaleDraft = {
  compare_at_price_cents: string;
  sale_price_cents: string;
  discount_percent_bps: string;
  sale_starts_at: string;
  sale_ends_at: string;
};

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
    sale_price_cents: number | null;
    discount_percent_bps: number | null;
    sale_starts_at: string | null;
    sale_ends_at: string | null;
  }>;
};

type AdminProduct = AdminSummary["products"][number];

const saleDraftFromProduct = (product: AdminProduct): ProductSaleDraft => ({
  compare_at_price_cents: product.compare_at_price_cents?.toString() ?? "",
  sale_price_cents: product.sale_price_cents?.toString() ?? "",
  discount_percent_bps: product.discount_percent_bps?.toString() ?? "",
  sale_starts_at: toDatetimeLocal(product.sale_starts_at),
  sale_ends_at: toDatetimeLocal(product.sale_ends_at),
});

function toDatetimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromDatetimeLocal(value: string): string | null {
  if (!value.trim()) return null;
  return new Date(value).toISOString();
}

function parseNullableInteger(value: string, field: string, max?: number): number | null {
  if (!value.trim()) return null;
  if (!/^\d+$/.test(value.trim())) throw new Error(`${field} must be a non-negative integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${field} is too large`);
  if (max !== undefined && parsed > max) throw new Error(`${field} must be between 0 and ${max}`);
  return parsed;
}

export default function Admin() {
  const envToken = (import.meta.env.VITE_ADMIN_TOKEN as string | undefined) || "";
  const [token, setToken] = useState(() => sessionStorage.getItem("admin_token") || envToken);
  const [data, setData] = useState<AdminSummary | null>(null);
  const [saleDrafts, setSaleDrafts] = useState<Record<string, ProductSaleDraft>>({});
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
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
      setSaleDrafts(Object.fromEntries(json.products.map((p) => [p.id, saleDraftFromProduct(p)])));
      sessionStorage.setItem("admin_token", t);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const updateSaleDraft = (productId: string, field: keyof ProductSaleDraft, value: string) => {
    setSaleDrafts((drafts) => ({
      ...drafts,
      [productId]: {
        ...drafts[productId],
        [field]: value,
      },
    }));
  };

  const saveSaleFields = async (productId: string) => {
    const draft = saleDrafts[productId];
    if (!draft) return;

    setSavingProductId(productId);
    setError(null);
    try {
      const body = {
        compare_at_price_cents: parseNullableInteger(
          draft.compare_at_price_cents,
          "Compare-at price cents",
        ),
        sale_price_cents: parseNullableInteger(draft.sale_price_cents, "Sale price cents"),
        discount_percent_bps: parseNullableInteger(
          draft.discount_percent_bps,
          "Discount basis points",
          10000,
        ),
        sale_starts_at: fromDatetimeLocal(draft.sale_starts_at),
        sale_ends_at: fromDatetimeLocal(draft.sale_ends_at),
      };

      const res = await fetch(`/api/admin/products/${encodeURIComponent(productId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": token,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const responseBody = await res.json().catch(() => ({}));
        throw new Error(responseBody.error || `HTTP ${res.status}`);
      }
      await load(token);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingProductId(null);
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
                      <th className="text-left p-3">Sale price</th>
                      <th className="text-left p-3">Compare at</th>
                      <th className="text-left p-3">Discount bps</th>
                      <th className="text-left p-3">Sale start</th>
                      <th className="text-left p-3">Sale end</th>
                      <th className="text-right p-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.products.map((p) => {
                      const draft = saleDrafts[p.id] || saleDraftFromProduct(p);
                      const inputClass =
                        "w-32 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white focus:outline-none focus:border-purple-500";
                      return (
                        <tr key={p.id} className="border-t border-gray-800">
                          <td className="p-3">{p.name}</td>
                          <td className="p-3 font-mono text-xs text-gray-400">{p.slug}</td>
                          <td className="p-3 text-right">{formatZarFromCents(p.price_cents)}</td>
                          <td className="p-3 text-right font-semibold">{p.stock_count}</td>
                          <td className="p-3 text-right">{p.is_active ? "yes" : "no"}</td>
                          <td className="p-3">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={draft.sale_price_cents}
                              onChange={(e) => updateSaleDraft(p.id, "sale_price_cents", e.target.value)}
                              className={inputClass}
                              placeholder="cents"
                            />
                          </td>
                          <td className="p-3">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={draft.compare_at_price_cents}
                              onChange={(e) =>
                                updateSaleDraft(p.id, "compare_at_price_cents", e.target.value)
                              }
                              className={inputClass}
                              placeholder="cents"
                            />
                          </td>
                          <td className="p-3">
                            <input
                              type="number"
                              min="0"
                              max="10000"
                              step="1"
                              value={draft.discount_percent_bps}
                              onChange={(e) =>
                                updateSaleDraft(p.id, "discount_percent_bps", e.target.value)
                              }
                              className={inputClass}
                              placeholder="0-10000"
                            />
                          </td>
                          <td className="p-3">
                            <input
                              type="datetime-local"
                              value={draft.sale_starts_at}
                              onChange={(e) => updateSaleDraft(p.id, "sale_starts_at", e.target.value)}
                              className="w-44 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white focus:outline-none focus:border-purple-500"
                            />
                          </td>
                          <td className="p-3">
                            <input
                              type="datetime-local"
                              value={draft.sale_ends_at}
                              onChange={(e) => updateSaleDraft(p.id, "sale_ends_at", e.target.value)}
                              className="w-44 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white focus:outline-none focus:border-purple-500"
                            />
                          </td>
                          <td className="p-3 text-right">
                            <button
                              type="button"
                              onClick={() => saveSaleFields(p.id)}
                              disabled={savingProductId === p.id}
                              className="px-3 py-1 bg-purple-600 rounded font-semibold disabled:opacity-50"
                            >
                              {savingProductId === p.id ? "Saving..." : "Save"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
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
