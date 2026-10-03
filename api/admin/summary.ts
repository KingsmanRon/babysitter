import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../../lib/supabaseAdmin.js";
import { log } from "../../lib/logger.js";
import { findSupersedingOrder, normaliseSaPhone, type CustomerOrder } from "../../lib/nudge.js";
import { CUSTOMER_COLUMNS } from "../../lib/supersede.js";
import { emailSendingConfigured } from "../../lib/confirmationEmail.js";

// Admin filter name -> order statuses it covers.
const STATUS_FILTERS: Record<string, string[]> = {
  paid: ["paid"],
  pending: ["draft", "pending_payment"],
  failed: ["payment_failed"],
  expired: ["expired"],
  cancelled: ["cancelled"],
  refunded: ["refunded"],
};

// Fulfilment filter name -> fulfilment steps (paid orders only).
const FULFILMENT_FILTERS: Record<string, string[]> = {
  to_fulfil: ["unfulfilled", "packed"],
  dispatched: ["out_for_delivery", "ready_for_collection"],
  done: ["delivered", "collected"],
};

function unauthorized(res: VercelResponse) {
  return res.status(401).json({ error: "Unauthorized" });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const token = process.env.ADMIN_TOKEN?.trim();
  if (!token) {
    return res.status(503).json({ error: "ADMIN_TOKEN not configured" });
  }
  const rawProvided = (req.headers["x-admin-token"] || req.query.token || "") as string | string[];
  const provided = (Array.isArray(rawProvided) ? rawProvided[0] ?? "" : rawProvided).trim();
  if (provided !== token) return unauthorized(res);

  try {
    const db = supabaseAdmin();
    // Read from the URL rather than req.query, which goes through Node's
    // deprecated url.parse() inside Vercel's helpers.
    const params = new URL(req.url ?? "/", "http://localhost").searchParams;
    const fulfilmentSteps = FULFILMENT_FILTERS[params.get("fulfilment") ?? ""];
    // Only paid orders get fulfilled, so a fulfilment filter implies "paid".
    const statuses = fulfilmentSteps ? ["paid"] : STATUS_FILTERS[params.get("status") ?? ""];

    let ordersQuery = db
      .from("orders")
      .select(
        "id, order_number, status, amount_cents, currency, customer_email, customer_name, fulfilment_method, delivery_fee_cents, ship_phone, ship_line1, ship_line2, ship_suburb, ship_city, ship_province, ship_postal_code, metadata, fulfilment_status, courier, tracking_number, dispatched_at, delivered_at, nudge_count, last_nudged_at, superseded_by, cancel_reason, confirmation_email_sent_at, confirmation_email_error, confirmation_email_manual_at, dispatch_email_sent_at, dispatch_email_error, dispatch_email_manual_at, created_at, updated_at",
      );
    if (statuses) ordersQuery = ordersQuery.in("status", statuses);
    if (fulfilmentSteps) ordersQuery = ordersQuery.in("fulfilment_status", fulfilmentSteps);
    const { data: rawOrders } = await ordersQuery.order("created_at", { ascending: false }).limit(100);

    // For orders waiting on payment, say whether a WhatsApp reminder can go
    // out: the phone must be an SA mobile, and the customer mustn't already
    // have paid on a later order.
    const pending = (rawOrders || []).filter((o) => o.status === "pending_payment");
    let paidOrders: CustomerOrder[] = [];
    if (pending.length) {
      const oldest = pending.reduce((min, o) => (o.created_at < min ? o.created_at : min), pending[0].created_at);
      const { data } = await db
        .from("orders")
        .select(CUSTOMER_COLUMNS)
        .eq("status", "paid")
        .gt("created_at", oldest)
        .limit(1000);
      paidOrders = (data || []) as CustomerOrder[];
    }
    const orders = (rawOrders || []).map((o) =>
      o.status === "pending_payment"
        ? {
            ...o,
            nudge_phone_valid: normaliseSaPhone(o.ship_phone) !== null,
            superseded_by_order:
              o.superseded_by ?? findSupersedingOrder(o as CustomerOrder, paidOrders)?.order_number ?? null,
          }
        : o,
    );

    const orderIds = orders.map((o) => o.id);

    // What each order is for: product, size and quantity per line.
    const { data: items } = orderIds.length
      ? await db.from("order_items").select("order_id, product_name, size, quantity").in("order_id", orderIds)
      : { data: [] };
    const itemsByOrder = new Map<string, Array<{ product_name: string; size: string | null; quantity: number }>>();
    for (const item of items || []) {
      const list = itemsByOrder.get(item.order_id) ?? [];
      list.push({ product_name: item.product_name, size: item.size, quantity: item.quantity });
      itemsByOrder.set(item.order_id, list);
    }
    const { data: txs } = orderIds.length
      ? await db
          .from("payment_transactions")
          .select(
            "id, order_id, provider_checkout_id, provider_payment_id, provider_status, amount_cents, currency, processing_mode, payment_method_type, payment_method_brand, payment_method_last4, paid_at, failed_at, created_at",
          )
          .in("order_id", orderIds)
          .order("created_at", { ascending: false })
      : { data: [] };

    const { data: products } = await db
      .from("products")
      .select("id, slug, name, stock_count, size_stock, price_cents, currency, is_active, compare_at_price_cents, sale_price_cents, discount_percent_bps, sale_starts_at, sale_ends_at")
      .order("created_at", { ascending: true });

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      orders: orders.map((o) => ({ ...o, items: itemsByOrder.get(o.id) ?? [] })),
      transactions: txs || [],
      products: products || [],
      emailConfigured: emailSendingConfigured(),
    });
  } catch (err) {
    log.error("api.admin.summary.error", { err: (err as Error).message });
    return res.status(500).json({ error: "Failed to load summary" });
  }
}
