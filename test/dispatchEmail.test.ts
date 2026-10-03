import test, { mock } from "node:test";
import assert from "node:assert/strict";
import fulfilmentHandler from "../api/admin/orders/[id].js";
import emailHandler from "../api/admin/orders/[id]/email.js";
import { buildDispatchEmail, type EmailOrder } from "../lib/confirmationEmail.js";
import { setSupabaseAdminForTests } from "../lib/supabaseAdmin.js";
import { createFakeSupabase, type DbState } from "./fakeSupabase.js";

const SITE = "https://babysitterbs.co.za";
const tee = "S'MILANO SAVED MY LIFE";

function order(overrides: Record<string, unknown> = {}): EmailOrder & Record<string, unknown> {
  return {
    id: "o-1",
    order_number: "BS-4BVRO6IR",
    status: "paid",
    customer_name: "letsie Moletsane",
    customer_email: "letsie@example.com",
    amount_cents: 60000,
    delivery_fee_cents: 10000,
    fulfilment_method: "delivery",
    fulfilment_status: "packed",
    ship_suburb: "Obroholzer",
    ship_city: "Carletonville",
    courier: null,
    tracking_number: null,
    dispatched_at: null,
    delivered_at: null,
    dispatch_email_sent_at: null,
    created_at: "2026-10-02T08:00:00Z",
    ...overrides,
  };
}

async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// ── Content ────────────────────────────────────────────────────

test("on-its-way email names the courier and tracking number", async () => {
  await withEnv({ PUBLIC_SITE_URL: SITE }, async () => {
    const email = buildDispatchEmail(order({ courier: "Pargo", tracking_number: "PG123456789" }), [{ product_name: tee, size: "M", quantity: 1 }])!;
    assert.equal(email.subject, "Your BABYSITTER order BS-4BVRO6IR is on its way");
    assert.match(email.text, /^Hi Letsie,\n\nGood news: your order is out for delivery\./);
    assert.match(email.text, /Courier Pargo\nTracking number PG123456789\nDelivering to Obroholzer, Carletonville/);
    assert.match(email.text, /Track your order: https:\/\/babysitterbs\.co\.za\/track\/o-1/);
    assert.ok(email.html.includes("<strong>PG123456789</strong>"));
    assert.ok(email.html.includes("On its way"));
  });
});

test("without tracking details the lines are simply left out", async () => {
  await withEnv({ PUBLIC_SITE_URL: SITE }, async () => {
    const email = buildDispatchEmail(order(), [])!;
    assert.doesNotMatch(email.text, /Courier|Tracking number/);
    assert.match(email.text, /Delivering to Obroholzer, Carletonville/);
  });
});

test("collection orders get a ready-for-collection email", async () => {
  await withEnv({ PUBLIC_SITE_URL: SITE }, async () => {
    const email = buildDispatchEmail(order({ fulfilment_method: "collection", fulfilment_status: "ready_for_collection" }), [])!;
    assert.equal(email.subject, "Your BABYSITTER order BS-4BVRO6IR is ready for collection");
    assert.match(email.text, /We'll be in touch on WhatsApp to arrange pickup\./);
    assert.match(email.text, /Bring your order number BS-4BVRO6IR when you collect\./);
  });
});

// ── Sent when admin marks the order out for delivery ───────────

function state(overrides: Record<string, unknown> = {}): DbState {
  return {
    orders: [order(overrides)],
    order_items: [{ order_id: "o-1", product_name: tee, size: "M", quantity: 1 }],
    payment_transactions: [],
    payment_webhook_events: [],
    decrementCalls: [],
  };
}

type Res = { statusCode: number; body: Record<string, unknown> | undefined };

async function run(
  st: DbState,
  calls: Array<{ handler: typeof fulfilmentHandler; method: string; body: Record<string, unknown> }>,
  fetchImpl: () => Promise<Response> = async () => new Response(JSON.stringify({ id: "re_9" }), { status: 200 }),
) {
  const sent: Array<{ headers: Record<string, string>; body: Record<string, unknown> }> = [];
  const results: Res[] = [];
  await withEnv({ ADMIN_TOKEN: "admin-secret", RESEND_API_KEY: "re_test", PUBLIC_SITE_URL: SITE }, async () => {
    setSupabaseAdminForTests(createFakeSupabase(st) as never);
    const fetchMock = mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
      sent.push({ headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
      return fetchImpl();
    });
    const quiet = [mock.method(console, "log", () => {}), mock.method(console, "error", () => {})];
    try {
      for (const call of calls) {
        const res = {
          statusCode: 0,
          body: undefined as Record<string, unknown> | undefined,
          setHeader() {},
          status(code: number) {
            this.statusCode = code;
            return this;
          },
          json(payload: Record<string, unknown>) {
            this.body = payload;
            return this;
          },
        };
        await call.handler(
          { method: call.method, headers: { "x-admin-token": "admin-secret" }, query: { id: "o-1" }, body: call.body } as never,
          res as never,
        );
        results.push(res);
      }
    } finally {
      fetchMock.mock.restore();
      quiet.forEach((q) => q.mock.restore());
      setSupabaseAdminForTests(null);
    }
  });
  return { sent, results };
}

const patch = (body: Record<string, unknown>) => ({ handler: fulfilmentHandler, method: "PATCH", body });

test("marking Out for delivery emails the customer once, with the tracking typed in the same change", async () => {
  const st = state();
  const { sent, results } = await run(st, [
    patch({ fulfilment_status: "out_for_delivery", courier: "Pargo", tracking_number: "PG123" }),
    patch({ fulfilment_status: "packed" }),
    patch({ fulfilment_status: "out_for_delivery" }),
    patch({ fulfilment_status: "delivered" }),
  ]);
  assert.equal(sent.length, 1, "moving back and forth doesn't resend");
  assert.equal(sent[0].headers["Idempotency-Key"], "order-dispatch-o-1");
  assert.equal(sent[0].body.subject, "Your BABYSITTER order BS-4BVRO6IR is on its way");
  assert.match(String(sent[0].body.text), /Tracking number PG123/);
  assert.equal((results[0].body!.dispatchEmail as { status: string }).status, "sent");
  assert.ok(st.orders[0].dispatch_email_sent_at);
  assert.equal(results.every((r) => r.statusCode === 200), true);
});

test("other steps don't email, and an email failure never blocks the update", async () => {
  const quietState = state({ fulfilment_status: "unfulfilled" });
  const { sent } = await run(quietState, [patch({ fulfilment_status: "packed" }), patch({ courier: "Pargo" })]);
  assert.equal(sent.length, 0);

  const failing = state();
  const { results } = await run(
    failing,
    [patch({ fulfilment_status: "out_for_delivery" })],
    async () => new Response(JSON.stringify({ message: "Rate limited" }), { status: 429 }),
  );
  assert.equal(results[0].statusCode, 200);
  assert.equal(failing.orders[0].fulfilment_status, "out_for_delivery");
  assert.equal((results[0].body!.dispatchEmail as { status: string }).status, "failed");
  assert.equal(failing.orders[0].dispatch_email_error, "Rate limited");
});

test("collection orders are emailed when marked Ready for collection", async () => {
  const st = state({ fulfilment_method: "collection" });
  const { sent } = await run(st, [patch({ fulfilment_status: "ready_for_collection" })]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.subject, "Your BABYSITTER order BS-4BVRO6IR is ready for collection");
});

// ── Admin resend / manual ──────────────────────────────────────

const email = (body: Record<string, unknown>) => ({ handler: emailHandler as typeof fulfilmentHandler, method: "POST", body });

test("the on-its-way email can be resent or opened manually once the order has gone out", async () => {
  const notYet = await run(state(), [email({ mode: "send", kind: "dispatch" })]);
  assert.equal(notYet.results[0].statusCode, 409);
  assert.equal(notYet.results[0].body!.reason, "not_dispatched");
  assert.equal(notYet.sent.length, 0);

  const st = state({ fulfilment_status: "out_for_delivery", dispatch_email_sent_at: "2026-10-02T12:00:00Z" });
  const { results, sent } = await run(st, [email({ mode: "send", kind: "dispatch" }), email({ mode: "manual", kind: "dispatch" })]);
  assert.equal(results[0].statusCode, 200);
  assert.match(sent[0].headers["Idempotency-Key"], /^order-dispatch-o-1-\d+$/);
  assert.match(String(results[1].body!.mailto), /subject=Your%20BABYSITTER%20order%20BS-4BVRO6IR%20is%20on%20its%20way/);
  assert.ok(st.orders[0].dispatch_email_manual_at);

  const bad = await run(state(), [email({ mode: "send", kind: "sms" })]);
  assert.equal(bad.results[0].statusCode, 400);
});
