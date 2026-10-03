import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  buildOrderEmail,
  emailBlockedReason,
  emailColumns,
  emailMailto,
  loadEmailOrder,
  sendOrderEmail,
  type EmailKind,
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
//   { mode: "send", kind? }   — (re)send the email now through the email service.
//   { mode: "manual", kind? } — return a mailto: link with the plain-text
//                               version for the admin's own mail app
//                               (fallback), and note it.
// kind is "confirmation" (default) or "dispatch" (on its way / ready for
// collection).
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
  const { mode, kind: rawKind } = (req.body ?? {}) as { mode?: unknown; kind?: unknown };
  if (mode !== "send" && mode !== "manual") {
    return res.status(400).json({ error: 'mode must be "send" or "manual"' });
  }
  const kind: EmailKind | null = rawKind === undefined || rawKind === "confirmation" ? "confirmation" : rawKind === "dispatch" ? "dispatch" : null;
  if (!kind) return res.status(400).json({ error: 'kind must be "confirmation" or "dispatch"' });

  try {
    const db = supabaseAdmin();
    const loaded = await loadEmailOrder(id);
    if (!loaded) return res.status(404).json({ reason: "not_found", error: "Order not found" });
    const blocked = emailBlockedReason(kind, loaded.order);
    if (blocked === "not_paid") {
      return res.status(409).json({ reason: blocked, error: "Only paid orders get customer emails" });
    }
    if (blocked === "not_dispatched") {
      return res
        .status(409)
        .json({ reason: blocked, error: "Mark the order Out for delivery or Ready for collection first" });
    }
    if (!loaded.order.customer_email?.trim()) {
      return res.status(422).json({ reason: "no_email", error: "This order has no email address" });
    }

    if (mode === "manual") {
      const email = buildOrderEmail(kind, loaded.order, loaded.items)!;
      const manualAt = new Date().toISOString();
      await db.from("orders").update({ [emailColumns(kind).manualAt]: manualAt }).eq("id", id);
      return res.status(200).json({ mailto: emailMailto(email), manualAt });
    }

    const result = await sendOrderEmail(id, kind, { resend: true });
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
