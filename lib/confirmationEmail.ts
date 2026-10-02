// Order confirmation email for paid orders.
//
// Sent automatically through Resend (https://resend.com) when an order is
// marked paid, if RESEND_API_KEY is set. Admin can resend it, or open the
// plain-text version in their own mail app (mailto) as a manual fallback.
import { env } from "./env.js";
import { log } from "./logger.js";
import { firstName, formatRand } from "./nudge.js";
import { supabaseAdmin } from "./supabaseAdmin.js";

const RESEND_URL = "https://api.resend.com/emails";
export const EMAIL_ORDER_COLUMNS =
  "id, order_number, status, customer_name, customer_email, amount_cents, delivery_fee_cents, fulfilment_method, ship_suburb, ship_city";

export type EmailOrder = {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_email: string | null;
  amount_cents: number;
  delivery_fee_cents: number | null;
  fulfilment_method: string | null;
  ship_suburb: string | null;
  ship_city: string | null;
};

export type EmailItem = { product_name: string; size: string | null; quantity: number };

export type ConfirmationEmail = { to: string; subject: string; text: string; html: string };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function siteUrl(): string {
  return env.PUBLIC_SITE_URL.replace(/\/$/, "");
}

export function trackingUrl(orderId: string): string {
  return `${siteUrl()}/track/${encodeURIComponent(orderId)}`;
}

function itemLine(item: EmailItem): string {
  return `${item.product_name}${item.size ? ` · Size ${item.size}` : ""} × ${item.quantity}`;
}

function totalLine(order: EmailOrder): string {
  const fee = order.delivery_fee_cents ?? 0;
  return `${formatRand(order.amount_cents)}${fee > 0 ? ` (incl. ${formatRand(fee)} delivery)` : ""}`;
}

function fulfilmentLine(order: EmailOrder): string {
  if (order.fulfilment_method === "collection") return "Collection: we'll WhatsApp you to arrange pickup.";
  const place = [order.ship_suburb, order.ship_city].filter(Boolean).join(", ");
  return place ? `Delivering to ${place}` : "Delivery";
}

export function buildConfirmationEmail(order: EmailOrder, items: EmailItem[]): ConfirmationEmail | null {
  const to = order.customer_email?.trim();
  if (!to) return null;

  const name = firstName(order.customer_name);
  const track = trackingUrl(order.id);
  const subject = `Your BABYSITTER order ${order.order_number} is confirmed`;

  const text = [
    `Hi ${name},`,
    "",
    "Thank you for shopping with BABYSITTER. Your payment went through and your order is confirmed.",
    "",
    `Order ${order.order_number}`,
    ...items.map(itemLine),
    `Total ${totalLine(order)}`,
    fulfilmentLine(order),
    "",
    `Track your order: ${track}`,
    "We'll update it when your order is packed and out for delivery.",
    "",
    "Questions? Reply to this email or DM @babysitter_bs on Instagram.",
    "",
    "BABYSITTER",
    "Changing the world one garment at a time.",
  ].join("\n");

  const cream = "#f4f1ea";
  const muted = "#a8a49c";
  const accent = "#ff3b1f";
  const font = "Helvetica, Arial, sans-serif";
  const itemRows = items
    .map(
      (item) => `
              <tr>
                <td style="padding:4px 0;font:15px ${font};color:${cream};">
                  <span style="display:inline-block;min-width:28px;padding:2px 6px;border:1px solid ${cream};font-weight:bold;text-align:center;">${escapeHtml(item.size || "-")}</span>
                  &nbsp;${item.quantity} &times; ${escapeHtml(item.product_name)}
                </td>
              </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#0b0b0b;">
  <div style="display:none;max-height:0;overflow:hidden;">Order ${escapeHtml(order.order_number)} is confirmed. Track it any time.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0b0b0b;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
          <tr>
            <td>
              <img src="${siteUrl()}/email/thanks-smilano.jpg" width="600" alt="S'MILANO SAVED MY LIFE. Thanks for shopping with us." style="display:block;width:100%;max-width:600px;height:auto;border:0;">
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 8px;font:16px/1.5 ${font};color:${cream};">
              <p style="margin:0 0 12px;font-size:18px;font-weight:bold;">Hi ${escapeHtml(name)},</p>
              <p style="margin:0;">Thank you for shopping with BABYSITTER. Your payment went through and your order is confirmed.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #3a3835;">
                <tr>
                  <td style="padding:16px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr><td style="padding-bottom:8px;font:12px ${font};letter-spacing:2px;text-transform:uppercase;color:${muted};">Order ${escapeHtml(order.order_number)}</td></tr>${itemRows}
                      <tr><td style="padding-top:12px;font:15px ${font};color:${cream};">Total <strong>${escapeHtml(totalLine(order))}</strong></td></tr>
                      <tr><td style="padding-top:4px;font:15px ${font};color:${muted};">${escapeHtml(fulfilmentLine(order))}</td></tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 4px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td bgcolor="${accent}" style="background:${accent};">
                    <a href="${track}" style="display:inline-block;padding:14px 28px;font:bold 15px ${font};letter-spacing:1px;text-transform:uppercase;color:#0b0b0b;text-decoration:none;">Track your order &rarr;</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 24px;font:14px/1.5 ${font};color:${muted};">
              We'll update it when your order is packed and out for delivery.<br>
              Or open: <a href="${track}" style="color:${cream};">${escapeHtml(track)}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px;border-top:1px solid #3a3835;font:13px/1.5 ${font};color:${muted};">
              Questions? Reply to this email or DM <a href="https://www.instagram.com/babysitter_bs/" style="color:${cream};">@babysitter_bs</a> on Instagram.<br><br>
              <strong style="color:${cream};letter-spacing:3px;">BABYSITTER</strong><br>
              Changing the world one garment at a time.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { to, subject, text, html };
}

// mailto: link for the manual fallback: opens the admin's own mail app with
// the plain-text version filled in.
export function confirmationMailto(email: ConfirmationEmail): string {
  return `mailto:${encodeURIComponent(email.to)}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.text)}`;
}

export function emailSendingConfigured(): boolean {
  return !!process.env.RESEND_API_KEY?.trim();
}

async function loadOrder(orderId: string): Promise<{ order: EmailOrder & { status: string }; items: EmailItem[] } | null> {
  const db = supabaseAdmin();
  const { data: order, error } = await db.from("orders").select(EMAIL_ORDER_COLUMNS).eq("id", orderId).maybeSingle();
  if (error) throw new Error(`order lookup failed: ${error.message}`);
  if (!order) return null;
  const { data: items } = await db.from("order_items").select("product_name, size, quantity").eq("order_id", orderId);
  return { order, items: ((items || []) as EmailItem[]).map(({ product_name, size, quantity }) => ({ product_name, size, quantity })) };
}

export type SendResult =
  | { status: "sent"; emailId: string | null; sentAt: string }
  | { status: "not_configured" }
  | { status: "skipped"; reason: "not_found" | "not_paid" | "no_email" }
  | { status: "failed"; error: string };

// Sends (or resends) the confirmation email and records the outcome on the
// order. Never throws: callers on the payment path must not fail because of it.
export async function sendOrderConfirmation(orderId: string, opts: { resend?: boolean } = {}): Promise<SendResult> {
  const db = supabaseAdmin();
  try {
    const loaded = await loadOrder(orderId);
    if (!loaded) return { status: "skipped", reason: "not_found" };
    if (loaded.order.status !== "paid") return { status: "skipped", reason: "not_paid" };

    const email = buildConfirmationEmail(loaded.order, loaded.items);
    if (!email) {
      await db.from("orders").update({ confirmation_email_error: "No email address on the order" }).eq("id", orderId);
      return { status: "skipped", reason: "no_email" };
    }
    if (!emailSendingConfigured()) {
      log.info("email.confirmation.not_configured", { orderId });
      return { status: "not_configured" };
    }

    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
        "Content-Type": "application/json",
        // The automatic send is deduplicated by Resend for 24h; a deliberate
        // resend from admin gets a fresh key.
        "Idempotency-Key": opts.resend ? `order-confirmation-${orderId}-${Date.now()}` : `order-confirmation-${orderId}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM?.trim() || "BABYSITTER <orders@babysitterbs.co.za>",
        to: [email.to],
        reply_to: process.env.EMAIL_REPLY_TO?.trim() || "babysitterbs9@gmail.com",
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      let message = `Email service error (${res.status})`;
      try {
        message = JSON.parse(body)?.message || message;
      } catch {
        /* keep default */
      }
      await db.from("orders").update({ confirmation_email_error: message.slice(0, 300) }).eq("id", orderId);
      log.error("email.confirmation.failed", { orderId, status: res.status, err: message });
      return { status: "failed", error: message };
    }

    let emailId: string | null = null;
    try {
      emailId = JSON.parse(body)?.id ?? null;
    } catch {
      /* id is optional */
    }
    const sentAt = new Date().toISOString();
    await db
      .from("orders")
      .update({ confirmation_email_sent_at: sentAt, confirmation_email_id: emailId, confirmation_email_error: null })
      .eq("id", orderId);
    log.info("email.confirmation.sent", { orderId, emailId, resend: !!opts.resend });
    return { status: "sent", emailId, sentAt };
  } catch (err) {
    const message = (err as Error).message;
    log.error("email.confirmation.error", { orderId, err: message });
    try {
      await db.from("orders").update({ confirmation_email_error: message.slice(0, 300) }).eq("id", orderId);
    } catch {
      /* best effort */
    }
    return { status: "failed", error: message };
  }
}
