import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../../../lib/supabaseAdmin.js";
import { log } from "../../../lib/logger.js";

function unauthorized(res: VercelResponse) {
  return res.status(401).json({ error: "Unauthorized" });
}

type SaleUpdateBody = {
  sale_enabled?: unknown;
  saleEnabled?: unknown;
  discount_percent?: unknown;
  discountPercent?: unknown;
  sale_starts_at?: unknown;
  saleStartsAt?: unknown;
  sale_ends_at?: unknown;
  saleEndsAt?: unknown;
};

function asOptionalTimestamp(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const time = Date.parse(value);
  if (Number.isNaN(time)) throw new Error(`${field} must be a valid date`);
  return new Date(time).toISOString();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    return res.status(503).json({ error: "ADMIN_TOKEN not configured" });
  }
  const provided = (req.headers["x-admin-token"] || req.query.token || "") as string;
  if (provided !== token) return unauthorized(res);

  const id = req.query.id;
  if (typeof id !== "string" || !id) {
    return res.status(400).json({ error: "Product id is required" });
  }

  try {
    const body = req.body as SaleUpdateBody;
    const saleEnabled = body.sale_enabled ?? body.saleEnabled;
    if (typeof saleEnabled !== "boolean") {
      return res.status(400).json({ error: "sale_enabled must be a boolean" });
    }

    const db = supabaseAdmin();

    if (!saleEnabled) {
      const { data: product, error } = await db
        .from("products")
        .update({
          compare_at_price_cents: null,
          discount_percent_bps: null,
          sale_price_cents: null,
          sale_starts_at: null,
          sale_ends_at: null,
        })
        .eq("id", id)
        .select(
          "id, slug, name, stock_count, price_cents, currency, is_active, compare_at_price_cents, discount_percent_bps, sale_price_cents, sale_starts_at, sale_ends_at",
        )
        .single();
      if (error) throw error;
      return res.status(200).json({ product });
    }

    const discountPercentInput = body.discount_percent ?? body.discountPercent;
    const discountPercent =
      typeof discountPercentInput === "number"
        ? discountPercentInput
        : typeof discountPercentInput === "string" && discountPercentInput.trim() !== ""
          ? Number(discountPercentInput)
          : Number.NaN;

    if (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent >= 100) {
      return res.status(400).json({ error: "discount_percent must be a number greater than 0 and less than 100" });
    }

    const saleStartsAt = asOptionalTimestamp(body.sale_starts_at ?? body.saleStartsAt, "sale_starts_at");
    const saleEndsAt = asOptionalTimestamp(body.sale_ends_at ?? body.saleEndsAt, "sale_ends_at");
    if (saleStartsAt && saleEndsAt && Date.parse(saleStartsAt) > Date.parse(saleEndsAt)) {
      return res.status(400).json({ error: "sale_starts_at must be before sale_ends_at" });
    }

    const { data: current, error: fetchError } = await db
      .from("products")
      .select("price_cents")
      .eq("id", id)
      .single();
    if (fetchError) throw fetchError;

    const priceCents = current.price_cents as number;
    const discountPercentBps = Math.round(discountPercent * 100);
    const salePriceCents = Math.round((priceCents * (10000 - discountPercentBps)) / 10000);

    const { data: product, error: updateError } = await db
      .from("products")
      .update({
        compare_at_price_cents: priceCents,
        discount_percent_bps: discountPercentBps,
        sale_price_cents: salePriceCents,
        sale_starts_at: saleStartsAt,
        sale_ends_at: saleEndsAt,
      })
      .eq("id", id)
      .select(
        "id, slug, name, stock_count, price_cents, currency, is_active, compare_at_price_cents, discount_percent_bps, sale_price_cents, sale_starts_at, sale_ends_at",
      )
      .single();
    if (updateError) throw updateError;

    return res.status(200).json({ product });
  } catch (err) {
    log.error("api.admin.products.update.error", { err: (err as Error).message, productId: id });
    return res.status(500).json({ error: "Failed to update product" });
  }
}
