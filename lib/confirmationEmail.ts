// Customer emails for paid orders, sent through Resend (https://resend.com)
// when RESEND_API_KEY is set:
//   confirmation — when the order is marked paid.
//   dispatch     — when admin marks it Out for delivery (with courier and
//                  tracking number) or Ready for collection.
// Admin can resend either one, or open the plain-text version in their own
// mail app (mailto) as a manual fallback.
import { env } from "./env.js";
import { log } from "./logger.js";
import { firstName, formatRand } from "./nudge.js";
import { supabaseAdmin } from "./supabaseAdmin.js";

const RESEND_URL = "https://api.resend.com/emails";
export const EMAIL_ORDER_COLUMNS =
  "id, order_number, status, customer_name, customer_email, amount_cents, delivery_fee_cents, fulfilment_method, ship_suburb, ship_city, fulfilment_status, courier, tracking_number";

export type EmailKind = "confirmation" | "dispatch";

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
  fulfilment_status?: string | null;
  courier?: string | null;
  tracking_number?: string | null;
};

export type EmailItem = { product_name: string; size: string | null; quantity: number };

export type OrderEmail = { to: string; subject: string; text: string; html: string };
// Kept for existing callers.
export type ConfirmationEmail = OrderEmail;

// Fulfilment steps at which the order has left us (or is waiting at pickup).
export const DISPATCHED_STEPS = ["out_for_delivery", "ready_for_collection", "delivered", "collected"];

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

function destination(order: EmailOrder): string {
  return [order.ship_suburb, order.ship_city].filter(Boolean).join(", ");
}

function fulfilmentLine(order: EmailOrder): string {
  if (order.fulfilment_method === "collection") return "Collection: we'll WhatsApp you to arrange pickup.";
  const place = destination(order);
  return place ? `Delivering to ${place}` : "Delivery";
}

// ── Shared layout ──────────────────────────────────────────────

const CREAM = "#f4f1ea";
const MUTED = "#a8a49c";
const ACCENT = "#ff3b1f";
const FONT = "Helvetica, Arial, sans-serif";

type BoxLine = { text: string; strong?: string; muted?: boolean };

type Layout = {
  subject: string;
  preheader: string;
  banner: boolean;
  heading?: string;
  name: string;
  intro: string;
  orderNumber: string;
  items: EmailItem[];
  lines: BoxLine[];
  track: string;
  note: string;
};

function renderHtml(l: Layout): string {
  const itemRows = l.items
    .map(
      (item) => `
              <tr>
                <td style="padding:4px 0;font:15px ${FONT};color:${CREAM};">
                  <span style="display:inline-block;min-width:28px;padding:2px 6px;border:1px solid ${CREAM};font-weight:bold;text-align:center;">${escapeHtml(item.size || "-")}</span>
                  &nbsp;${item.quantity} &times; ${escapeHtml(item.product_name)}
                </td>
              </tr>`,
    )
    .join("");
  const lineRows = l.lines
    .map(
      (line, i) =>
        `
                      <tr><td style="padding-top:${i === 0 ? 12 : 4}px;font:15px ${FONT};color:${line.muted ? MUTED : CREAM};">${escapeHtml(line.text)}${
          line.strong ? ` <strong>${escapeHtml(line.strong)}</strong>` : ""
        }</td></tr>`,
    )
    .join("");
  const top = l.banner
    ? `
          <tr>
            <td>
              <img src="${siteUrl()}/email/thanks-smilano.jpg" width="600" alt="S'MILANO SAVED MY LIFE. Thanks for shopping with us." style="display:block;width:100%;max-width:600px;height:auto;border:0;">
            </td>
          </tr>`
    : `
          <tr>
            <td style="padding:28px 24px 0;">
              <div style="font:bold 14px ${FONT};letter-spacing:4px;color:${CREAM};">BABYSITTER</div>
              <div style="padding-top:20px;font:bold 40px/1 Impact, 'Arial Narrow', ${FONT};text-transform:uppercase;color:${CREAM};">${escapeHtml(l.heading ?? "")}</div>
            </td>
          </tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>${escapeHtml(l.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#0b0b0b;">
  <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(l.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0b0b0b;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">${top}
          <tr>
            <td style="padding:28px 24px 8px;font:16px/1.5 ${FONT};color:${CREAM};">
              <p style="margin:0 0 12px;font-size:18px;font-weight:bold;">Hi ${escapeHtml(l.name)},</p>
              <p style="margin:0;">${escapeHtml(l.intro)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #3a3835;">
                <tr>
                  <td style="padding:16px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr><td style="padding-bottom:8px;font:12px ${FONT};letter-spacing:2px;text-transform:uppercase;color:${MUTED};">Order ${escapeHtml(l.orderNumber)}</td></tr>${itemRows}${lineRows}
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
                  <td bgcolor="${ACCENT}" style="background:${ACCENT};">
                    <a href="${l.track}" style="display:inline-block;padding:14px 28px;font:bold 15px ${FONT};letter-spacing:1px;text-transform:uppercase;color:#0b0b0b;text-decoration:none;">Track your order &rarr;</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 24px;font:14px/1.5 ${FONT};color:${MUTED};">
              ${escapeHtml(l.note)}<br>
              Or open: <a href="${l.track}" style="color:${CREAM};">${escapeHtml(l.track)}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px;border-top:1px solid #3a3835;font:13px/1.5 ${FONT};color:${MUTED};">
              Questions? Reply to this email or DM <a href="https://www.instagram.com/babysitter_bs/" style="color:${CREAM};">@babysitter_bs</a> on Instagram.<br><br>
              <strong style="color:${CREAM};letter-spacing:3px;">BABYSITTER</strong><br>
              Changing the world one garment at a time.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderText(l: Layout): string {
  return [
    `Hi ${l.name},`,
    "",
    l.intro,
    "",
    `Order ${l.orderNumber}`,
    ...l.items.map(itemLine),
    ...l.lines.map((line) => (line.strong ? `${line.text} ${line.strong}` : line.text)),
    "",
    `Track your order: ${l.track}`,
    l.note,
    "",
    "Questions? Reply to this email or DM @babysitter_bs on Instagram.",
    "",
    "BABYSITTER",
    "Changing the world one garment at a time.",
  ].join("\n");
}

function render(to: string, l: Layout): OrderEmail {
  return { to, subject: l.subject, text: renderText(l), html: renderHtml(l) };
}

// ── The two emails ─────────────────────────────────────────────

export function buildConfirmationEmail(order: EmailOrder, items: EmailItem[]): OrderEmail | null {
  const to = order.customer_email?.trim();
  if (!to) return null;
  return render(to, {
    subject: `Your BABYSITTER order ${order.order_number} is confirmed`,
    preheader: `Order ${order.order_number} is confirmed. Track it any time.`,
    banner: true,
    name: firstName(order.customer_name),
    intro: "Thank you for shopping with BABYSITTER. Your payment went through and your order is confirmed.",
    orderNumber: order.order_number,
    items,
    lines: [{ text: "Total", strong: totalLine(order) }, { text: fulfilmentLine(order), muted: true }],
    track: trackingUrl(order.id),
    note: "We'll update it when your order is packed and out for delivery.",
  });
}

export function buildDispatchEmail(order: EmailOrder, items: EmailItem[]): OrderEmail | null {
  const to = order.customer_email?.trim();
  if (!to) return null;
  const name = firstName(order.customer_name);
  const track = trackingUrl(order.id);

  if (order.fulfilment_method === "collection") {
    return render(to, {
      subject: `Your BABYSITTER order ${order.order_number} is ready for collection`,
      preheader: `Order ${order.order_number} is packed and ready for you.`,
      banner: false,
      heading: "Ready for collection",
      name,
      intro: "Good news: your order is packed and ready for collection. We'll be in touch on WhatsApp to arrange pickup.",
      orderNumber: order.order_number,
      items,
      lines: [{ text: `Bring your order number ${order.order_number} when you collect.`, muted: true }],
      track,
      note: "Your tracking page shows when it's been collected.",
    });
  }

  const lines: BoxLine[] = [];
  if (order.courier) lines.push({ text: "Courier", strong: order.courier });
  if (order.tracking_number) lines.push({ text: "Tracking number", strong: order.tracking_number });
  const place = destination(order);
  lines.push({ text: place ? `Delivering to ${place}` : "On its way to you", muted: true });

  return render(to, {
    subject: `Your BABYSITTER order ${order.order_number} is on its way`,
    preheader: order.tracking_number
      ? `Out for delivery${order.courier ? ` with ${order.courier}` : ""}. Tracking number ${order.tracking_number}.`
      : `Order ${order.order_number} is out for delivery.`,
    banner: false,
    heading: "On its way",
    name,
    intro: "Good news: your order is out for delivery.",
    orderNumber: order.order_number,
    items,
    lines,
    track,
    note: "Your tracking page updates when it's delivered.",
  });
}

// mailto: link for the manual fallback: opens the admin's own mail app with
// the plain-text version filled in.
export function emailMailto(email: OrderEmail): string {
  return `mailto:${encodeURIComponent(email.to)}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.text)}`;
}
export const confirmationMailto = emailMailto;

export function emailSendingConfigured(): boolean {
  return !!process.env.RESEND_API_KEY?.trim();
}

const COLUMNS: Record<EmailKind, { sentAt: string; id: string; error: string; manualAt: string }> = {
  confirmation: {
    sentAt: "confirmation_email_sent_at",
    id: "confirmation_email_id",
    error: "confirmation_email_error",
    manualAt: "confirmation_email_manual_at",
  },
  dispatch: {
    sentAt: "dispatch_email_sent_at",
    id: "dispatch_email_id",
    error: "dispatch_email_error",
    manualAt: "dispatch_email_manual_at",
  },
};

export function emailColumns(kind: EmailKind) {
  return COLUMNS[kind];
}

type LoadedOrder = EmailOrder & { status: string };

// Why this email can't go to this order, or null if it can.
export function emailBlockedReason(kind: EmailKind, order: LoadedOrder): "not_paid" | "not_dispatched" | null {
  if (order.status !== "paid") return "not_paid";
  if (kind === "dispatch" && !DISPATCHED_STEPS.includes(order.fulfilment_status ?? "")) return "not_dispatched";
  return null;
}

export function buildOrderEmail(kind: EmailKind, order: EmailOrder, items: EmailItem[]): OrderEmail | null {
  return kind === "confirmation" ? buildConfirmationEmail(order, items) : buildDispatchEmail(order, items);
}

export async function loadEmailOrder(orderId: string): Promise<{ order: LoadedOrder; items: EmailItem[] } | null> {
  const db = supabaseAdmin();
  const { data: order, error } = await db.from("orders").select(EMAIL_ORDER_COLUMNS).eq("id", orderId).maybeSingle();
  if (error) throw new Error(`order lookup failed: ${error.message}`);
  if (!order) return null;
  const { data: items } = await db.from("order_items").select("product_name, size, quantity").eq("order_id", orderId);
  return {
    order: order as LoadedOrder,
    items: ((items || []) as EmailItem[]).map(({ product_name, size, quantity }) => ({ product_name, size, quantity })),
  };
}

export type SendResult =
  | { status: "sent"; emailId: string | null; sentAt: string }
  | { status: "not_configured" }
  | { status: "skipped"; reason: "not_found" | "not_paid" | "not_dispatched" | "no_email" }
  | { status: "failed"; error: string };

// Sends (or resends) one of the order emails and records the outcome on the
// order. Never throws: callers on the payment and admin paths must not fail
// because of it.
export async function sendOrderEmail(orderId: string, kind: EmailKind, opts: { resend?: boolean } = {}): Promise<SendResult> {
  const db = supabaseAdmin();
  const cols = COLUMNS[kind];
  try {
    const loaded = await loadEmailOrder(orderId);
    if (!loaded) return { status: "skipped", reason: "not_found" };
    const blocked = emailBlockedReason(kind, loaded.order);
    if (blocked) return { status: "skipped", reason: blocked };

    const email = buildOrderEmail(kind, loaded.order, loaded.items);
    if (!email) {
      await db.from("orders").update({ [cols.error]: "No email address on the order" }).eq("id", orderId);
      return { status: "skipped", reason: "no_email" };
    }
    if (!emailSendingConfigured()) {
      log.info(`email.${kind}.not_configured`, { orderId });
      return { status: "not_configured" };
    }

    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
        "Content-Type": "application/json",
        // The automatic send is deduplicated by Resend for 24h; a deliberate
        // resend from admin gets a fresh key.
        "Idempotency-Key": opts.resend ? `order-${kind}-${orderId}-${Date.now()}` : `order-${kind}-${orderId}`,
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
      await db.from("orders").update({ [cols.error]: message.slice(0, 300) }).eq("id", orderId);
      log.error(`email.${kind}.failed`, { orderId, status: res.status, err: message });
      return { status: "failed", error: message };
    }

    let emailId: string | null = null;
    try {
      emailId = JSON.parse(body)?.id ?? null;
    } catch {
      /* id is optional */
    }
    const sentAt = new Date().toISOString();
    await db.from("orders").update({ [cols.sentAt]: sentAt, [cols.id]: emailId, [cols.error]: null }).eq("id", orderId);
    log.info(`email.${kind}.sent`, { orderId, emailId, resend: !!opts.resend });
    return { status: "sent", emailId, sentAt };
  } catch (err) {
    const message = (err as Error).message;
    log.error(`email.${kind}.error`, { orderId, err: message });
    try {
      await db.from("orders").update({ [cols.error]: message.slice(0, 300) }).eq("id", orderId);
    } catch {
      /* best effort */
    }
    return { status: "failed", error: message };
  }
}

export function sendOrderConfirmation(orderId: string, opts: { resend?: boolean } = {}): Promise<SendResult> {
  return sendOrderEmail(orderId, "confirmation", opts);
}

export function sendDispatchEmail(orderId: string, opts: { resend?: boolean } = {}): Promise<SendResult> {
  return sendOrderEmail(orderId, "dispatch", opts);
}
