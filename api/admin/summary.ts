import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../../lib/supabaseAdmin.js";
import { log } from "../../lib/logger.js";

// Admin filter name -> order statuses it covers.
const STATUS_FILTERS: Record<string, string[]> = {
  paid: ["paid"],
  pending: ["draft", "pending_payment"],
  failed: ["payment_failed"],
  cancelled: ["cancelled"],
  refunded: ["refunded"],
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
    const statusParam = new URL(req.url ?? "/", "http://localhost").searchParams.get("status") ?? "";
    const statuses = STATUS_FILTERS[statusParam];

    let ordersQuery = db
      .from("orders")
      .select(
        "id, order_number, status, amount_cents, currency, customer_email, customer_name, fulfilment_method, delivery_fee_cents, ship_phone, ship_line1, ship_line2, ship_suburb, ship_city, ship_province, ship_postal_code, metadata, created_at, updated_at",
      );
    if (statuses) ordersQuery = ordersQuery.in("status", statuses);
    const { data: orders } = await ordersQuery.order("created_at", { ascending: false }).limit(100);

    const orderIds = (orders || []).map((o) => o.id);
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
      orders: orders || [],
      transactions: txs || [],
      products: products || [],
    });
  } catch (err) {
    log.error("api.admin.summary.error", { err: (err as Error).message });
    return res.status(500).json({ error: "Failed to load summary" });
  }
}
