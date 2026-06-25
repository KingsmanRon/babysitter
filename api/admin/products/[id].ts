import type { VercelRequest, VercelResponse } from "@vercel/node";
import { log } from "../../../lib/logger.js";
import { supabaseAdmin } from "../../../lib/supabaseAdmin.js";

const SALE_FIELDS = [
  "compare_at_price_cents",
  "sale_price_cents",
  "discount_percent_bps",
  "sale_starts_at",
  "sale_ends_at",
] as const;

type SaleField = (typeof SALE_FIELDS)[number];
type SaleUpdate = Partial<Record<SaleField, number | string | null>>;

function unauthorized(res: VercelResponse) {
  return res.status(401).json({ error: "Unauthorized" });
}

function parseProductId(req: VercelRequest): string | null {
  const raw = req.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function validateDateOrNull(value: unknown, field: SaleField): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`${field} must be an ISO date string or null`);
  }
  if (!value.trim()) return null;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new Error(`${field} must be a valid date string or null`);
  }
  return value;
}

function validateBody(body: unknown): SaleUpdate {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be an object");
  }

  const update: SaleUpdate = {};
  for (const [key, value] of Object.entries(body)) {
    if (!SALE_FIELDS.includes(key as SaleField)) {
      throw new Error(`Unsupported field: ${key}`);
    }

    if (key === "sale_starts_at" || key === "sale_ends_at") {
      update[key] = validateDateOrNull(value, key);
      continue;
    }

    if (value === null) {
      update[key as SaleField] = null;
      continue;
    }

    if (!isNonNegativeInteger(value)) {
      throw new Error(`${key} must be a non-negative integer or null`);
    }
    if (key === "discount_percent_bps" && value > 10000) {
      throw new Error("discount_percent_bps must be between 0 and 10000");
    }
    update[key as SaleField] = value;
  }

  if (Object.keys(update).length === 0) {
    throw new Error("At least one sale field is required");
  }

  return update;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const token = process.env.ADMIN_TOKEN?.trim();
  if (!token) {
    return res.status(503).json({ error: "ADMIN_TOKEN not configured" });
  }
  const rawProvided = (req.headers["x-admin-token"] || req.query.token || "") as string | string[];
  const provided = (Array.isArray(rawProvided) ? rawProvided[0] ?? "" : rawProvided).trim();
  if (provided !== token) return unauthorized(res);

  const id = parseProductId(req);
  if (!id) return res.status(400).json({ error: "Product id is required" });

  let update: SaleUpdate;
  try {
    update = validateBody(req.body);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }

  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("products")
      .update(update)
      .eq("id", id)
      .select(
        "id, slug, name, stock_count, price_cents, currency, is_active, compare_at_price_cents, sale_price_cents, discount_percent_bps, sale_starts_at, sale_ends_at",
      )
      .single();

    if (error) {
      log.error("api.admin.products.update.error", { err: error.message, productId: id });
      return res.status(500).json({ error: "Failed to update product" });
    }

    return res.status(200).json({ product: data });
  } catch (err) {
    log.error("api.admin.products.update.error", { err: (err as Error).message, productId: id });
    return res.status(500).json({ error: "Failed to update product" });
  }
}
