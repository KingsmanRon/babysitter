import test, { mock } from "node:test";
import assert from "node:assert/strict";
import {
  createYocoCheckout,
  extractPaymentMethod,
  handleYocoWebhook,
  recordPaymentSucceeded,
  SoldOutError,
  type YocoWebhookEvent,
} from "../lib/yoco.js";
import { setSupabaseAdminForTests } from "../lib/supabaseAdmin.js";
import { createFakeSupabase, pendingOrderState, type DbState } from "./fakeSupabase.js";
import { readRawBody } from "../lib/rawBody.js";
import { PassThrough } from "node:stream";
import type { IncomingMessage } from "node:http";

function paymentSucceededEvent(id: string, createdDate?: string): YocoWebhookEvent {
  return {
    id,
    type: "payment.succeeded",
    ...(createdDate === undefined ? {} : { createdDate }),
    payload: {
      id: `payment-${id}`,
      amount: 1000,
      currency: "ZAR",
      checkoutId: "checkout-1",
      metadata: { orderId: "order-1" },
    },
  };
}

function paymentFailedEvent(id: string, createdDate?: string): YocoWebhookEvent {
  return {
    id,
    type: "payment.failed",
    ...(createdDate === undefined ? {} : { createdDate }),
    payload: {
      id: `payment-${id}`,
      amount: 1000,
      currency: "ZAR",
      checkoutId: "checkout-1",
      metadata: { orderId: "order-1" },
    },
  };
}

test("duplicate payment.succeeded events decrement stock only for the paid transition", async () => {
  const state: DbState = {
    orders: [{ id: "order-1", status: "pending_payment" }],
    order_items: [{ order_id: "order-1", product_id: "product-1", size: "M", quantity: 2 }],
    payment_transactions: [{ id: "tx-1", order_id: "order-1", provider_checkout_id: "checkout-1", provider: "yoco" }],
    payment_webhook_events: [],
    decrementCalls: [],
  };
  setSupabaseAdminForTests(createFakeSupabase(state) as never);

  try {
    await handleYocoWebhook(paymentSucceededEvent("event-1"), {});
    await handleYocoWebhook(paymentSucceededEvent("event-2"), {});
  } finally {
    setSupabaseAdminForTests(null);
  }

  assert.equal(state.orders[0].status, "paid");
  assert.deepEqual(state.decrementCalls, [{ productId: "product-1", quantity: 2, size: "M" }]);
});

test("payment.succeeded stores paid_at from event.createdDate", async () => {
  const createdDate = "2026-06-24T10:11:12.000Z";
  const state: DbState = {
    orders: [{ id: "order-1", status: "pending_payment" }],
    order_items: [],
    payment_transactions: [{ id: "tx-1", order_id: "order-1", provider_checkout_id: "checkout-1", provider: "yoco" }],
    payment_webhook_events: [],
    decrementCalls: [],
  };
  setSupabaseAdminForTests(createFakeSupabase(state) as never);

  try {
    await handleYocoWebhook(paymentSucceededEvent("event-1", createdDate), {});
  } finally {
    setSupabaseAdminForTests(null);
  }

  assert.equal(state.payment_transactions[0].paid_at, createdDate);
});

test("payment.failed stores failed_at from event.createdDate", async () => {
  const createdDate = "2026-06-24T11:12:13.000Z";
  const state: DbState = {
    orders: [{ id: "order-1", status: "pending_payment" }],
    order_items: [],
    payment_transactions: [{ id: "tx-1", order_id: "order-1", provider_checkout_id: "checkout-1", provider: "yoco" }],
    payment_webhook_events: [],
    decrementCalls: [],
  };
  setSupabaseAdminForTests(createFakeSupabase(state) as never);

  try {
    await handleYocoWebhook(paymentFailedEvent("event-1", createdDate), {});
  } finally {
    setSupabaseAdminForTests(null);
  }

  assert.equal(state.payment_transactions[0].failed_at, createdDate);
});

test("missing or invalid createdDate falls back to the current timestamp without throwing", async () => {
  const now = new Date("2026-06-25T12:13:14.000Z");
  mock.timers.enable({ apis: ["Date"], now });

  try {
    for (const [event, expectedField] of [
      [paymentSucceededEvent("missing-created-date"), "paid_at"],
      [paymentFailedEvent("invalid-created-date", "not-a-date"), "failed_at"],
    ] as const) {
      const state: DbState = {
        orders: [{ id: "order-1", status: "pending_payment" }],
        order_items: [],
        payment_transactions: [{ id: "tx-1", order_id: "order-1", provider_checkout_id: "checkout-1", provider: "yoco" }],
        payment_webhook_events: [],
        decrementCalls: [],
      };
      setSupabaseAdminForTests(createFakeSupabase(state) as never);

      await assert.doesNotReject(handleYocoWebhook(event, {}));
      assert.equal(state.payment_transactions[0][expectedField], now.toISOString());
    }
  } finally {
    setSupabaseAdminForTests(null);
    mock.timers.reset();
  }
});

test("a verified delivery of an event that older code stored unverified still marks the order paid", async () => {
  const state = pendingOrderState();
  // Row left by the previous handler, which persisted bad-signature deliveries.
  state.payment_webhook_events.push({
    provider: "yoco",
    provider_event_id: "event-1",
    event_type: "payment.succeeded",
    signature_valid: false,
    payload_json: { forged: true },
  });
  setSupabaseAdminForTests(createFakeSupabase(state) as never);

  try {
    const result = await handleYocoWebhook(paymentSucceededEvent("event-1"), {});
    assert.equal(result.duplicate, undefined);
  } finally {
    setSupabaseAdminForTests(null);
  }

  assert.equal(state.orders[0].status, "paid");
  assert.equal(state.payment_webhook_events[0].signature_valid, true);
  assert.equal((state.payment_webhook_events[0].payload_json as { id: string }).id, "event-1");
  assert.ok(state.payment_webhook_events[0].processed_at);
  assert.equal(state.decrementCalls.length, 1);
});

test("replaying an already processed event is a no-op", async () => {
  const state = pendingOrderState();
  setSupabaseAdminForTests(createFakeSupabase(state) as never);

  try {
    await handleYocoWebhook(paymentSucceededEvent("event-1"), {});
    const replay = await handleYocoWebhook(paymentSucceededEvent("event-1"), {});
    assert.equal(replay.duplicate, true);
  } finally {
    setSupabaseAdminForTests(null);
  }

  assert.equal(state.decrementCalls.length, 1);
});

test("a failed paid transition throws so Yoco's retry can complete it", async () => {
  const state = { ...pendingOrderState(), failOrderUpdates: 1 };
  setSupabaseAdminForTests(createFakeSupabase(state) as never);

  try {
    await assert.rejects(handleYocoWebhook(paymentSucceededEvent("event-1"), {}));
    assert.equal(state.orders[0].status, "pending_payment");
    assert.equal(state.payment_webhook_events[0].processed_at, undefined);

    await handleYocoWebhook(paymentSucceededEvent("event-1"), {});
  } finally {
    setSupabaseAdminForTests(null);
  }

  assert.equal(state.orders[0].status, "paid");
  assert.equal(state.decrementCalls.length, 1);
});

test("readRawBody returns the exact bytes after Vercel's helpers buffer and replay the body", async () => {
  // Mirrors @vercel/node's addHelpers: the original stream is drained, the body
  // is replayed via patched data/end listeners, and req.body is parsed JSON.
  const raw = Buffer.from('{"id":"evt_1",  "type":"payment.succeeded"}');
  const original = new PassThrough();
  original.end();
  original.resume();
  await new Promise((resolve) => original.on("end", resolve));

  const replay = new PassThrough();
  const replayOn = replay.on.bind(replay);
  const originalOn = original.on.bind(original);
  const req = original as unknown as IncomingMessage & { body: unknown };
  req.read = replay.read.bind(replay);
  req.on = req.addListener = ((name: string, cb: (...args: unknown[]) => void) =>
    name === "data" || name === "end" ? replayOn(name, cb) : originalOn(name, cb)) as unknown as typeof req.on;
  req.body = JSON.parse(raw.toString());
  replay.end(raw);

  assert.deepEqual(await readRawBody(req), raw);
});

test("a paid order whose stock is gone is flagged for a refund", async () => {
  const state = { ...pendingOrderState(), soldOut: true };
  setSupabaseAdminForTests(createFakeSupabase(state) as never);

  try {
    await handleYocoWebhook(paymentSucceededEvent("event-1"), {});
  } finally {
    setSupabaseAdminForTests(null);
  }

  assert.equal(state.orders[0].status, "paid");
  assert.deepEqual((state.orders[0].metadata as { stock_flags?: unknown } | undefined)?.stock_flags, [{ productId: "product-1", size: "M", quantity: 1 }]);
});

test("checkout refuses to start when the order's stock can no longer be held", async () => {
  const state = { ...pendingOrderState(), soldOut: true };
  state.orders[0] = { ...state.orders[0], order_number: "BS-1", amount_cents: 60000, currency: "ZAR" };
  setSupabaseAdminForTests(createFakeSupabase(state) as never);
  process.env.YOCO_SECRET_KEY = "sk_test_unused";
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    throw new Error("Yoco must not be called");
  });

  try {
    await assert.rejects(createYocoCheckout("order-1"), SoldOutError);
    assert.equal(fetchMock.mock.callCount(), 0);
  } finally {
    fetchMock.mock.restore();
    setSupabaseAdminForTests(null);
    delete process.env.YOCO_SECRET_KEY;
  }
});

// ── Idempotency ─────────────────────────────────────────────────

function withSetup(state: DbState, fn: () => Promise<void>) {
  setSupabaseAdminForTests(createFakeSupabase(state) as never);
  return fn().finally(() => setSupabaseAdminForTests(null));
}

// Shape documented by Yoco for payment.succeeded.
function documentedSucceededEvent(eventId: string, paymentId = "p_rEy7ezAYVoXSYJafPKwc6vRx"): YocoWebhookEvent {
  return {
    id: eventId,
    type: "payment.succeeded",
    createdDate: "2026-10-02T07:51:15.000Z",
    payload: {
      id: paymentId,
      type: "payment",
      status: "succeeded",
      amount: 60000,
      currency: "ZAR",
      mode: "live",
      metadata: { checkoutId: "checkout-1", orderId: "order-1", orderNumber: "BS-1" },
      paymentMethodDetails: {
        type: "card",
        card: { expiryMonth: 11, expiryYear: 28, maskedCard: "************6972", scheme: "visa" },
      },
    },
  };
}

test("the same payment under two different event ids is recorded once and fulfilled once", async () => {
  const state = pendingOrderState();
  await withSetup(state, async () => {
    await handleYocoWebhook(documentedSucceededEvent("evt_a"), {});
    await handleYocoWebhook(documentedSucceededEvent("evt_b"), {});
  });

  assert.equal(state.payment_transactions.length, 1);
  assert.equal(state.payment_transactions[0].provider_payment_id, "p_rEy7ezAYVoXSYJafPKwc6vRx");
  assert.equal(state.decrementCalls.length, 1);
  assert.equal(state.payment_webhook_events.length, 2);
});

test("a payment without a checkout id updates the order's checkout row instead of adding a second row", async () => {
  const state = pendingOrderState();
  const event = documentedSucceededEvent("evt_a");
  delete event.payload.metadata!.checkoutId;
  await withSetup(state, () => handleYocoWebhook(event, {}).then(() => undefined));

  assert.equal(state.payment_transactions.length, 1);
  assert.equal(state.payment_transactions[0].id, "tx-1");
  assert.ok(state.payment_transactions[0].paid_at);
  assert.equal(state.orders[0].status, "paid");
});

test("a decline delivered after the payment succeeded leaves the paid row and order alone", async () => {
  const state = pendingOrderState();
  const declined: YocoWebhookEvent = {
    id: "evt_declined",
    type: "payment.failed",
    payload: { id: "p_declined", status: "failed", amount: 60000, currency: "ZAR", metadata: { checkoutId: "checkout-1", orderId: "order-1" } },
  };
  await withSetup(state, async () => {
    await handleYocoWebhook(documentedSucceededEvent("evt_ok"), {});
    await handleYocoWebhook(declined, {});
  });

  assert.equal(state.orders[0].status, "paid");
  assert.equal(state.payment_transactions[0].provider_status, "succeeded");
  assert.equal(state.payment_transactions[0].failed_at, null);
});

test("a decline on an open checkout is recorded and marks the order payment_failed", async () => {
  const state = pendingOrderState();
  const declined: YocoWebhookEvent = {
    id: "evt_declined",
    type: "payment.failed",
    createdDate: "2026-10-02T08:00:00.000Z",
    payload: { id: "p_declined", status: "failed", amount: 60000, currency: "ZAR", metadata: { checkoutId: "checkout-1", orderId: "order-1" } },
  };
  await withSetup(state, () => handleYocoWebhook(declined, {}).then(() => undefined));

  assert.equal(state.orders[0].status, "payment_failed");
  assert.equal(state.payment_transactions[0].provider_status, "failed");
  assert.equal(state.payment_transactions[0].failed_at, "2026-10-02T08:00:00.000Z");
});

// ── Payment method ─────────────────────────────────────────────

test("card brand and last 4 are stored from Yoco's documented payload", async () => {
  const state = pendingOrderState();
  await withSetup(state, () => handleYocoWebhook(documentedSucceededEvent("evt_a"), {}).then(() => undefined));

  const tx = state.payment_transactions[0];
  assert.equal(tx.payment_method_type, "card");
  assert.equal(tx.payment_method_brand, "visa");
  assert.equal(tx.payment_method_last4, "6972");
});

test("extractPaymentMethod handles flat card fields and card-less methods", () => {
  assert.deepEqual(extractPaymentMethod({ type: "card", scheme: "mastercard", maskedCard: "5200 **** **** 0007" }), {
    type: "card",
    brand: "mastercard",
    last4: "0007",
  });
  assert.deepEqual(extractPaymentMethod({ type: "instant_eft" }), { type: "instant_eft", brand: null, last4: null });
  assert.deepEqual(extractPaymentMethod(undefined), { type: null, brand: null, last4: null });
});

test("a later write without card details never blanks the stored card", async () => {
  const state = pendingOrderState();
  await withSetup(state, async () => {
    await handleYocoWebhook(documentedSucceededEvent("evt_a"), {});
    await recordPaymentSucceeded({
      orderId: "order-1",
      checkoutId: "checkout-1",
      paymentId: "p_rEy7ezAYVoXSYJafPKwc6vRx",
      eventId: null,
      amountCents: 60000,
      currency: "ZAR",
      mode: null,
      method: null,
      paidAt: new Date().toISOString(),
      raw: { reconciledAt: "now" },
      source: "reconcile",
    });
  });

  const tx = state.payment_transactions[0];
  assert.equal(tx.payment_method_brand, "visa");
  assert.equal(tx.payment_method_last4, "6972");
  assert.equal(tx.paid_at, "2026-10-02T07:51:15.000Z");
  assert.equal(state.decrementCalls.length, 1);
});
