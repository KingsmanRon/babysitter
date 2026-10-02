import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  buildConfirmationEmail,
  confirmationMailto,
  EMAIL_ORDER_COLUMNS,
  sendOrderConfirmation,
  type EmailItem,
} from "../../../../lib/confirmationEmail.js";
import { log } from "../../../../lib/logger.js";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin.js";

function unauthorized(res: VercelResponse) {
  return res.status(401).json({ error: "Unauthorized" });
}

function parseOrderId(req: VercelRequest): string | null {
  const raw = req.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

// POST /api/admin/orders/:id/email
//   { mode: "send" }   — (re)send the branded confirmation email now.
//   { mode: "manual" } — return a mailto: link with the plain-text version for
//                        the admin's own mail app (fallback), and note it.
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
  const mode = (req.body as { mode?: unknown } | undefined)?.mode;
  if (mode !== "send" && mode !== "manual") {
    return res.status(400).json({ error: 'mode must be "send" or "manual"' });
  }

  try {
    const db = supabaseAdmin();
    const { data: order, error } = await db.from("orders").select(EMAIL_ORDER_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!order) return res.status(404).json({ reason: "not_found", error: "Order not found" });
    if (order.status !== "paid") {
      return res.status(409).json({ reason: "not_paid", error: "Only paid orders get a confirmation email" });
    }
    if (!order.customer_email?.trim()) {
      return res.status(422).json({ reason: "no_email", error: "This order has no email address" });
    }

    if (mode === "manual") {
      const { data: items } = await db.from("order_items").select("product_name, size, quantity").eq("order_id", id);
      const email = buildConfirmationEmail(order, (items || []) as EmailItem[])!;
      const manualAt = new Date().toISOString();
      await db.from("orders").update({ confirmation_email_manual_at: manualAt }).eq("id", id);
      return res.status(200).json({ mailto: confirmationMailto(email), manualAt });
    }

    const result = await sendOrderConfirmation(id, { resend: true });
    if (result.status === "sent") {
      return res.status(200).json({ sentAt: result.sentAt, emailId: result.emailId });
    }
    if (result.status === "not_configured") {
      return res.status(503).json({
        reason: "not_configured",
        error: "Email sending isn't set up yet (RESEND_API_KEY). Use Email manually.",
      });
    }
    if (result.status === "failed") {
      return res.status(502).json({ reason: "failed", error: result.error });
    }
    return res.status(409).json({ reason: result.reason, error: "Couldn't send for this order" });
  } catch (err) {
    log.error("api.admin.orders.email.error", { orderId: id, err: (err as Error).message });
    return res.status(500).json({ error: "Failed to prepare the email" });
  }
}
