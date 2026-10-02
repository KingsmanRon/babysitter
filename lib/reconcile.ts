import { log } from "./logger.js";
import { supabaseAdmin } from "./supabaseAdmin.js";
import { recordPaymentSucceeded } from "./yoco.js";
import { getYocoCheckout, YocoApiError, type YocoCheckout } from "./yocoApi.js";

// Webhooks are not the only source of truth: this asks Yoco directly about
// checkouts that are still open on our side, so a missed or rejected webhook
// can't leave a paid order pending, and abandoned or declined checkouts stop
// sitting at "pending_payment" forever.

// Give the webhook a head start before asking Yoco ourselves.
export const RECONCILE_MIN_AGE_MINUTES = 2;
// An order whose checkout hasn't completed this long after it was created is
// expired (order and transaction "expired"; needs migration 0007).
// That is twice the 30-minute stock hold, so the units are already back on
// sale by then; a buyer who still pays later is caught by the webhook (or the
// next pass), which moves the order to paid.
export const PENDING_EXPIRY_MINUTES = 60;
export const EXPIRED_ORDER_STATUS = "expired";
// Ask Yoco about the same checkout at most this often (status page polls).
// Kept in memory per server instance, so it needs no database column.
export const RECONCILE_THROTTLE_SECONDS = 30;
const lastChecked = new Map<string, number>();

export function resetReconcileThrottleForTests(): void {
  lastChecked.clear();
}

const OPEN_ORDER_STATUSES = ["pending_payment", "payment_failed"];
const PAID_CHECKOUT_STATUSES = new Set(["completed", "succeeded", "successful", "paid"]);
const DEAD_CHECKOUT_STATUSES = new Set(["expired", "cancelled", "canceled", "failed", "abandoned"]);
// Yoco is mid-authorisation; never expire underneath it.
const BUSY_CHECKOUT_STATUSES = new Set(["processing"]);

export type ReconcileOutcome = "paid" | "expired" | "open" | "skipped" | "error";

export type ReconcileOptions = {
  now?: Date;
  dryRun?: boolean;
  // Skip the per-checkout throttle (the scheduled sweep).
  ignoreThrottle?: boolean;
};

type OrderRow = {
  id: string;
  status: string;
  created_at: string;
  stock_state?: string | null;
  reservation_expires_at?: string | null;
};
type CheckoutTx = {
  id: string;
  provider_checkout_id: string | null;
  provider_status: string | null;
  paid_at: string | null;
  created_at: string;
};

const minutes = (n: number) => n * 60_000;

async function latestCheckout(orderId: string): Promise<CheckoutTx | null> {
  const { data, error } = await supabaseAdmin()
    .from("payment_transactions")
    .select("id, provider_checkout_id, provider_status, paid_at, created_at")
    .eq("order_id", orderId)
    .eq("provider", "yoco");
  if (error) throw new Error(`payment_transactions lookup failed: ${error.message}`);
  const rows = ((data || []) as CheckoutTx[]).filter((row) => row.provider_checkout_id);
  rows.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return rows[0] ?? null;
}

async function expireOrder(
  order: OrderRow,
  tx: CheckoutTx | null,
  reason: string,
  now: Date,
  dryRun: boolean,
): Promise<ReconcileOutcome> {
  if (dryRun) {
    log.info("yoco.reconcile.would_expire", { orderId: order.id, checkoutId: tx?.provider_checkout_id, reason });
    return "expired";
  }
  const db = supabaseAdmin();
  // Atomic: if a webhook marked the order paid meanwhile, leave it alone.
  const { data: expired, error } = await db
    .from("orders")
    .update({ status: EXPIRED_ORDER_STATUS })
    .eq("id", order.id)
    .in("status", OPEN_ORDER_STATUSES)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`order expiry failed: ${error.message}`);
  if (!expired) return "skipped";

  // Keep a recorded decline as "failed"; otherwise the checkout just lapsed.
  if (tx && !tx.paid_at && tx.provider_status !== "failed") {
    await db
      .from("payment_transactions")
      .update({ provider_status: "expired", failed_at: now.toISOString() })
      .eq("id", tx.id)
      .is("paid_at", null);
  }

  // Put any still-held units back on sale now rather than at the next sweep.
  const { error: releaseErr } = await db.rpc("release_order_stock", { p_order_id: order.id });
  if (releaseErr) log.warn("yoco.reconcile.release_failed", { orderId: order.id, err: releaseErr.message });

  log.info("yoco.reconcile.expired", { orderId: order.id, checkoutId: tx?.provider_checkout_id, reason });
  return "expired";
}

export async function reconcileOrder(orderId: string, opts: ReconcileOptions = {}): Promise<ReconcileOutcome> {
  const now = opts.now ?? new Date();
  const dryRun = opts.dryRun ?? false;
  const db = supabaseAdmin();

  const { data: order, error: orderErr } = await db
    .from("orders")
    .select("id, status, created_at, stock_state, reservation_expires_at")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr) throw new Error(`order lookup failed: ${orderErr.message}`);
  if (!order || !OPEN_ORDER_STATUSES.includes(order.status)) return "skipped";

  const tx = await latestCheckout(orderId);
  const startedAt = Date.parse(tx?.created_at ?? order.created_at);
  const ageMs = now.getTime() - startedAt;
  if (ageMs < minutes(RECONCILE_MIN_AGE_MINUTES)) return "skipped";
  // Clicking Pay again reuses the same Yoco checkout but restarts the stock
  // hold, so a buyer can be back on the payment page long after the checkout
  // was created. Never time an order out while its stock hold is running.
  const holdActive =
    order.stock_state === "reserved" &&
    !!order.reservation_expires_at &&
    Date.parse(order.reservation_expires_at) > now.getTime();
  const pastExpiry = ageMs >= minutes(PENDING_EXPIRY_MINUTES) && !holdActive;

  if (!tx?.provider_checkout_id) {
    return pastExpiry ? expireOrder(order, tx, "no_checkout", now, dryRun) : "open";
  }
  const last = lastChecked.get(tx.id);
  if (!opts.ignoreThrottle && last !== undefined && now.getTime() - last < RECONCILE_THROTTLE_SECONDS * 1000) {
    return "skipped";
  }
  lastChecked.set(tx.id, now.getTime());
  if (lastChecked.size > 5000) lastChecked.clear();

  let checkoutStatus: string;
  let checkout: YocoCheckout;
  try {
    checkout = await getYocoCheckout(tx.provider_checkout_id);
    checkoutStatus = String(checkout.status ?? "").toLowerCase();
  } catch (err) {
    if (err instanceof YocoApiError && err.status === 404 && pastExpiry) {
      return expireOrder(order, tx, "checkout_not_found", now, dryRun);
    }
    log.error("yoco.reconcile.checkout_lookup_failed", {
      orderId,
      checkoutId: tx.provider_checkout_id,
      status: err instanceof YocoApiError ? err.status : null,
      err: (err as Error).message,
    });
    return "error";
  }

  if (PAID_CHECKOUT_STATUSES.has(checkoutStatus)) {
    if (dryRun) {
      log.info("yoco.reconcile.would_mark_paid", { orderId, checkoutId: tx.provider_checkout_id });
      return "paid";
    }
    await recordPaymentSucceeded({
      orderId,
      checkoutId: tx.provider_checkout_id,
      paymentId: typeof checkout.paymentId === "string" ? checkout.paymentId : null,
      eventId: null,
      amountCents: typeof checkout.amount === "number" ? checkout.amount : null,
      currency: typeof checkout.currency === "string" ? checkout.currency : null,
      mode: typeof checkout.processingMode === "string" ? checkout.processingMode : null,
      method: null,
      paidAt: now.toISOString(),
      raw: { reconciledAt: now.toISOString(), reconciledCheckoutStatus: checkoutStatus },
      source: "reconcile",
    });
    return "paid";
  }
  if (DEAD_CHECKOUT_STATUSES.has(checkoutStatus)) {
    return expireOrder(order, tx, `checkout_${checkoutStatus}`, now, dryRun);
  }
  if (pastExpiry && !BUSY_CHECKOUT_STATUSES.has(checkoutStatus)) {
    return expireOrder(order, tx, `stale_${checkoutStatus || "unknown"}`, now, dryRun);
  }
  return "open";
}

export type ReconcileSummary = {
  dryRun: boolean;
  checked: number;
  outcomes: Record<ReconcileOutcome, number>;
  orders: Array<{ orderId: string; outcome: ReconcileOutcome }>;
};

// Sweeps every order still waiting on payment. Bounded per run so it fits the
// function timeout; a backlog drains over successive runs, oldest first.
export async function reconcilePendingOrders(
  opts: ReconcileOptions & { limit?: number; concurrency?: number } = {},
): Promise<ReconcileSummary> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 30;
  const concurrency = opts.concurrency ?? 5;
  const cutoff = new Date(now.getTime() - minutes(RECONCILE_MIN_AGE_MINUTES)).toISOString();

  const { data, error } = await supabaseAdmin()
    .from("orders")
    .select("id")
    .in("status", OPEN_ORDER_STATUSES)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`pending orders lookup failed: ${error.message}`);

  const summary: ReconcileSummary = {
    dryRun: opts.dryRun ?? false,
    checked: 0,
    outcomes: { paid: 0, expired: 0, open: 0, skipped: 0, error: 0 },
    orders: [],
  };
  const ids = (data || []).map((row: { id: string }) => row.id);
  for (let i = 0; i < ids.length; i += concurrency) {
    const batch = ids.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (orderId) => {
        try {
          return await reconcileOrder(orderId, { now, dryRun: opts.dryRun, ignoreThrottle: true });
        } catch (err) {
          log.error("yoco.reconcile.order_failed", { orderId, err: (err as Error).message });
          return "error" as const;
        }
      }),
    );
    batch.forEach((orderId, j) => {
      summary.checked += 1;
      summary.outcomes[results[j]] += 1;
      summary.orders.push({ orderId, outcome: results[j] });
    });
  }
  log.info("yoco.reconcile.sweep", { dryRun: summary.dryRun, checked: summary.checked, ...summary.outcomes });
  return summary;
}
