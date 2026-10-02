import type { VercelRequest, VercelResponse } from "@vercel/node";
import { env } from "../../../../lib/env.js";
import { log } from "../../../../lib/logger.js";
import {
  buildNudgeMessage,
  findSupersedingOrder,
  MAX_NUDGES,
  normaliseSaPhone,
  waMeUrl,
  type CustomerOrder,
} from "../../../../lib/nudge.js";
import { CUSTOMER_COLUMNS } from "../../../../lib/supersede.js";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin.js";

function unauthorized(res: VercelResponse) {
  return res.status(401).json({ error: "Unauthorized" });
}

function parseOrderId(req: VercelRequest): string | null {
  const raw = req.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function refuse(res: VercelResponse, status: number, reason: string, error: string, extra: Record<string, unknown> = {}) {
  return res.status(status).json({ reason, error, ...extra });
}

// POST /api/admin/orders/:id/nudge — records a WhatsApp payment reminder for a
// pending order and returns the wa.me link the admin opens to send it.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
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

  try {
    const db = supabaseAdmin();
    const { data: order, error: readErr } = await db
      .from("orders")
      .select(`${CUSTOMER_COLUMNS}, status, amount_cents, customer_name, nudge_count, superseded_by`)
      .eq("id", id)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!order) return res.status(404).json({ reason: "not_found", error: "Order not found" });

    if (order.status !== "pending_payment") {
      return refuse(res, 409, "not_pending", "Order is no longer waiting on payment");
    }

    let supersededBy: string | null = order.superseded_by ?? null;
    if (!supersededBy) {
      const { data: laterPaid, error: paidErr } = await db
        .from("orders")
        .select(CUSTOMER_COLUMNS)
        .eq("status", "paid")
        .gt("created_at", order.created_at)
        .limit(500);
      if (paidErr) throw paidErr;
      supersededBy = findSupersedingOrder(order as CustomerOrder, (laterPaid || []) as CustomerOrder[])?.order_number ?? null;
    }
    if (supersededBy) {
      return refuse(res, 409, "superseded", `Customer paid on a later order (${supersededBy})`, { supersededBy });
    }

    const nudgeCount = Number(order.nudge_count ?? 0);
    if (nudgeCount >= MAX_NUDGES) {
      return refuse(res, 409, "max_nudges", "Both reminders have already been sent");
    }

    const phone = normaliseSaPhone(order.ship_phone);
    if (!phone) {
      return refuse(res, 422, "invalid_phone", "Phone number isn't a valid SA mobile number");
    }

    const payUrl = `${env.PUBLIC_SITE_URL.replace(/\/$/, "")}/pay/${encodeURIComponent(order.id)}`;
    const message = buildNudgeMessage(order, nudgeCount === 0 ? 1 : 2, payUrl);

    // Count only if nobody else nudged since we read the order, so a double
    // click or two admins can't send (or count) the same reminder twice.
    const lastNudgedAt = new Date().toISOString();
    const { data: updated, error: writeErr } = await db
      .from("orders")
      .update({ nudge_count: nudgeCount + 1, last_nudged_at: lastNudgedAt })
      .eq("id", id)
      .eq("nudge_count", nudgeCount)
      .eq("status", "pending_payment")
      .is("superseded_by", null)
      .select("nudge_count, last_nudged_at")
      .maybeSingle();
    if (writeErr) throw writeErr;
    if (!updated) {
      return refuse(res, 409, "conflict", "This order was just updated by someone else. Refresh and try again.");
    }

    log.info("api.admin.orders.nudged", { orderId: id, nudgeCount: updated.nudge_count });
    return res.status(200).json({
      url: waMeUrl(phone, message),
      nudgeCount: updated.nudge_count,
      lastNudgedAt: updated.last_nudged_at,
    });
  } catch (err) {
    log.error("api.admin.orders.nudge.error", { orderId: id, err: (err as Error).message });
    return res.status(500).json({ error: "Failed to prepare reminder" });
  }
}
