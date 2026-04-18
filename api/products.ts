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
    const { data, error } = await db
      .from("products")
      .select(
        "id, slug, name, description, price_cents, currency, image_url, images, sizes, stock_count, is_active",
      )
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    if (error) throw error;
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ products: data || [] });
  } catch (err) {
    log.error("api.products.error", { err: (err as Error).message });
    return res.status(500).json({ error: "Failed to load products" });
  }
}
