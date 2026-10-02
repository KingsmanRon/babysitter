import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, Copy, Loader2, Package } from "lucide-react";
import { formatZarFromCents, trackOrder, trackOrderById, type TrackingView } from "../lib/api";

// /track          — customer enters order number + email/phone.
// /track/:orderId — private link from the payment pages; no form needed.
export default function Track() {
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [orderNumber, setOrderNumber] = useState(searchParams.get("order") ?? "");
  const [contact, setContact] = useState("");
  const [view, setView] = useState<TrackingView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    setLoading(true);
    trackOrderById(orderId)
      .then((v) => !cancelled && setView(v))
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setView(await trackOrder(orderNumber, contact));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setView(null);
    setError(null);
    if (orderId) navigate("/track");
  };

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-[#f4f1ea]">
      <header className="px-4 sm:px-8 py-5 border-b border-[#f4f1ea]/15">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link to="/" className="font-extrabold text-lg tracking-[3px] uppercase hover:opacity-80 transition-opacity">
            BABYSITTER<span className="align-super text-[0.7em] tracking-normal -ml-0.5">™</span>
          </Link>
          <Link
            to="/help"
            className="font-jbmono text-[11px] sm:text-xs uppercase tracking-[0.2em] text-[#f4f1ea]/60 hover:text-[#f4f1ea] transition-colors"
          >
            Help desk
          </Link>
        </div>
      </header>

      <main className="px-4 sm:px-8 py-12 sm:py-16">
        <div className="max-w-3xl mx-auto space-y-8">
          <div>
            <p className="font-jbmono text-xs uppercase tracking-[0.25em] text-[#ff3b1f]">Order tracking</p>
            <h1 className="mt-2 font-anton uppercase text-5xl sm:text-7xl leading-[0.9]">Where's my order?</h1>
          </div>

          {loading && !view && (
            <div className="flex items-center gap-3 text-[#f4f1ea]/70 font-archivo" role="status">
              <Loader2 className="w-5 h-5 animate-spin" /> Looking up your order…
            </div>
          )}

          {!view && !orderId && (
            <form onSubmit={submit} className="space-y-4 border border-[#f4f1ea]/20 p-5 sm:p-8">
              <label className="block space-y-2">
                <span className="font-jbmono text-xs uppercase tracking-[0.2em] text-[#f4f1ea]/60">Order number</span>
                <input
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="BS-6V8H4G52"
                  autoCapitalize="characters"
                  autoComplete="off"
                  required
                  className="w-full px-4 py-3 bg-transparent border border-[#f4f1ea]/30 font-jbmono uppercase text-lg focus:outline-none focus:border-[#ff3b1f]"
                />
              </label>
              <label className="block space-y-2">
                <span className="font-jbmono text-xs uppercase tracking-[0.2em] text-[#f4f1ea]/60">
                  Email or phone you ordered with
                </span>
                <input
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="you@example.com or 065 872 5011"
                  autoComplete="email"
                  required
                  className="w-full px-4 py-3 bg-transparent border border-[#f4f1ea]/30 font-archivo text-lg focus:outline-none focus:border-[#ff3b1f]"
                />
              </label>
              <p className="font-archivo text-sm text-[#f4f1ea]/50">
                Your order number starts with BS- and is on your payment confirmation.
              </p>
              {error && (
                <p role="alert" className="font-archivo text-sm text-[#ff3b1f]">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#ff3b1f] text-[#0b0b0b] font-archivo font-bold uppercase tracking-wider text-sm hover:bg-[#f4f1ea] transition-colors disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f4f1ea] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b0b]"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                Track order
              </button>
            </form>
          )}

          {!view && orderId && error && (
            <div className="space-y-4">
              <p role="alert" className="font-archivo text-[#ff3b1f]">
                {error}
              </p>
              <button type="button" onClick={reset} className="font-jbmono text-xs uppercase tracking-[0.2em] underline">
                Look up by order number instead
              </button>
            </div>
          )}

          {view && <OrderStatus view={view} onReset={reset} />}
        </div>
      </main>
    </div>
  );
}

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function OrderStatus({ view, onReset }: { view: TrackingView; onReset: () => void }) {
  const [copied, setCopied] = useState(false);
  const inactive = ["cancelled", "superseded", "refunded"].includes(view.stage);
  const awaitingPayment = !!view.payOrderId;

  const copyTracking = async () => {
    if (!view.trackingNumber) return;
    try {
      await navigator.clipboard.writeText(view.trackingNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="space-y-6">
      <section className="border border-[#f4f1ea]/20 p-5 sm:p-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-jbmono text-sm text-[#f4f1ea]/60">{view.orderNumber}</p>
            <h2 className={`mt-1 font-anton uppercase text-4xl sm:text-5xl leading-none ${inactive ? "text-[#f4f1ea]/60" : ""}`}>
              {view.headline}
            </h2>
            {view.detail && <p className="mt-3 font-archivo text-[#f4f1ea]/70 max-w-lg">{view.detail}</p>}
          </div>
          <Package className="w-10 h-10 text-[#ff3b1f] shrink-0" aria-hidden />
        </div>

        {awaitingPayment && (
          <Link
            to={`/pay/${view.payOrderId}`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#ff3b1f] text-[#0b0b0b] font-archivo font-bold uppercase tracking-wider text-sm hover:bg-[#f4f1ea] transition-colors"
          >
            Complete payment <ArrowRight className="w-4 h-4" />
          </Link>
        )}

        {!inactive && (
          <ol className="space-y-0" aria-label="Order progress">
            {view.steps.map((step, i) => {
              const last = i === view.steps.length - 1;
              return (
                <li key={step.key} className="relative flex gap-4 pb-6 last:pb-0">
                  {!last && (
                    <span
                      aria-hidden
                      className={`absolute left-[11px] top-6 bottom-0 w-px ${step.done && view.steps[i + 1].done ? "bg-[#ff3b1f]" : "bg-[#f4f1ea]/20"}`}
                    />
                  )}
                  <span
                    aria-hidden
                    className={`relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                      step.done ? "bg-[#ff3b1f] border-[#ff3b1f] text-[#0b0b0b]" : "border-[#f4f1ea]/30"
                    }`}
                  >
                    {step.done && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                  </span>
                  <div>
                    <p className={`font-archivo font-bold ${step.done ? "" : "text-[#f4f1ea]/40"}`}>
                      {step.label}
                      <span className="sr-only">{step.done ? " (done)" : " (not yet)"}</span>
                    </p>
                    {step.done && step.at && (
                      <p className="font-jbmono text-xs text-[#f4f1ea]/50">{formatWhen(step.at)}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {view.trackingNumber && (
          <div className="border-t border-[#f4f1ea]/15 pt-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-jbmono text-xs uppercase tracking-[0.2em] text-[#f4f1ea]/60">
                {view.courier ? `${view.courier} tracking number` : "Tracking number"}
              </p>
              <p className="font-jbmono text-lg break-all">{view.trackingNumber}</p>
            </div>
            <button
              type="button"
              onClick={copyTracking}
              className="inline-flex items-center gap-2 font-jbmono text-xs uppercase tracking-[0.2em] text-[#f4f1ea]/70 hover:text-[#f4f1ea]"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
      </section>

      <section className="border border-[#f4f1ea]/20 p-5 sm:p-8 space-y-4">
        <h3 className="font-jbmono text-xs uppercase tracking-[0.2em] text-[#f4f1ea]/60">Your order</h3>
        <ul className="space-y-2">
          {view.items.map((item, i) => (
            <li key={i} className="flex items-center gap-3 font-archivo">
              <span className="min-w-[2.5rem] px-2 py-0.5 border border-[#f4f1ea]/40 text-center font-jbmono text-sm font-bold">
                {item.size || "—"}
              </span>
              <span>
                {item.quantity} × {item.product_name}
              </span>
            </li>
          ))}
        </ul>
        <dl className="grid grid-cols-2 gap-4 pt-2 font-archivo text-sm">
          <div>
            <dt className="text-[#f4f1ea]/50">Total</dt>
            <dd className="font-bold">{formatZarFromCents(view.amountCents)}</dd>
          </div>
          <div>
            <dt className="text-[#f4f1ea]/50">{view.method === "collection" ? "Fulfilment" : "Delivering to"}</dt>
            <dd className="font-bold">{view.method === "collection" ? "Collection" : view.destination || "—"}</dd>
          </div>
          <div>
            <dt className="text-[#f4f1ea]/50">Ordered</dt>
            <dd className="font-bold">{formatWhen(view.placedAt)}</dd>
          </div>
        </dl>
      </section>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 font-jbmono text-xs uppercase tracking-[0.2em]">
        <button type="button" onClick={onReset} className="underline underline-offset-4 hover:text-[#ff3b1f]">
          Track another order
        </button>
        <Link to="/help" className="text-[#f4f1ea]/60 hover:text-[#f4f1ea]">
          Need help?
        </Link>
      </div>
    </div>
  );
}
