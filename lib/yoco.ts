import crypto from "node:crypto";
import { env, processingMode } from "./env.js";
import { log } from "./logger.js";
import { supabaseAdmin } from "./supabaseAdmin.js";
import { YOCO_API_BASE } from "./yocoApi.js";

const YOCO_CHECKOUT_URL = `${YOCO_API_BASE}/checkouts`;

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
export class SoldOutError extends Error {
  constructor() {
    super("Sorry, that size just sold out. Pick another size.");
    this.name = "SoldOutError";
  }
}

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

  // Restart the stock hold for the time the buyer spends on Yoco's page. If
  // the hold already lapsed and the units went to someone else, stop here
  // rather than take a payment we can't fulfil.
  const { data: reserved, error: reserveErr } = await db.rpc("reserve_order_stock", {
    p_order_id: order.id,
  });
  if (reserveErr) {
    log.error("yoco.create_checkout.reserve_failed", { orderId, err: reserveErr.message });
    throw new Error("Failed to reserve stock");
  }
  if (reserved !== true) {
    throw new SoldOutError();
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

  // A buyer retrying after a decline or an expired checkout reopens the order,
  // so reconciliation keeps watching it.
  const { error: orderUpdateErr } = await db
    .from("orders")
    .update({ status: "pending_payment" })
    .eq("id", order.id)
    .in("status", ["draft", "pending_payment", "payment_failed", "expired"]);
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
// Yoco signs webhooks with the Standard Webhooks (Svix) scheme:
//   signed content = `${webhook-id}.${webhook-timestamp}.${raw body bytes}`
//   key            = base64-decode(secret without its "whsec_" prefix)
//   signature      = base64(HMAC-SHA256(key, signed content))
// webhook-signature holds space-separated "v1,<signature>" entries and any one
// may match. Yoco recommends rejecting timestamps more than 3 minutes off.
export const MAX_WEBHOOK_AGE_SECONDS = 3 * 60;

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export function verifyYocoWebhook(
  headers: Record<string, string | string[] | undefined>,
  rawBody: Buffer,
  nowMs: number = Date.now(),
): VerifyResult {
  const secret = env.YOCO_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return { ok: false, reason: "YOCO_WEBHOOK_SECRET not configured" };
  }

  const webhookId = header(headers, "webhook-id");
  const webhookTimestamp = header(headers, "webhook-timestamp");
  const webhookSignature = header(headers, "webhook-signature");
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return { ok: false, reason: "missing webhook-* headers" };
  }

  if (!/^\d+$/.test(webhookTimestamp)) {
    return { ok: false, reason: "invalid webhook-timestamp" };
  }
  const ageSeconds = Math.abs(Math.floor(nowMs / 1000) - Number(webhookTimestamp));
  if (ageSeconds > MAX_WEBHOOK_AGE_SECONDS) {
    return { ok: false, reason: `stale webhook (${ageSeconds}s old)` };
  }

  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret, "base64");
  if (key.length === 0) {
    return { ok: false, reason: "invalid webhook secret encoding" };
  }

  const expected = Buffer.from(computeSignature(key, webhookId, webhookTimestamp, rawBody));

  for (const entry of webhookSignature.split(" ")) {
    const [version, value] = entry.split(",", 2);
    if (version !== "v1" || !value) continue;
    const candidate = Buffer.from(value);
    if (candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected)) {
      return { ok: true };
    }
  }
  return { ok: false, reason: "signature mismatch" };
}

// HMAC the exact request bytes; never re-serialised JSON.
function computeSignature(key: Buffer, webhookId: string, webhookTimestamp: string, rawBody: Buffer): string {
  return crypto
    .createHmac("sha256", key)
    .update(`${webhookId}.${webhookTimestamp}.`)
    .update(rawBody)
    .digest("base64");
}

// Produces the webhook-signature header value Yoco would send. Used by tests
// and scripts/send-test-webhook.ts to exercise the real verification path.
export function signYocoWebhook(secret: string, webhookId: string, webhookTimestamp: string, rawBody: Buffer): string {
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret, "base64");
  return `v1,${computeSignature(key, webhookId, webhookTimestamp, rawBody)}`;
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
// handleYocoWebhook — persist + fulfil a VERIFIED event
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

// Callers must only pass events whose signature verified: nothing here
// re-checks it, and unverified deliveries are never stored.
export async function handleYocoWebhook(
  event: YocoWebhookEvent,
  rawHeaders: Record<string, string | string[] | undefined>,
): Promise<{ ok: true; duplicate?: boolean }> {
  const db = supabaseAdmin();

  const webhookId = header(rawHeaders, "webhook-id") || null;
  const webhookTimestamp = header(rawHeaders, "webhook-timestamp") || null;

  // Unique constraint on (provider, provider_event_id) makes a replay of the
  // same event a no-op once it has been processed.
  const { error: insertErr } = await db.from("payment_webhook_events").insert({
    provider: "yoco",
    provider_event_id: event.id,
    event_type: event.type,
    webhook_id: webhookId,
    webhook_timestamp: webhookTimestamp,
    signature_valid: true,
    payload_json: event as unknown as Record<string, unknown>,
  });
  if (insertErr) {
    if (insertErr.code !== "23505") {
      log.error("yoco.webhook.insert_failed", { eventId: event.id, err: insertErr.message });
      throw new Error("Failed to persist webhook event");
    }

    // Seen this event before. Skip it only if it was actually processed: an
    // earlier delivery may have failed partway, and Yoco's retry has to be
    // allowed to finish the job. Fulfilment is guarded by the paid transition,
    // so reprocessing never double-commits stock.
    const { data: existing, error: existingErr } = await db
      .from("payment_webhook_events")
      .select("processed_at, signature_valid")
      .eq("provider", "yoco")
      .eq("provider_event_id", event.id)
      .maybeSingle();
    if (existingErr) {
      log.error("yoco.webhook.lookup_failed", { eventId: event.id, err: existingErr.message });
      throw new Error("Failed to look up webhook event");
    }
    if (existing?.processed_at) {
      log.info("yoco.webhook.duplicate", { eventId: event.id, type: event.type });
      return { ok: true, duplicate: true };
    }
    if (existing && !existing.signature_valid) {
      // Row left by older code that stored unverified deliveries: replace its
      // untrusted payload with this verified one.
      await db
        .from("payment_webhook_events")
        .update({
          signature_valid: true,
          event_type: event.type,
          webhook_id: webhookId,
          webhook_timestamp: webhookTimestamp,
          payload_json: event as unknown as Record<string, unknown>,
        })
        .eq("provider", "yoco")
        .eq("provider_event_id", event.id);
    }
    log.info("yoco.webhook.retry_unprocessed", { eventId: event.id, type: event.type });
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
// Payment method details
// ──────────────────────────────────────────────────────────────
export type PaymentMethodInfo = { type: string | null; brand: string | null; last4: string | null };

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Yoco documents paymentMethodDetails as { type: "card", card: { scheme,
// maskedCard } }. Accept the card fields at the top level too, and keep the
// method type even when there is no card (e.g. a wallet or EFT payment), so
// admin can still show how the buyer paid.
export function extractPaymentMethod(details: unknown): PaymentMethodInfo {
  if (!details || typeof details !== "object") return { type: null, brand: null, last4: null };
  const d = details as Record<string, unknown>;
  const card = (d.card && typeof d.card === "object" ? d.card : d) as Record<string, unknown>;
  const brand = text(card.scheme) ?? text(card.brand) ?? text(card.cardBrand) ?? text(card.network);
  const masked = text(card.maskedCard) ?? text(card.maskedPan) ?? text(card.last4) ?? text(card.lastFour);
  const digits = masked ? masked.replace(/\D/g, "") : "";
  return { type: text(d.type), brand, last4: digits.length >= 4 ? digits.slice(-4) : null };
}

// ──────────────────────────────────────────────────────────────
// Recording payment outcomes (shared by webhook + reconciliation)
// ──────────────────────────────────────────────────────────────
type TransactionRow = {
  id: string;
  order_id: string;
  paid_at: string | null;
  raw_metadata_json: Record<string, unknown> | null;
};

// Find the lifecycle row for a payment: by checkout id, then payment id, then
// the order's newest checkout row that no payment has claimed yet. Never filter
// on a null id: `eq(col, null)` matches nothing, which used to send payments
// without a checkout id down the insert path and leave a second row behind.
async function findTransaction(
  orderId: string,
  checkoutId: string | null,
  paymentId: string | null,
): Promise<TransactionRow | null> {
  const db = supabaseAdmin();
  const columns = "id, order_id, paid_at, raw_metadata_json";
  for (const [column, value] of [
    ["provider_checkout_id", checkoutId],
    ["provider_payment_id", paymentId],
  ] as const) {
    if (!value) continue;
    const { data, error } = await db
      .from("payment_transactions")
      .select(columns)
      .eq("provider", "yoco")
      .eq(column, value)
      .maybeSingle();
    if (error) throw new Error(`payment_transactions lookup failed: ${error.message}`);
    if (data) return data as TransactionRow;
  }
  if (checkoutId) return null;

  const { data, error } = await db
    .from("payment_transactions")
    .select(columns)
    .eq("provider", "yoco")
    .eq("order_id", orderId)
    .is("paid_at", null)
    .is("provider_payment_id", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`payment_transactions lookup failed: ${error.message}`);
  return ((data as TransactionRow[] | null) ?? [])[0] ?? null;
}

async function writeTransaction(
  orderId: string,
  existing: TransactionRow | null,
  fields: Record<string, unknown>,
  insertDefaults: Record<string, unknown>,
): Promise<string | null> {
  const db = supabaseAdmin();
  if (existing) {
    const { error } = await db.from("payment_transactions").update(fields).eq("id", existing.id);
    return error ? error.message : null;
  }
  const { error } = await db
    .from("payment_transactions")
    .insert({ order_id: orderId, provider: "yoco", ...insertDefaults, ...fields });
  // A concurrent delivery inserted the same row first; theirs is equivalent.
  if (error && error.code !== "23505") return error.message;
  return null;
}

export type SucceededPayment = {
  orderId: string;
  checkoutId: string | null;
  paymentId: string | null;
  eventId: string | null;
  amountCents: number | null;
  currency: string | null;
  mode: string | null;
  method: PaymentMethodInfo | null;
  paidAt: string;
  raw: Record<string, unknown>;
  source: "webhook" | "reconcile";
};

// Records a successful payment and marks the order paid. Safe to call any
// number of times for the same payment: only the call that moves the order to
// paid commits stock. Returns whether this call performed that transition.
export async function recordPaymentSucceeded(p: SucceededPayment): Promise<{ transitioned: boolean }> {
  const db = supabaseAdmin();

  let existing: TransactionRow | null = null;
  let txErr: string | null = null;
  try {
    existing = await findTransaction(p.orderId, p.checkoutId, p.paymentId);
  } catch (err) {
    txErr = (err as Error).message;
  }

  if (!txErr) {
    // Only overwrite fields we actually know, so a reconciliation pass (which
    // has no card details) never blanks what a webhook recorded.
    const fields: Record<string, unknown> = {
      provider_status: "succeeded",
      paid_at: existing?.paid_at ?? p.paidAt,
      failed_at: null,
      raw_metadata_json: { ...(existing?.raw_metadata_json ?? {}), ...p.raw },
    };
    if (p.checkoutId) fields.provider_checkout_id = p.checkoutId;
    if (p.paymentId) fields.provider_payment_id = p.paymentId;
    if (p.eventId) fields.provider_event_id = p.eventId;
    if (p.amountCents != null) fields.amount_cents = p.amountCents;
    if (p.currency) fields.currency = p.currency;
    if (p.mode) fields.processing_mode = p.mode;
    if (p.method?.type) fields.payment_method_type = p.method.type;
    if (p.method?.brand) fields.payment_method_brand = p.method.brand;
    if (p.method?.last4) fields.payment_method_last4 = p.method.last4;

    txErr = await writeTransaction(p.orderId, existing, fields, {
      amount_cents: 0,
      currency: "ZAR",
      processing_mode: processingMode(),
    });
  }
  if (txErr) {
    // The money is taken either way; still mark the order paid below.
    log.error(`yoco.${p.source}.transaction_write_failed`, {
      orderId: p.orderId,
      checkoutId: p.checkoutId,
      paymentId: p.paymentId,
      err: txErr,
    });
  }

  // Only fulfil once: atomically transition to paid and only continue when this
  // invocation performed the transition.
  const { data: paidOrder, error: orderErr } = await db
    .from("orders")
    .update({ status: "paid" })
    .eq("id", p.orderId)
    .neq("status", "paid")
    .select("id, status")
    .maybeSingle();
  if (orderErr) {
    log.error(`yoco.${p.source}.order_update_failed`, { orderId: p.orderId, err: orderErr.message });
    // Throw so the event stays unprocessed and Yoco's retry can mark it paid.
    throw new Error("Failed to mark order paid");
  }

  if (!paidOrder) {
    log.info(`yoco.${p.source}.already_paid`, { orderId: p.orderId, eventId: p.eventId, paymentId: p.paymentId });
    return { transitioned: false };
  }

  // Turn the stock hold into a sale. If the hold expired and the units were
  // sold to someone else meanwhile, the order is paid but can't be fulfilled:
  // flag it so it shows up for a refund.
  const { data: committed, error: commitErr } = await db.rpc("commit_order_stock", {
    p_order_id: p.orderId,
  });
  if (commitErr || committed !== true) {
    if (commitErr) {
      log.error(`yoco.${p.source}.commit_stock_rpc_error`, { orderId: p.orderId, err: commitErr.message });
    }
    const { data: items } = await db
      .from("order_items")
      .select("product_id, size, quantity")
      .eq("order_id", p.orderId);
    const stockIssues = (items || []).map((item) => ({
      productId: item.product_id,
      size: item.size ?? null,
      quantity: item.quantity,
    }));
    log.warn(`yoco.${p.source}.stock_flags`, { orderId: p.orderId, stockIssues });
    await db
      .from("orders")
      .update({
        metadata: { stock_flags: stockIssues, flagged_at: new Date().toISOString() },
      })
      .eq("id", p.orderId);
  }

  log.info(`yoco.${p.source}.paid`, { orderId: p.orderId, eventId: p.eventId, paymentId: p.paymentId });
  return { transitioned: true };
}

// ──────────────────────────────────────────────────────────────
async function processPaymentSucceeded(event: YocoWebhookEvent) {
  const payment = event.payload;
  const orderId = await resolveOrderId(event);
  if (!orderId) {
    log.error("yoco.webhook.no_order_match", { eventId: event.id });
    return;
  }

  const method = extractPaymentMethod(payment.paymentMethodDetails);
  if (!method.brand) {
    // Record the shape (keys only) so a missing card brand can be diagnosed.
    const details = payment.paymentMethodDetails as Record<string, unknown> | undefined;
    log.warn("yoco.webhook.payment_method_incomplete", {
      eventId: event.id,
      paymentId: payment.id,
      methodType: method.type,
      detailKeys: details ? Object.keys(details) : null,
      cardKeys: details?.card && typeof details.card === "object" ? Object.keys(details.card) : null,
    });
  }

  await recordPaymentSucceeded({
    orderId,
    checkoutId: text(payment.metadata?.checkoutId) ?? text(payment.checkoutId),
    paymentId: text(payment.id),
    eventId: event.id,
    amountCents: typeof payment.amount === "number" ? payment.amount : null,
    currency: text(payment.currency),
    mode: text(payment.mode),
    method,
    paidAt: webhookEventTimestamp(event),
    raw: { eventId: event.id, eventType: event.type, payment },
    source: "webhook",
  });
}

async function processPaymentFailed(event: YocoWebhookEvent) {
  const db = supabaseAdmin();
  const payment = event.payload;
  const orderId = await resolveOrderId(event);
  if (!orderId) {
    log.error("yoco.webhook.no_order_match_failed", { eventId: event.id });
    return;
  }

  const checkoutId = text(payment.metadata?.checkoutId) ?? text(payment.checkoutId);
  const paymentId = text(payment.id);

  let existing: TransactionRow | null = null;
  let txErr: string | null = null;
  try {
    existing = await findTransaction(orderId, checkoutId, paymentId);
  } catch (err) {
    txErr = (err as Error).message;
  }

  if (existing?.paid_at) {
    // A decline that arrives after (or is retried after) a successful attempt
    // on the same checkout must not turn the paid row into a failed one.
    log.info("yoco.webhook.failed_after_paid_ignored", { orderId, eventId: event.id, paymentId });
  } else if (!txErr) {
    const method = extractPaymentMethod(payment.paymentMethodDetails);
    const fields: Record<string, unknown> = {
      provider_status: "failed",
      failed_at: webhookEventTimestamp(event),
      provider_event_id: event.id,
      raw_metadata_json: {
        ...(existing?.raw_metadata_json ?? {}),
        eventId: event.id,
        eventType: event.type,
        payment,
      },
    };
    if (checkoutId) fields.provider_checkout_id = checkoutId;
    if (paymentId) fields.provider_payment_id = paymentId;
    if (method.type) fields.payment_method_type = method.type;
    if (method.brand) fields.payment_method_brand = method.brand;
    if (method.last4) fields.payment_method_last4 = method.last4;
    txErr = await writeTransaction(orderId, existing, fields, {
      amount_cents: typeof payment.amount === "number" ? payment.amount : 0,
      currency: text(payment.currency) ?? "ZAR",
      processing_mode: text(payment.mode) ?? processingMode(),
    });
  }
  if (txErr) {
    log.error("yoco.webhook.failed_transaction_write_failed", { orderId, checkoutId, eventId: event.id, err: txErr });
  }

  // Atomic: never regresses a paid (or expired) order.
  await db
    .from("orders")
    .update({ status: "payment_failed" })
    .eq("id", orderId)
    .in("status", ["draft", "pending_payment"]);

  log.info("yoco.webhook.failed", { orderId, eventId: event.id, paymentId });
}

async function resolveOrderId(event: YocoWebhookEvent): Promise<string | null> {
  const metadataOrderId = text(event.payload.metadata?.orderId);
  if (metadataOrderId) return metadataOrderId;

  const db = supabaseAdmin();

  const checkoutId = text(event.payload.checkoutId) ?? text(event.payload.metadata?.checkoutId);
  if (checkoutId) {
    const { data } = await db
      .from("payment_transactions")
      .select("order_id")
      .eq("provider_checkout_id", checkoutId)
      .maybeSingle();
    if (data?.order_id) return data.order_id;
  }

  const externalId = text(event.payload.externalId);
  if (externalId) {
    const { data } = await db.from("orders").select("id").eq("id", externalId).maybeSingle();
    if (data?.id) return data.id;
  }

  return null;
}
