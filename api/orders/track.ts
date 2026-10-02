import type { VercelRequest, VercelResponse } from "@vercel/node";
import { log } from "../../lib/logger.js";
import { supabaseAdmin } from "../../lib/supabaseAdmin.js";
import {
  buildTrackingView,
  contactMatches,
  normaliseOrderNumber,
  TRACKING_ORDER_COLUMNS,
  type TrackingItem,
  type TrackingOrderRow,
} from "../../lib/tracking.js";

const NOT_FOUND = "We couldn't find an order with those details. Check the order number and use the email or phone number you ordered with.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Customer order tracking.
//   POST { orderNumber, contact }  — order number plus the email or phone used
//                                    to order (the /track form).
//   GET  ?id=<order uuid>          — the private link from the payment pages.
// Wrong details and unknown orders get the same 404, so the endpoint can't be
// used to find out which order numbers exist.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  const db = supabaseAdmin();

  try {
    let order: TrackingOrderRow | null = null;

    if (req.method === "POST") {
      const body = (req.body ?? {}) as { orderNumber?: unknown; contact?: unknown };
      const orderNumber = normaliseOrderNumber(typeof body.orderNumber === "string" ? body.orderNumber : null);
      const contact = typeof body.contact === "string" ? body.contact : "";
      if (!orderNumber || !contact.trim()) {
        return res.status(400).json({ error: "Enter your order number and the email or phone number you ordered with." });
      }
      const { data, error } = await db
        .from("orders")
        .select(TRACKING_ORDER_COLUMNS)
        .eq("order_number", orderNumber)
        .maybeSingle();
      if (error) throw error;
      if (!data || !contactMatches(data as TrackingOrderRow, contact)) {
        return res.status(404).json({ error: NOT_FOUND });
      }
      order = data as TrackingOrderRow;
    } else if (req.method === "GET") {
      const id = new URL(req.url ?? "/", "http://localhost").searchParams.get("id") ?? "";
      if (!UUID.test(id)) return res.status(404).json({ error: NOT_FOUND });
      const { data, error } = await db.from("orders").select(TRACKING_ORDER_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: NOT_FOUND });
      order = data as TrackingOrderRow;
    } else {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const [{ data: items }, { data: paidTx }] = await Promise.all([
      db.from("order_items").select("product_name, size, quantity").eq("order_id", order.id),
      db
        .from("payment_transactions")
        .select("paid_at")
        .eq("order_id", order.id)
        .not("paid_at", "is", null)
        .order("paid_at", { ascending: true })
        .limit(1),
    ]);

    const view = buildTrackingView(
      order,
      ((items || []) as TrackingItem[]).map(({ product_name, size, quantity }) => ({ product_name, size, quantity })),
      (paidTx?.[0] as { paid_at: string } | undefined)?.paid_at ?? null,
    );
    return res.status(200).json({ order: view });
  } catch (err) {
    log.error("api.orders.track.error", { err: (err as Error).message });
    return res.status(500).json({ error: "Couldn't load your order right now. Please try again." });
  }
}
