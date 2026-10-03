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
    fulfilment_method?: string | null;
    delivery_fee_cents?: number | null;
    ship_phone: string | null;
    ship_line1: string | null;
    ship_line2: string | null;
    ship_suburb: string | null;
    ship_city: string | null;
    ship_province: string | null;
    ship_postal_code: string | null;
    metadata?: { stock_flags?: unknown[] } | null;
    fulfilment_status?: string | null;
    courier?: string | null;
    tracking_number?: string | null;
    dispatched_at?: string | null;
    delivered_at?: string | null;
    items?: Array<{ product_name: string; size: string | null; quantity: number }>;
    nudge_count?: number;
    last_nudged_at?: string | null;
    // Only on pending_payment orders.
    nudge_phone_valid?: boolean;
    superseded_by_order?: string | null;
    confirmation_email_sent_at?: string | null;
    confirmation_email_error?: string | null;
    confirmation_email_manual_at?: string | null;
    dispatch_email_sent_at?: string | null;
    dispatch_email_error?: string | null;
    dispatch_email_manual_at?: string | null;
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
    payment_method_type: string | null;
    payment_method_brand: string | null;
    payment_method_last4: string | null;
    paid_at: string | null;
    failed_at: string | null;
    created_at: string;
  }>;
  emailConfigured?: boolean;
  products: Array<{
    id: string;
    slug: string;
    name: string;
    stock_count: number;
    size_stock?: Record<string, number> | null;
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

// Each key is the query string sent to /api/admin/summary; must match
// STATUS_FILTERS / FULFILMENT_FILTERS there.
const PAYMENT_FILTERS = [
  { key: "", label: "All" },
  { key: "status=paid", label: "Paid" },
  { key: "status=pending", label: "Pending" },
  { key: "status=failed", label: "Failed" },
  { key: "status=expired", label: "Expired" },
  { key: "status=cancelled", label: "Cancelled" },
  { key: "status=refunded", label: "Refunded" },
];
const FULFILMENT_FILTERS = [
  { key: "fulfilment=to_fulfil", label: "To pack & send" },
  { key: "fulfilment=dispatched", label: "Out for delivery / ready" },
  { key: "fulfilment=done", label: "Delivered / collected" },
];

// Must match DELIVERY_STEPS / COLLECTION_STEPS in lib/fulfilment.ts.
const FULFILMENT_LABELS: Record<string, string> = {
  unfulfilled: "Not packed",
  packed: "Packed",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  ready_for_collection: "Ready for collection",
  collected: "Collected",
};
const DELIVERY_STEPS = ["unfulfilled", "packed", "out_for_delivery", "delivered"];
const COLLECTION_STEPS = ["unfulfilled", "packed", "ready_for_collection", "collected"];

type TrackingDraft = { courier: string; tracking_number: string };
type AdminOrder = AdminSummary["orders"][number];
type EmailKind = "confirmation" | "dispatch";
// Steps at which the customer has had (or can be sent) the dispatch email.
const DISPATCHED_STEPS = ["out_for_delivery", "ready_for_collection", "delivered", "collected"];

// Admin tables never scroll sideways: below md each row stacks into a card,
// with every cell labelled from its data-label attribute.
const T = {
  wrap: "rounded-xl border border-gray-800 overflow-hidden",
  table: "w-full text-sm block md:table",
  thead: "hidden md:table-header-group bg-gray-900 text-gray-400",
  tbody: "block md:table-row-group",
  tr: "block md:table-row border-t border-gray-800 first:border-t-0 md:first:border-t py-2 md:py-0",
  th: "p-3 text-left font-semibold align-bottom",
  td: "block md:table-cell px-4 py-1.5 md:p-3 align-top break-words before:block before:mb-0.5 before:text-[11px] before:uppercase before:tracking-wide before:text-gray-500 before:content-[attr(data-label)] md:before:content-none",
};
const INPUT = "w-full min-w-0 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white focus:outline-none focus:border-purple-500";

const PENDING_FILTER = "status=pending";

// "M ×2 · L ×1" totals across paid orders, for packing.
function paidSizeTotals(orders: AdminSummary["orders"]): string {
  const totals = new Map<string, number>();
  for (const o of orders) {
    if (o.status !== "paid") continue;
    for (const item of o.items ?? []) {
      const size = item.size || "No size";
      totals.set(size, (totals.get(size) ?? 0) + item.quantity);
    }
  }
  const order = ["XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL"];
  return [...totals.entries()]
    .sort(([a], [b]) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    })
    .map(([size, qty]) => `${size} ×${qty}`)
    .join(" · ");
}
const MAX_NUDGES = 2;

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

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
  // Typed in by the admin, never read from a VITE_ var: those ship in the public bundle.
  const [token, setToken] = useState(() => sessionStorage.getItem("admin_token") || "");
  const [data, setData] = useState<AdminSummary | null>(null);
  const [saleDrafts, setSaleDrafts] = useState<Record<string, ProductSaleDraft>>({});
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderFilter, setOrderFilter] = useState("");
  const [trackingDrafts, setTrackingDrafts] = useState<Record<string, TrackingDraft>>({});
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);
  const [nudgeState, setNudgeState] = useState<Record<string, { busy: boolean; error: string | null }>>({});
  const [emailState, setEmailState] = useState<Record<string, { busy: "send" | "manual" | null; error: string | null }>>({});

  const load = async (t: string, filter: string = orderFilter) => {
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      const query = filter ? `?${filter}` : "";
      const res = await fetch(`/api/admin/summary${query}`, {
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

  const updateFulfilment = async (orderId: string, body: Record<string, string | null>) => {
    setSavingOrderId(orderId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-token": token },
        body: JSON.stringify(body),
      });
      const responseBody = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(responseBody.error || `HTTP ${res.status}`);
      }
      // Marking Out for delivery / Ready for collection emails the customer; a
      // failure shows on the order's "On its way email" block after the reload.
      setTrackingDrafts((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
      await load(token);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingOrderId(null);
    }
  };

  // Customer emails: "send" goes out through the email service; "manual"
  // opens the admin's own mail app with the plain-text version (fallback).
  const orderEmail = async (orderId: string, kind: EmailKind, mode: "send" | "manual") => {
    const key = `${kind}:${orderId}`;
    setEmailState((prev) => ({ ...prev, [key]: { busy: mode, error: null } }));
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": token },
        body: JSON.stringify({ mode, kind }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      if (mode === "manual") window.location.href = body.mailto;
      setData((prev) =>
        prev && {
          ...prev,
          orders: prev.orders.map((o) =>
            o.id !== orderId
              ? o
              : mode === "manual"
                ? { ...o, [`${kind}_email_manual_at`]: body.manualAt }
                : { ...o, [`${kind}_email_sent_at`]: body.sentAt, [`${kind}_email_error`]: null },
          ),
        },
      );
      setEmailState((prev) => ({ ...prev, [key]: { busy: null, error: null } }));
    } catch (err) {
      setEmailState((prev) => ({ ...prev, [key]: { busy: null, error: (err as Error).message } }));
    }
  };

  const renderEmailBlock = (o: AdminOrder, kind: EmailKind, label: string) => {
    const sentAt = kind === "confirmation" ? o.confirmation_email_sent_at : o.dispatch_email_sent_at;
    const failed = kind === "confirmation" ? o.confirmation_email_error : o.dispatch_email_error;
    const manualAt = kind === "confirmation" ? o.confirmation_email_manual_at : o.dispatch_email_manual_at;
    const state = emailState[`${kind}:${o.id}`];
    const btn =
      "px-2 py-1 rounded font-semibold disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300";
    return (
      <div className="mt-2 pt-2 border-t border-gray-800 space-y-1.5">
        <div className="text-gray-500 uppercase tracking-wide text-[11px]">{label}</div>
        {!o.customer_email ? (
          <div className="text-amber-400">No email address</div>
        ) : (
          <>
            {sentAt ? (
              <div className="text-green-400">✓ Sent {timeAgo(sentAt)}</div>
            ) : failed ? (
              <div className="text-red-400">Not sent: {failed}</div>
            ) : (
              <div className="text-gray-400">Not sent</div>
            )}
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                disabled={!!state?.busy || !data?.emailConfigured}
                title={data?.emailConfigured ? undefined : "Email sending isn't set up yet (RESEND_API_KEY)"}
                onClick={() => orderEmail(o.id, kind, "send")}
                className={`${btn} bg-purple-600 hover:bg-purple-500`}
              >
                {state?.busy === "send" ? "Sending…" : sentAt ? "Resend" : "Send email"}
              </button>
              <button
                type="button"
                disabled={!!state?.busy}
                onClick={() => orderEmail(o.id, kind, "manual")}
                className={`${btn} border border-gray-700 text-gray-200 hover:border-gray-500`}
              >
                {state?.busy === "manual" ? "Opening…" : "Email manually"}
              </button>
            </div>
            {manualAt && <div className="text-gray-500">Opened manually {timeAgo(manualAt)}</div>}
            {state?.error && (
              <div role="alert" className="text-red-400">
                {state.error}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const sendNudge = async (orderId: string) => {
    // Open the tab synchronously, in the click, so pop-up blockers allow it;
    // it is pointed at WhatsApp once the server has recorded the reminder.
    const win = window.open("", "_blank");
    if (!win) {
      setNudgeState((prev) => ({
        ...prev,
        [orderId]: { busy: false, error: "Pop-up blocked. Allow pop-ups for this site and try again." },
      }));
      return;
    }
    win.opener = null;
    setNudgeState((prev) => ({ ...prev, [orderId]: { busy: true, error: null } }));
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/nudge`, {
        method: "POST",
        headers: { "x-admin-token": token },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body.url !== "string") {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      win.location.href = body.url;
      setData((prev) =>
        prev && {
          ...prev,
          orders: prev.orders.map((o) =>
            o.id === orderId ? { ...o, nudge_count: body.nudgeCount, last_nudged_at: body.lastNudgedAt } : o,
          ),
        },
      );
      setNudgeState((prev) => ({ ...prev, [orderId]: { busy: false, error: null } }));
    } catch (err) {
      win.close();
      setNudgeState((prev) => ({ ...prev, [orderId]: { busy: false, error: (err as Error).message } }));
    }
  };

  useEffect(() => {
    if (token) load(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-black text-white px-4 py-6 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
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
              <div className={T.wrap}>
                <table className={T.table}>
                  <thead className={T.thead}>
                    <tr>
                      <th className={T.th}>Product</th>
                      <th className={`${T.th} md:text-right`}>Price</th>
                      <th className={`${T.th} md:text-right`}>Stock</th>
                      <th className={T.th}>Active</th>
                      <th className={`${T.th} w-[55%]`}>Sale</th>
                    </tr>
                  </thead>
                  <tbody className={T.tbody}>
                    {data.products.map((p) => {
                      const draft = saleDrafts[p.id] || saleDraftFromProduct(p);
                      const field = (label: string, input: React.ReactNode) => (
                        <label className="block text-xs text-gray-500 space-y-1">
                          <span>{label}</span>
                          {input}
                        </label>
                      );
                      return (
                        <tr key={p.id} className={T.tr}>
                          <td data-label="Product" className={T.td}>
                            <div className="font-semibold">{p.name}</div>
                            <div className="font-mono text-xs text-gray-500">{p.slug}</div>
                          </td>
                          <td data-label="Price" className={`${T.td} md:text-right`}>
                            {formatZarFromCents(p.price_cents)}
                          </td>
                          <td data-label="Stock" className={`${T.td} md:text-right font-semibold`}>
                            {p.stock_count}
                            {p.size_stock && (
                              <div className="text-xs font-normal text-gray-500">
                                {Object.entries(p.size_stock).map(([size, n]) => `${size} ${n}`).join(" · ")}
                              </div>
                            )}
                          </td>
                          <td data-label="Active" className={T.td}>
                            {p.is_active ? "yes" : "no"}
                          </td>
                          <td data-label="Sale" className={T.td}>
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                              {field(
                                "Sale price (cents)",
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={draft.sale_price_cents}
                                  onChange={(e) => updateSaleDraft(p.id, "sale_price_cents", e.target.value)}
                                  className={INPUT}
                                  placeholder="cents"
                                />,
                              )}
                              {field(
                                "Compare at (cents)",
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={draft.compare_at_price_cents}
                                  onChange={(e) => updateSaleDraft(p.id, "compare_at_price_cents", e.target.value)}
                                  className={INPUT}
                                  placeholder="cents"
                                />,
                              )}
                              {field(
                                "Discount (bps)",
                                <input
                                  type="number"
                                  min="0"
                                  max="10000"
                                  step="1"
                                  value={draft.discount_percent_bps}
                                  onChange={(e) => updateSaleDraft(p.id, "discount_percent_bps", e.target.value)}
                                  className={INPUT}
                                  placeholder="0-10000"
                                />,
                              )}
                              {field(
                                "Sale start",
                                <input
                                  type="datetime-local"
                                  value={draft.sale_starts_at}
                                  onChange={(e) => updateSaleDraft(p.id, "sale_starts_at", e.target.value)}
                                  className={INPUT}
                                />,
                              )}
                              {field(
                                "Sale end",
                                <input
                                  type="datetime-local"
                                  value={draft.sale_ends_at}
                                  onChange={(e) => updateSaleDraft(p.id, "sale_ends_at", e.target.value)}
                                  className={INPUT}
                                />,
                              )}
                              <div className="flex items-end">
                                <button
                                  type="button"
                                  onClick={() => saveSaleFields(p.id)}
                                  disabled={savingProductId === p.id}
                                  className="w-full px-3 py-1 bg-purple-600 rounded font-semibold disabled:opacity-50"
                                >
                                  {savingProductId === p.id ? "Saving..." : "Save"}
                                </button>
                              </div>
                            </div>
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
              {[
                { title: "Payment", filters: PAYMENT_FILTERS },
                { title: "Fulfilment", filters: FULFILMENT_FILTERS },
              ].map((group) => (
                <div key={group.title} className="flex flex-wrap items-center gap-2">
                  <span className="w-20 text-xs uppercase tracking-wide text-gray-500">{group.title}</span>
                  {group.filters.map((f) => (
                    <button
                      key={f.key || "all"}
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        setOrderFilter(f.key);
                        load(token, f.key);
                      }}
                      className={`px-3 py-1 rounded-full text-sm font-semibold border disabled:opacity-50 ${
                        orderFilter === f.key
                          ? "bg-purple-600 border-purple-600 text-white"
                          : "border-gray-700 text-gray-300 hover:border-gray-500"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              ))}
              {paidSizeTotals(data.orders) && (
                <p className="text-sm text-gray-400">
                  <span className="text-gray-500">Paid sizes in this list:</span>{" "}
                  <span className="font-semibold text-white">{paidSizeTotals(data.orders)}</span>
                </p>
              )}
              <div className={T.wrap}>
                <table className={T.table}>
                  <thead className={T.thead}>
                    <tr>
                      <th className={T.th}>Order</th>
                      <th className={T.th}>Status</th>
                      <th className={T.th}>Items</th>
                      <th className={T.th}>Customer</th>
                      {orderFilter === PENDING_FILTER && <th className={T.th}>Nudge</th>}
                      <th className={T.th}>Deliver to</th>
                      <th className={T.th}>Fulfilment</th>
                    </tr>
                  </thead>
                  <tbody className={T.tbody}>
                    {data.orders.map((o) => (
                      <tr key={o.id} className={T.tr}>
                        <td data-label="Order" className={T.td}>
                          <div className="font-mono text-purple-400">{o.order_number}</div>
                          <div className="text-xs text-gray-500">{new Date(o.created_at).toLocaleString()}</div>
                        </td>
                        <td data-label="Status" className={T.td}>
                          <span
                            className={
                              o.status === "paid"
                                ? "text-green-400"
                                : o.status === "payment_failed"
                                  ? "text-red-400"
                                  : o.status === "expired"
                                    ? "text-amber-400"
                                  : "text-gray-300"
                            }
                          >
                            {o.status}
                          </span>
                          <div className="font-semibold">{formatZarFromCents(o.amount_cents)}</div>
                          {o.metadata?.stock_flags?.length ? (
                            <div className="text-xs font-semibold text-amber-400">Out of stock: refund</div>
                          ) : null}
                        </td>
                        <td data-label="Items" className={`${T.td} text-xs`}>
                          {o.items?.length ? (
                            o.items.map((item, i) => (
                              <div key={i} className="py-0.5">
                                <span className="inline-block min-w-[2.25rem] mr-1.5 px-1.5 py-0.5 rounded bg-purple-600/20 text-purple-300 font-bold text-center">
                                  {item.size || "—"}
                                </span>
                                <span className="text-gray-300">×{item.quantity}</span>{" "}
                                <span className="text-gray-500">{item.product_name}</span>
                              </div>
                            ))
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                        <td data-label="Customer" className={T.td}>
                          <div>{o.customer_name || "—"}</div>
                          <div className="text-xs text-gray-500">{o.customer_email || "—"}</div>
                        </td>
                        {orderFilter === PENDING_FILTER && (
                          <td data-label="Nudge" className={`${T.td} text-xs`}>
                            {o.status !== "pending_payment" ? (
                              <span className="text-gray-600">—</span>
                            ) : o.superseded_by_order ? (
                              <div className="text-green-400 font-semibold">
                                Paid on a later order
                                <div className="font-mono font-normal text-gray-500">{o.superseded_by_order}</div>
                              </div>
                            ) : !o.nudge_phone_valid ? (
                              <span className="text-amber-400 font-semibold">Fix phone number</span>
                            ) : (
                              (() => {
                                const count = o.nudge_count ?? 0;
                                const state = nudgeState[o.id];
                                return (
                                  <div className="space-y-1">
                                    {count >= MAX_NUDGES ? (
                                      <span className="text-gray-400 font-semibold">Reminders done</span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => sendNudge(o.id)}
                                        disabled={state?.busy}
                                        aria-busy={state?.busy || undefined}
                                        className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold disabled:opacity-50 disabled:cursor-wait focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
                                      >
                                        {state?.busy ? "Opening…" : count === 0 ? "Nudge" : "Send final nudge"}
                                      </button>
                                    )}
                                    {count > 0 && o.last_nudged_at && (
                                      <div className="text-gray-500">
                                        Nudged {count}× · {timeAgo(o.last_nudged_at)}
                                      </div>
                                    )}
                                    {state?.error && (
                                      <div role="alert" className="text-red-400">
                                        {state.error}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()
                            )}
                          </td>
                        )}
                        <td data-label="Deliver to" className={`${T.td} text-xs text-gray-400`}>
                          {o.fulfilment_method === "collection" ? (
                            <>
                              <div className="text-orange-300 font-semibold uppercase">Collection</div>
                              {o.ship_phone && <div>{o.ship_phone}</div>}
                            </>
                          ) : o.ship_line1 ? (
                            <>
                              <div>{[o.ship_line1, o.ship_line2].filter(Boolean).join(", ")}</div>
                              <div>{[o.ship_suburb, o.ship_city].filter(Boolean).join(", ")}</div>
                              <div>{[o.ship_province, o.ship_postal_code].filter(Boolean).join(" ")}</div>
                              {o.ship_phone && <div>{o.ship_phone}</div>}
                              {!!o.delivery_fee_cents && (
                                <div className="text-gray-500">Delivery fee {formatZarFromCents(o.delivery_fee_cents)}</div>
                              )}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td data-label="Fulfilment" className={`${T.td} text-xs`}>
                          {o.status !== "paid" ? (
                            <span className="text-gray-600">—</span>
                          ) : (
                            (() => {
                              const isCollection = o.fulfilment_method === "collection";
                              const steps = isCollection ? COLLECTION_STEPS : DELIVERY_STEPS;
                              const current = o.fulfilment_status || "unfulfilled";
                              const draft = trackingDrafts[o.id] ?? {
                                courier: o.courier ?? "",
                                tracking_number: o.tracking_number ?? "",
                              };
                              const saving = savingOrderId === o.id;
                              const done = current === "delivered" || current === "collected";
                              return (
                                <div className="space-y-1.5">
                                  <select
                                    value={current}
                                    disabled={saving}
                                    onChange={(e) =>
                                      updateFulfilment(o.id, {
                                        fulfilment_status: e.target.value,
                                        // Save typed courier/tracking with the step, so the
                                        // "on its way" email includes them.
                                        ...(trackingDrafts[o.id] ?? {}),
                                      })
                                    }
                                    className={`w-full px-2 py-1 bg-gray-800 border rounded focus:outline-none focus:border-purple-500 disabled:opacity-50 ${
                                      done
                                        ? "border-green-700 text-green-400"
                                        : current === "unfulfilled"
                                          ? "border-amber-700 text-amber-300"
                                          : "border-gray-700 text-white"
                                    }`}
                                  >
                                    {steps.map((step) => (
                                      <option key={step} value={step}>
                                        {FULFILMENT_LABELS[step]}
                                      </option>
                                    ))}
                                  </select>
                                  {!isCollection && (
                                    <div className="flex flex-wrap gap-1">
                                      <input
                                        value={draft.courier}
                                        placeholder="Courier"
                                        onChange={(e) =>
                                          setTrackingDrafts((prev) => ({ ...prev, [o.id]: { ...draft, courier: e.target.value } }))
                                        }
                                        className={`${INPUT} flex-1 basis-20`}
                                      />
                                      <input
                                        value={draft.tracking_number}
                                        placeholder="Tracking #"
                                        onChange={(e) =>
                                          setTrackingDrafts((prev) => ({
                                            ...prev,
                                            [o.id]: { ...draft, tracking_number: e.target.value },
                                          }))
                                        }
                                        className={`${INPUT} flex-1 basis-24`}
                                      />
                                      {trackingDrafts[o.id] && (
                                        <button
                                          type="button"
                                          disabled={saving}
                                          onClick={() =>
                                            updateFulfilment(o.id, {
                                              courier: draft.courier,
                                              tracking_number: draft.tracking_number,
                                            })
                                          }
                                          className="px-2 py-1 bg-purple-600 rounded font-semibold disabled:opacity-50"
                                        >
                                          Save
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  {!isCollection && (current === "unfulfilled" || current === "packed") && (
                                    <div className="text-gray-500">
                                      Add courier &amp; tracking, then choose Out for delivery: the customer is emailed then.
                                    </div>
                                  )}
                                  {o.dispatched_at && (
                                    <div className="text-gray-500">
                                      {isCollection ? "Ready" : "Sent"} {new Date(o.dispatched_at).toLocaleString()}
                                    </div>
                                  )}
                                  {o.delivered_at && (
                                    <div className="text-green-500">
                                      {isCollection ? "Collected" : "Delivered"} {new Date(o.delivered_at).toLocaleString()}
                                    </div>
                                  )}
                                  {renderEmailBlock(o, "confirmation", "Confirmation email")}
                                  {(DISPATCHED_STEPS.includes(current) || o.dispatch_email_sent_at) &&
                                    renderEmailBlock(o, "dispatch", isCollection ? "Ready for collection email" : "On its way email")}
                                </div>
                              );
                            })()
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-bold">Transactions ({data.transactions.length})</h2>
              <div className={T.wrap}>
                <table className={T.table}>
                  <thead className={T.thead}>
                    <tr>
                      <th className={T.th}>Checkout / Payment ID</th>
                      <th className={T.th}>Status</th>
                      <th className={`${T.th} md:text-right`}>Amount</th>
                      <th className={T.th}>Method</th>
                      <th className={T.th}>Mode</th>
                      <th className={T.th}>Paid / Failed</th>
                    </tr>
                  </thead>
                  <tbody className={T.tbody}>
                    {data.transactions.map((t) => (
                      <tr key={t.id} className={T.tr}>
                        <td data-label="Checkout / Payment ID" className={`${T.td} font-mono text-xs break-all`}>
                          <div>{t.provider_checkout_id || "—"}</div>
                          <div className="text-gray-500">{t.provider_payment_id || "—"}</div>
                        </td>
                        <td data-label="Status" className={T.td}>{t.provider_status || "—"}</td>
                        <td data-label="Amount" className={`${T.td} md:text-right`}>{formatZarFromCents(t.amount_cents)}</td>
                        <td data-label="Method" className={T.td}>
                          {t.payment_method_brand
                            ? `${t.payment_method_brand}${t.payment_method_last4 ? ` ···${t.payment_method_last4}` : ""}`
                            : t.payment_method_type || "—"}
                        </td>
                        <td data-label="Mode" className={T.td}>{t.processing_mode || "—"}</td>
                        <td data-label="Paid / Failed" className={`${T.td} text-xs text-gray-400`}>
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
