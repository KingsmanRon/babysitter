import crypto from "node:crypto";
import { env, processingMode } from "./env.js";
import { log } from "./logger.js";
import { supabaseAdmin } from "./supabaseAdmin.js";

const YOCO_CHECKOUT_URL = "https://payments.yoco.com/api/checkouts";

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────
export type YocoCheckoutRequest = {
  amount: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  failureUrl: string;
  clientReferenceId?: string;
  externalId?: string;
  metadata?: Record<string, string>;
};

export type YocoCheckoutResponse = {
  id: string;
  redirectUrl: string;
  status?: string;
  amount?: number;
  currency?: string;
};

export type YocoWebhookEvent = {
  id: string;
  type: string;
  createdDate?: string;
  payload: {
    id: string;
    type?: string;
    status?: string;
    amount?: number;
    currency?: string;
    metadata?: Record<string, string>;
    mode?: string;
    paymentMethodDetails?: {
      type?: string;
      card?: {
        scheme?: string;
        maskedCard?: string;
        expiryMonth?: number;
        expiryYear?: number;
      };
    };
    checkoutId?: string;
    externalId?: string;
    [key: string]: unknown;
  };
};

// ──────────────────────────────────────────────────────────────
// createYocoCheckout — server-side checkout creation
// ──────────────────────────────────────────────────────────────
export async function createYocoCheckout(orderId: string): Promise<{ redirectUrl: string; checkoutId: string }> {
  const db = supabaseAdmin();

  const { data: order, error: orderErr } = await db
    .from("orders")
    .select("id, order_number, amount_cents, currency, status")
    .eq("id", orderId)
    .single();
  if (orderErr || !order) {
    log.error("yoco.create_checkout.order_not_found", { orderId, err: orderErr?.message });
    throw new Error("Order not found");
  }
  if (order.status === "paid") {
    throw new Error("Order is already paid");
  }

  // Idempotency: if we already created a checkout for this order in a
  // still-usable state, return it.
  const { data: existing } = await db
    .from("payment_transactions")
    .select("id, provider_checkout_id, provider_status, raw_metadata_json")
    .eq("order_id", orderId)
    .eq("provider", "yoco")
    .is("paid_at", null)
    .is("failed_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (existing && existing.length > 0 && existing[0].provider_checkout_id) {
    const existingUrl =
      (existing[0].raw_metadata_json as Record<string, unknown> | null)?.redirectUrl;
    if (typeof existingUrl === "string" && existingUrl.length > 0) {
      log.info("yoco.create_checkout.reused", {
        orderId,
        checkoutId: existing[0].provider_checkout_id,
      });
      return {
        checkoutId: existing[0].provider_checkout_id,
        redirectUrl: existingUrl,
      };
    }
  }

  const baseUrl = env.PUBLIC_SITE_URL.replace(/\/$/, "");
  const payload: YocoCheckoutRequest = {
    amount: order.amount_cents,
    currency: order.currency,
    successUrl: `${baseUrl}/payment/success?orderId=${order.id}`,
    cancelUrl: `${baseUrl}/payment/cancelled?orderId=${order.id}`,
    failureUrl: `${baseUrl}/payment/failed?orderId=${order.id}`,
    clientReferenceId: order.order_number,
    externalId: order.id,
    metadata: {
      orderId: order.id,
      orderNumber: order.order_number,
    },
  };

  const idempotencyKey = `checkout-${order.id}-${Date.now()}`;
  const res = await fetch(YOCO_CHECKOUT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.YOCO_SECRET_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    log.error("yoco.create_checkout.api_error", {
      orderId,
      status: res.status,
      body: bodyText.slice(0, 500),
    });
    throw new Error(`Yoco checkout creation failed (${res.status})`);
  }

  let parsed: YocoCheckoutResponse;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    log.error("yoco.create_checkout.invalid_json", { orderId, body: bodyText.slice(0, 500) });
    throw new Error("Yoco returned an invalid response");
  }

  if (!parsed.id || !parsed.redirectUrl) {
    throw new Error("Yoco response missing id or redirectUrl");
  }

  const { error: txErr } = await db.from("payment_transactions").insert({
    order_id: order.id,
    provider: "yoco",
    provider_checkout_id: parsed.id,
    provider_status: parsed.status || "created",
    amount_cents: order.amount_cents,
    currency: order.currency,
    processing_mode: processingMode(),
    client_reference_id: order.order_number,
    external_id: order.id,
    raw_metadata_json: {
      redirectUrl: parsed.redirectUrl,
      idempotencyKey,
      checkoutResponse: parsed,
    },
  });
  if (txErr) {
    log.error("yoco.create_checkout.db_insert_failed", {
      orderId,
      err: txErr.message,
    });
    throw new Error("Failed to save payment transaction");
  }

  const { error: orderUpdateErr } = await db
    .from("orders")
    .update({ status: "pending_payment" })
    .eq("id", order.id)
    .in("status", ["draft", "pending_payment"]);
  if (orderUpdateErr) {
    log.warn("yoco.create_checkout.order_status_update_failed", {
      orderId,
      err: orderUpdateErr.message,
    });
  }

  log.info("yoco.create_checkout.ok", {
    orderId,
    checkoutId: parsed.id,
  });

  return { redirectUrl: parsed.redirectUrl, checkoutId: parsed.id };
}

// ──────────────────────────────────────────────────────────────
// verifyYocoWebhook — signature + timestamp check
// ──────────────────────────────────────────────────────────────
const MAX_WEBHOOK_AGE_SECONDS = 3 * 60;

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export function verifyYocoWebhook(
  headers: Record<string, string | string[] | undefined>,
  rawBody: Buffer,
): VerifyResult {
  const secret = env.YOCO_WEBHOOK_SECRET;
  if (!secret) {
    return { ok: false, reason: "YOCO_WEBHOOK_SECRET not configured" };
  }

  const webhookId = header(headers, "webhook-id");
  const webhookTimestamp = header(headers, "webhook-timestamp");
  const webhookSignature = header(headers, "webhook-signature");
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return { ok: false, reason: "missing webhook-* headers" };
  }

  const tsSeconds = Number.parseInt(webhookTimestamp, 10);
  if (!Number.isFinite(tsSeconds)) {
    return { ok: false, reason: "invalid webhook-timestamp" };
  }
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - tsSeconds);
  if (ageSeconds > MAX_WEBHOOK_AGE_SECONDS) {
    return { ok: false, reason: `stale webhook (${ageSeconds}s old)` };
  }

  // Yoco/Svix-compatible: secret is "whsec_<base64>".
  const secretBody = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  let secretBytes: Buffer;
  try {
    secretBytes = Buffer.from(secretBody, "base64");
  } catch {
    return { ok: false, reason: "invalid webhook secret encoding" };
  }

  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody.toString("utf8")}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");

  // The header can contain multiple "v1,<sig>" pairs separated by spaces.
  const candidates = webhookSignature.split(" ").map((part) => {
    const [, value] = part.split(",");
    return value || part;
  });

  for (const candidate of candidates) {
    if (
      candidate.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expected))
    ) {
      return { ok: true };
    }
  }
  return { ok: false, reason: "signature mismatch" };
}

function header(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0];
  return v;
}

// ──────────────────────────────────────────────────────────────
// handleYocoWebhook — persist + fulfil
// ──────────────────────────────────────────────────────────────
function webhookEventTimestamp(event: YocoWebhookEvent): string {
  if (event.createdDate) {
    const parsed = new Date(event.createdDate);
    if (!Number.isNaN(parsed.getTime())) {
      return event.createdDate;
    }
  }

  return new Date().toISOString();
}

export async function handleYocoWebhook(
  event: YocoWebhookEvent,
  rawHeaders: Record<string, string | string[] | undefined>,
  signatureValid: boolean,
): Promise<{ ok: true; duplicate?: boolean }> {
  const db = supabaseAdmin();

  const webhookId = header(rawHeaders, "webhook-id") || null;
  const webhookTimestamp = header(rawHeaders, "webhook-timestamp") || null;

  // Store the event. Unique constraint on (provider, provider_event_id)
  // gives us idempotency "for free".
  const { error: insertErr } = await db.from("payment_webhook_events").insert({
    provider: "yoco",
    provider_event_id: event.id,
    event_type: event.type,
    webhook_id: webhookId,
    webhook_timestamp: webhookTimestamp,
    signature_valid: signatureValid,
    payload_json: event as unknown as Record<string, unknown>,
  });
  if (insertErr) {
    if (insertErr.code === "23505") {
      log.info("yoco.webhook.duplicate", { eventId: event.id, type: event.type });
      return { ok: true, duplicate: true };
    }
    log.error("yoco.webhook.insert_failed", { eventId: event.id, err: insertErr.message });
    throw new Error("Failed to persist webhook event");
  }

  if (!signatureValid) {
    log.warn("yoco.webhook.invalid_signature_ignored", { eventId: event.id, type: event.type });
    return { ok: true };
  }

  if (event.type === "payment.succeeded") {
    await processPaymentSucceeded(event);
  } else if (event.type === "payment.failed") {
    await processPaymentFailed(event);
  } else {
    log.info("yoco.webhook.unhandled_type", { eventId: event.id, type: event.type });
  }

  await db
    .from("payment_webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("provider", "yoco")
    .eq("provider_event_id", event.id);

  return { ok: true };
}

// ──────────────────────────────────────────────────────────────
async function processPaymentSucceeded(event: YocoWebhookEvent) {
  const db = supabaseAdmin();
  const eventId = event.id;
  const eventType = event.type;
  const payment = event.payload;
  const orderId = payment.metadata?.orderId || (await resolveOrderId(event));
  if (!orderId) {
    log.error("yoco.webhook.no_order_match", { eventId });
    return;
  }

  const checkoutId = payment.metadata?.checkoutId || payment.checkoutId || null;
  const paymentId = payment.id || null;
  const card = payment.paymentMethodDetails?.card;
  const last4 = card?.maskedCard ? card.maskedCard.slice(-4) : null;

  const txPayload = {
    order_id: orderId,
    provider: "yoco",
    provider_checkout_id: checkoutId,
    provider_payment_id: paymentId,
    provider_event_id: eventId,
    provider_status: "succeeded",
    amount_cents: payment.amount ?? 0,
    currency: payment.currency ?? "ZAR",
    processing_mode: payment.mode || processingMode(),
    payment_method_type: payment.paymentMethodDetails?.type || null,
    payment_method_brand: card?.scheme || null,
    payment_method_last4: last4,
    raw_metadata_json: {
      eventId,
      eventType,
      payment,
    },
    paid_at: webhookEventTimestamp(event),
    failed_at: null,
  };

  const { data: updatedTx, error: updateErr } = await db
    .from("payment_transactions")
    .update(txPayload)
    .eq("provider", "yoco")
    .eq("order_id", orderId)
    .eq("provider_checkout_id", checkoutId)
    .select("id")
    .maybeSingle();

  if (updateErr) {
    log.error("yoco.webhook.transaction_update_failed", {
      orderId,
      checkoutId,
      eventId,
      err: updateErr.message,
    });
  }

  if (!updatedTx) {
    const { error: insertErr } = await db.from("payment_transactions").insert(txPayload);
    if (insertErr) {
      log.error("yoco.webhook.transaction_insert_failed", {
        orderId,
        checkoutId,
        eventId,
        err: insertErr.message,
      });
    }
  }

  // Only fulfil once: atomically transition to paid and only continue when this
  // invocation performed the transition.
  const { data: paidOrder, error: orderErr } = await db
    .from("orders")
    .update({ status: "paid" })
    .eq("id", orderId)
    .neq("status", "paid")
    .select("id, status")
    .maybeSingle();
  if (orderErr) {
    log.error("yoco.webhook.order_update_failed", { orderId, err: orderErr.message });
    return;
  }

  if (!paidOrder) {
    log.info("yoco.webhook.already_paid", { orderId, eventId: event.id });
    return;
  }

  // Decrement stock atomically per item. If any decrement returns null,
  // the order remains flagged for manual review via metadata.
  const { data: items } = await db
    .from("order_items")
    .select("product_id, quantity")
    .eq("order_id", orderId);

  const stockIssues: { productId: string; quantity: number }[] = [];
  for (const item of items || []) {
    const { data: newStock, error: rpcErr } = await db.rpc("decrement_stock", {
      p_product_id: item.product_id,
      p_qty: item.quantity,
    });
    if (rpcErr) {
      log.error("yoco.webhook.decrement_stock_rpc_error", {
        orderId,
        productId: item.product_id,
        err: rpcErr.message,
      });
      stockIssues.push({ productId: item.product_id, quantity: item.quantity });
      continue;
    }
    if (newStock === null) {
      stockIssues.push({ productId: item.product_id, quantity: item.quantity });
    }
  }

  if (stockIssues.length > 0) {
    log.warn("yoco.webhook.stock_flags", { orderId, stockIssues });
    await db
      .from("orders")
      .update({
        metadata: { stock_flags: stockIssues, flagged_at: new Date().toISOString() },
      })
      .eq("id", orderId);
  }

  log.info("yoco.webhook.paid", { orderId, eventId: event.id, paymentId });
}

async function processPaymentFailed(event: YocoWebhookEvent) {
  const db = supabaseAdmin();
  const eventId = event.id;
  const eventType = event.type;
  const payment = event.payload;
  const orderId = payment.metadata?.orderId || (await resolveOrderId(event));
  if (!orderId) {
    log.error("yoco.webhook.no_order_match_failed", { eventId });
    return;
  }

  const checkoutId = payment.metadata?.checkoutId || payment.checkoutId || null;
  const paymentId = payment.id || null;

  const txPayload = {
    order_id: orderId,
    provider: "yoco",
    provider_checkout_id: checkoutId,
    provider_payment_id: paymentId,
    provider_event_id: eventId,
    provider_status: "failed",
    amount_cents: payment.amount ?? 0,
    currency: payment.currency ?? "ZAR",
    processing_mode: payment.mode || processingMode(),
    raw_metadata_json: {
      eventId,
      eventType,
      payment,
    },
    failed_at: webhookEventTimestamp(event),
  };

  const { data: updatedTx, error: updateErr } = await db
    .from("payment_transactions")
    .update(txPayload)
    .eq("provider", "yoco")
    .eq("order_id", orderId)
    .eq("provider_checkout_id", checkoutId)
    .select("id")
    .maybeSingle();

  if (updateErr) {
    log.error("yoco.webhook.failed_transaction_update_failed", {
      orderId,
      checkoutId,
      eventId,
      err: updateErr.message,
    });
  }

  if (!updatedTx) {
    const { error: insertErr } = await db.from("payment_transactions").insert(txPayload);
    if (insertErr) {
      log.error("yoco.webhook.failed_transaction_insert_failed", {
        orderId,
        checkoutId,
        eventId,
        err: insertErr.message,
      });
    }
  }

  // Don't regress a succeeded order into payment_failed.
  const { data: current } = await db
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .single();
  if (current && current.status !== "paid") {
    await db.from("orders").update({ status: "payment_failed" }).eq("id", orderId);
  }

  log.info("yoco.webhook.failed", { orderId, eventId: event.id, paymentId });
}

async function resolveOrderId(event: YocoWebhookEvent): Promise<string | null> {
  const metadataOrderId = event.payload.metadata?.orderId;
  if (metadataOrderId) return metadataOrderId;

  const db = supabaseAdmin();

  const checkoutId = event.payload.checkoutId || event.payload.metadata?.checkoutId;
  if (checkoutId) {
    const { data } = await db
      .from("payment_transactions")
      .select("order_id")
      .eq("provider_checkout_id", checkoutId)
      .maybeSingle();
    if (data?.order_id) return data.order_id;
  }

  const externalId = event.payload.externalId;
  if (externalId) {
    const { data } = await db.from("orders").select("id").eq("id", externalId).maybeSingle();
    if (data?.id) return data.id;
  }

  return null;
}
