import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../../lib/supabaseAdmin.js";
import { log } from "../../lib/logger.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const idParam = req.query.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!id) return res.status(400).json({ error: "id is required" });

  try {
    const db = supabaseAdmin();
    const { data: order, error } = await db
      .from("orders")
      .select("id, order_number, status, amount_cents, currency, created_at, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!order) return res.status(404).json({ error: "Order not found" });

    const { data: items } = await db
      .from("order_items")
      .select("product_name, size, quantity, unit_price_cents")
      .eq("order_id", id);

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ order, items: items || [] });
  } catch (err) {
    log.error("api.orders.read.error", { err: (err as Error).message });
    return res.status(500).json({ error: "Failed to load order" });
  }
}
