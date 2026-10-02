import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { log } from "../lib/logger.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const db = supabaseAdmin();
    // Put abandoned checkout holds back on sale before showing stock.
    const { error: releaseErr } = await db.rpc("release_expired_reservations");
    if (releaseErr) log.warn("api.products.release_expired_failed", { err: releaseErr.message });

    const { data, error } = await db
      .from("products")
      .select(
        "id, slug, name, description, price_cents, delivery_fee_cents, compare_at_price_cents, sale_price_cents, discount_percent_bps, sale_starts_at, sale_ends_at, currency, image_url, images, sizes, stock_count, size_stock, is_active",
      )
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    if (error) throw error;
    // Let Vercel's CDN absorb traffic spikes: one function call per region
    // every ~10s instead of one per visitor. Browsers always revalidate, and
    // live stock counts arrive over Supabase Realtime regardless.
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=10, stale-while-revalidate=30");
    return res.status(200).json({ products: data || [] });
  } catch (err) {
    log.error("api.products.error", { err: (err as Error).message });
    res.setHeader("Cache-Control", "no-store");
    return res.status(500).json({ error: "Failed to load products" });
  }
}
