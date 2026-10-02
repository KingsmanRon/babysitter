import test, { mock } from "node:test";
import assert from "node:assert/strict";
import handler from "../api/admin/orders/[id]/email.js";
import { buildConfirmationEmail, confirmationMailto, sendOrderConfirmation, type EmailOrder } from "../lib/confirmationEmail.js";
import { handleYocoWebhook, type YocoWebhookEvent } from "../lib/yoco.js";
import { setSupabaseAdminForTests } from "../lib/supabaseAdmin.js";
import { createFakeSupabase, type DbState } from "./fakeSupabase.js";

const SITE = "https://babysitterbs.co.za";
const tee = "S'MILANO SAVED MY LIFE";

function order(overrides: Partial<EmailOrder> = {}): EmailOrder & Record<string, unknown> {
  return {
    id: "o-1",
    order_number: "BS-4BVRO6IR",
    status: "paid",
    customer_name: "letsie Moletsane",
    customer_email: "letsie@example.com",
    amount_cents: 60000,
    delivery_fee_cents: 10000,
    fulfilment_method: "delivery",
    ship_suburb: "Obroholzer",
    ship_city: "Carletonville",
    created_at: "2026-10-02T08:00:00Z",
    ...overrides,
  };
}

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return fn().finally(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

// ── Content ────────────────────────────────────────────────────

test("builds the personalised confirmation with items, total and a direct tracking link", async () => {
  await withEnv({ PUBLIC_SITE_URL: SITE }, async () => {
    const email = buildConfirmationEmail(order(), [{ product_name: tee, size: "M", quantity: 1 }])!;
    assert.equal(email.to, "letsie@example.com");
    assert.equal(email.subject, "Your BABYSITTER order BS-4BVRO6IR is confirmed");
    assert.match(email.text, /^Hi Letsie,/);
    assert.match(email.text, /S'MILANO SAVED MY LIFE · Size M × 1/);
    assert.match(email.text, /Total R600 \(incl\. R100 delivery\)/);
    assert.match(email.text, /Delivering to Obroholzer, Carletonville/);
    assert.match(email.text, /Track your order: https:\/\/babysitterbs\.co\.za\/track\/o-1/);
    assert.ok(email.html.includes(`${SITE}/email/thanks-smilano.jpg`));
    assert.ok(email.html.includes('alt="S\'MILANO SAVED MY LIFE. Thanks for shopping with us."'));
    assert.ok(email.html.includes(`href="${SITE}/track/o-1"`));
  });
});

test("collection orders, missing names and HTML in names are handled", async () => {
  await withEnv({ PUBLIC_SITE_URL: SITE }, async () => {
    const collection = buildConfirmationEmail(order({ fulfilment_method: "collection", delivery_fee_cents: 0, customer_name: null }), [])!;
    assert.match(collection.text, /^Hi there,/);
    assert.match(collection.text, /Collection: we'll WhatsApp you to arrange pickup\./);
    assert.match(collection.text, /Total R600\n/);

    const hostile = buildConfirmationEmail(order({ customer_name: "<script>alert(1)</script>" }), [])!;
    assert.ok(!hostile.html.includes("<script>alert"));
    assert.ok(hostile.html.includes("&lt;script&gt;"));

    assert.equal(buildConfirmationEmail(order({ customer_email: "  " }), []), null);
  });
});

test("the manual fallback is a mailto with the plain-text version", async () => {
  await withEnv({ PUBLIC_SITE_URL: SITE }, async () => {
    const email = buildConfirmationEmail(order(), [{ product_name: tee, size: "M", quantity: 1 }])!;
    const mailto = confirmationMailto(email);
    assert.ok(mailto.startsWith("mailto:letsie%40example.com?subject="));
    const params = new URLSearchParams(mailto.split("?")[1]);
    assert.equal(params.get("subject"), email.subject);
    assert.equal(params.get("body"), email.text);
  });
});

// ── Sending ────────────────────────────────────────────────────

function emailState(overrides: Record<string, unknown> = {}): DbState {
  return {
    orders: [order(overrides)],
    order_items: [{ order_id: "o-1", product_name: tee, size: "M", quantity: 1 }],
    payment_transactions: [],
    payment_webhook_events: [],
    decrementCalls: [],
  };
}

async function withDb<T>(state: DbState, fetchImpl: (url: string, init: RequestInit) => Promise<Response>, fn: () => Promise<T>) {
  setSupabaseAdminForTests(createFakeSupabase(state) as never);
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock = mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return fetchImpl(url, init);
  });
  const quiet = [mock.method(console, "log", () => {}), mock.method(console, "error", () => {}), mock.method(console, "warn", () => {})];
  try {
    return { result: await fn(), calls };
  } finally {
    fetchMock.mock.restore();
    quiet.forEach((q) => q.mock.restore());
    setSupabaseAdminForTests(null);
  }
}

const resendOk = async () => new Response(JSON.stringify({ id: "re_123" }), { status: 200 });

test("without RESEND_API_KEY nothing is sent", async () => {
  const state = emailState();
  const { result, calls } = await withEnv({ RESEND_API_KEY: undefined }, () => withDb(state, resendOk, () => sendOrderConfirmation("o-1")));
  assert.deepEqual(result, { status: "not_configured" });
  assert.equal(calls.length, 0);
  assert.equal(state.orders[0].confirmation_email_sent_at, undefined);
});

test("sends through Resend and records it on the order", async () => {
  const state = emailState();
  const { result, calls } = await withEnv({ RESEND_API_KEY: "re_test", PUBLIC_SITE_URL: SITE, EMAIL_FROM: undefined }, () =>
    withDb(state, resendOk, () => sendOrderConfirmation("o-1")),
  );
  assert.equal(result.status, "sent");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer re_test");
  assert.equal(headers["Idempotency-Key"], "order-confirmation-o-1");
  const body = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(body.to, ["letsie@example.com"]);
  assert.equal(body.from, "BABYSITTER <orders@babysitterbs.co.za>");
  assert.equal(body.reply_to, "babysitterbs9@gmail.com");
  assert.ok(state.orders[0].confirmation_email_sent_at);
  assert.equal(state.orders[0].confirmation_email_id, "re_123");
  assert.equal(state.orders[0].confirmation_email_error, null);
});

test("a failed send is recorded, not thrown", async () => {
  const state = emailState();
  const { result } = await withEnv({ RESEND_API_KEY: "re_test" }, () =>
    withDb(state, async () => new Response(JSON.stringify({ message: "The babysitterbs.co.za domain is not verified." }), { status: 403 }), () =>
      sendOrderConfirmation("o-1"),
    ),
  );
  assert.equal(result.status, "failed");
  assert.equal(state.orders[0].confirmation_email_error, "The babysitterbs.co.za domain is not verified.");
  assert.equal(state.orders[0].confirmation_email_sent_at, undefined);
});

test("unpaid orders are never emailed", async () => {
  const state = emailState({ status: "pending_payment" });
  const { result, calls } = await withEnv({ RESEND_API_KEY: "re_test" }, () => withDb(state, resendOk, () => sendOrderConfirmation("o-1")));
  assert.deepEqual(result, { status: "skipped", reason: "not_paid" });
  assert.equal(calls.length, 0);
});

// ── Automatic send on payment ──────────────────────────────────

function paidEvent(id: string): YocoWebhookEvent {
  return { id, type: "payment.succeeded", payload: { id: "p-1", amount: 60000, currency: "ZAR", metadata: { orderId: "o-1", checkoutId: "ch-1" } } };
}

test("a payment sends the confirmation once; webhook replays don't resend", async () => {
  const state = emailState({ status: "pending_payment" });
  const { calls } = await withEnv({ RESEND_API_KEY: "re_test" }, () =>
    withDb(state, resendOk, async () => {
      await handleYocoWebhook(paidEvent("evt-1"), {});
      await handleYocoWebhook(paidEvent("evt-1"), {});
      await handleYocoWebhook(paidEvent("evt-2"), {});
    }),
  );
  assert.equal(state.orders[0].status, "paid");
  assert.equal(calls.filter((c) => c.url.includes("resend")).length, 1);
  assert.ok(state.orders[0].confirmation_email_sent_at);
});

test("an email outage never fails the payment", async () => {
  const state = emailState({ status: "pending_payment" });
  await withEnv({ RESEND_API_KEY: "re_test" }, () =>
    withDb(state, async () => {
      throw new Error("network down");
    }, async () => {
      await assert.doesNotReject(handleYocoWebhook(paidEvent("evt-1"), {}));
    }),
  );
  assert.equal(state.orders[0].status, "paid");
  assert.equal(state.orders[0].confirmation_email_error, "network down");
  assert.ok(state.payment_webhook_events[0].processed_at);
});

// ── Admin endpoint ─────────────────────────────────────────────

async function callEndpoint(state: DbState, mode: unknown, env: Record<string, string | undefined> = {}) {
  const res = {
    statusCode: 0,
    body: undefined as Record<string, string> | undefined,
    setHeader() {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: never) {
      this.body = payload;
      return this;
    },
  };
  await withEnv({ ADMIN_TOKEN: "admin-secret", PUBLIC_SITE_URL: SITE, ...env }, () =>
    withDb(state, resendOk, () =>
      handler({ method: "POST", headers: { "x-admin-token": "admin-secret" }, query: { id: "o-1" }, body: { mode } } as never, res as never),
    ),
  );
  return res;
}

test("Email manually returns the mailto link and notes it", async () => {
  const state = emailState();
  const res = await callEndpoint(state, "manual", { RESEND_API_KEY: undefined });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body!.mailto.startsWith("mailto:letsie%40example.com?"));
  assert.ok(state.orders[0].confirmation_email_manual_at);
});

test("Send email resends, or says why it can't", async () => {
  const sent = await callEndpoint(emailState({ confirmation_email_sent_at: "2026-10-02T09:00:00Z" }), "send", { RESEND_API_KEY: "re_test" });
  assert.equal(sent.statusCode, 200);

  const notConfigured = await callEndpoint(emailState(), "send", { RESEND_API_KEY: undefined });
  assert.equal(notConfigured.statusCode, 503);
  assert.equal(notConfigured.body!.reason, "not_configured");

  const unpaid = await callEndpoint(emailState({ status: "pending_payment" }), "manual");
  assert.equal(unpaid.statusCode, 409);

  const noEmail = await callEndpoint(emailState({ customer_email: null }), "manual");
  assert.equal(noEmail.statusCode, 422);

  const badMode = await callEndpoint(emailState(), "fax");
  assert.equal(badMode.statusCode, 400);
});
