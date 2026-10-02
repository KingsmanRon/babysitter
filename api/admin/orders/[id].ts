import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildFulfilmentUpdate, type FulfilmentInput } from "../../../lib/fulfilment.js";
import { log } from "../../../lib/logger.js";
import { supabaseAdmin } from "../../../lib/supabaseAdmin.js";

const ALLOWED_FIELDS = new Set(["fulfilment_status", "courier", "tracking_number"]);
const RETURN_COLUMNS =
  "id, order_number, status, fulfilment_method, fulfilment_status, courier, tracking_number, dispatched_at, delivered_at, fulfilment_updated_at";

function unauthorized(res: VercelResponse) {
  return res.status(401).json({ error: "Unauthorized" });
}

function parseOrderId(req: VercelRequest): string | null {
  const raw = req.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

// PATCH /api/admin/orders/:id — update an order's fulfilment (packed, out for
// delivery, delivered, ...) plus courier and tracking number.
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

  const id = parseOrderId(req);
  if (!id) return res.status(400).json({ error: "Order id is required" });

  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({ error: "Request body must be an object" });
  }
  const unsupported = Object.keys(body).find((key) => !ALLOWED_FIELDS.has(key));
  if (unsupported) return res.status(400).json({ error: `Unsupported field: ${unsupported}` });

  try {
    const db = supabaseAdmin();
    const { data: order, error: readErr } = await db
      .from("orders")
      .select("id, status, fulfilment_method, dispatched_at, delivered_at")
      .eq("id", id)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!order) return res.status(404).json({ error: "Order not found" });

    let update: Record<string, unknown>;
    try {
      update = buildFulfilmentUpdate(order, body as FulfilmentInput);
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }

    // Guard on paid so a concurrent refund/cancel isn't shipped.
    const { data: updated, error: writeErr } = await db
      .from("orders")
      .update(update)
      .eq("id", id)
      .eq("status", "paid")
      .select(RETURN_COLUMNS)
      .maybeSingle();
    if (writeErr) throw writeErr;
    if (!updated) return res.status(409).json({ error: "Order is no longer paid" });

    log.info("api.admin.orders.fulfilment", {
      orderId: id,
      fulfilmentStatus: updated.fulfilment_status,
    });
    return res.status(200).json({ order: updated });
  } catch (err) {
    log.error("api.admin.orders.update.error", { orderId: id, err: (err as Error).message });
    return res.status(500).json({ error: "Failed to update order" });
  }
}
