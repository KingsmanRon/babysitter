import type { VercelRequest, VercelResponse } from "@vercel/node";
import { log } from "../../../lib/logger.js";
import { supabaseAdmin } from "../../../lib/supabaseAdmin.js";
import { planStockUpdate, StockConflictError, validateStockEdit, type StockEdit } from "../../../lib/adminStock.js";

const PRODUCT_COLUMNS =
  "id, slug, name, stock_count, size_stock, price_cents, currency, is_active, compare_at_price_cents, sale_price_cents, discount_percent_bps, sale_starts_at, sale_ends_at";

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

  // { stock: {...} } edits stock on its own; anything else is a sale update.
  const body = req.body as Record<string, unknown> | null;
  if (body && typeof body === "object" && "stock" in body) {
    if (Object.keys(body).length !== 1) {
      return res.status(400).json({ error: "Send stock on its own, without sale fields" });
    }
    let edit: StockEdit;
    try {
      edit = validateStockEdit(body.stock);
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
    return updateStock(res, id, edit);
  }

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
      .select(PRODUCT_COLUMNS)
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

// Checkouts and payments change stock concurrently, so the write only lands if
// the product row is unchanged since we read it (updated_at moves on every
// update). If something else got in first, re-read and re-check: a change to
// a size the admin is editing is a conflict, a change to another size isn't.
async function updateStock(res: VercelResponse, id: string, edit: StockEdit) {
  try {
    const db = supabaseAdmin();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data: current, error: readError } = await db
        .from("products")
        .select("id, stock_count, size_stock, updated_at")
        .eq("id", id)
        .maybeSingle();
      if (readError) throw new Error(readError.message);
      if (!current) return res.status(404).json({ error: "Product not found" });

      let next;
      try {
        next = planStockUpdate(current, edit);
      } catch (err) {
        const status = err instanceof StockConflictError ? 409 : 400;
        return res.status(status).json({ error: (err as Error).message });
      }

      const { data, error } = await db
        .from("products")
        .update(next)
        .eq("id", id)
        .eq("updated_at", current.updated_at)
        .select(PRODUCT_COLUMNS)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (data) {
        log.info("api.admin.products.stock_updated", {
          productId: id,
          from: { stock_count: current.stock_count, size_stock: current.size_stock },
          to: next,
        });
        return res.status(200).json({ product: data });
      }
    }
    return res.status(409).json({ error: "Stock is changing quickly right now. Reload and try again." });
  } catch (err) {
    log.error("api.admin.products.stock_update.error", { err: (err as Error).message, productId: id });
    return res.status(500).json({ error: "Failed to update stock" });
  }
}
