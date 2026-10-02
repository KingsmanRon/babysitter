import test, { mock } from "node:test";
import assert from "node:assert/strict";
import handler from "../api/admin/orders/[id]/nudge.js";
import {
  buildNudgeMessage,
  findSupersedingOrder,
  firstName,
  formatRand,
  isSameCustomer,
  normaliseSaPhone,
  type CustomerOrder,
} from "../lib/nudge.js";
import { createYocoCheckout, handleYocoWebhook, OrderClosedError, type YocoWebhookEvent } from "../lib/yoco.js";
import { setSupabaseAdminForTests } from "../lib/supabaseAdmin.js";
import { createFakeSupabase, type DbState } from "./fakeSupabase.js";

// ── Phone normalisation ────────────────────────────────────────

test("normalises SA mobile numbers to wa.me digits", () => {
  assert.equal(normaliseSaPhone("0658725011"), "27658725011");
  assert.equal(normaliseSaPhone("+27 65 872 5011"), "27658725011");
  assert.equal(normaliseSaPhone("639399611"), "27639399611");
  assert.equal(normaliseSaPhone("0027658725011"), "27658725011");
  assert.equal(normaliseSaPhone("27658725011"), "27658725011");
});

test("rejects landlines, empty and malformed numbers", () => {
  assert.equal(normaliseSaPhone("0112345678"), null);
  assert.equal(normaliseSaPhone(""), null);
  assert.equal(normaliseSaPhone(null), null);
  assert.equal(normaliseSaPhone("065872501"), null); // one digit short
  assert.equal(normaliseSaPhone("+44 7700 900123"), null);
});

// ── Messages ───────────────────────────────────────────────────

const order = { id: "o-1", order_number: "BS-6V8H4G52", amount_cents: 60000, customer_name: "skhumbuzo Jackson Hlapho" };

test("greets by capitalised first name, or 'there'", () => {
  assert.equal(firstName("skhumbuzo Jackson Hlapho"), "Skhumbuzo");
  assert.equal(firstName(null), "there");
  assert.equal(firstName("   "), "there");
  assert.match(buildNudgeMessage(order, 1, null), /^Hi Skhumbuzo, /);
  assert.match(buildNudgeMessage({ ...order, customer_name: null }, 1, null), /^Hi there, /);
});

test("formats amounts as R600 or R599.50", () => {
  assert.equal(formatRand(60000), "R600");
  assert.equal(formatRand(59950), "R599.50");
  assert.equal(formatRand(59905), "R599.05");
});

test("builds the first and final reminder texts", () => {
  const url = "https://babysitterbs.co.za/pay/o-1";
  assert.equal(
    buildNudgeMessage(order, 1, url),
    "Hi Skhumbuzo, your order BS-6V8H4G52 for R600 is reserved but still unpaid, and stock is moving fast. Complete payment here: https://babysitterbs.co.za/pay/o-1",
  );
  assert.equal(
    buildNudgeMessage(order, 2, url),
    "Hi Skhumbuzo, last reminder: we're holding order BS-6V8H4G52 (R600) for a few more hours before it's released. Complete payment here: https://babysitterbs.co.za/pay/o-1",
  );
  assert.match(buildNudgeMessage(order, 1, null), /Reply YES and we'll send you a fresh payment link\.$/);
});

// ── Supersede matching ─────────────────────────────────────────

const pendingOrder: CustomerOrder = {
  id: "o-pending",
  order_number: "BS-OLD",
  customer_email: "Kenny@Example.com",
  ship_phone: "0693187416",
  created_at: "2026-10-02T09:00:00Z",
};

test("same customer by email (any case) or by the last 9 phone digits", () => {
  const paid = { ...pendingOrder, id: "o-paid", order_number: "BS-NEW", created_at: "2026-10-02T10:00:00Z" };
  assert.ok(isSameCustomer(pendingOrder, { ...paid, customer_email: "kenny@example.com", ship_phone: null }));
  assert.ok(isSameCustomer(pendingOrder, { ...paid, customer_email: "other@example.com", ship_phone: "27693187416" }));
  assert.ok(isSameCustomer(pendingOrder, { ...paid, customer_email: null, ship_phone: "+27 69 318 7416" }));
  assert.ok(!isSameCustomer(pendingOrder, { ...paid, customer_email: "other@example.com", ship_phone: "0821234567" }));
  assert.ok(!isSameCustomer({ ...pendingOrder, customer_email: null, ship_phone: null }, { ...paid, customer_email: null, ship_phone: null }));
});

test("only a LATER paid order supersedes a pending one", () => {
  const later = { ...pendingOrder, id: "o-paid", order_number: "BS-NEW", created_at: "2026-10-02T10:00:00Z" };
  const earlier = { ...later, created_at: "2026-10-02T08:00:00Z" };
  assert.equal(findSupersedingOrder(pendingOrder, [earlier])?.order_number, undefined);
  assert.equal(findSupersedingOrder(pendingOrder, [earlier, later])?.order_number, "BS-NEW");
});

// ── Nudge endpoint ─────────────────────────────────────────────

function nudgeState(overrides: Record<string, unknown> = {}): DbState {
  return {
    orders: [
      {
        id: "o-1",
        order_number: "BS-6V8H4G52",
        status: "pending_payment",
        amount_cents: 60000,
        customer_name: "skhumbuzo Jackson Hlapho",
        customer_email: "skhumbuzo@example.com",
        ship_phone: "0679846864",
        created_at: "2026-10-02T09:16:27Z",
        nudge_count: 0,
        last_nudged_at: null,
        superseded_by: null,
        ...overrides,
      },
    ],
    order_items: [],
    payment_transactions: [],
    payment_webhook_events: [],
    decrementCalls: [],
  };
}

function fakeRes() {
  return {
    statusCode: 0,
    body: undefined as { url?: string; nudgeCount?: number; lastNudgedAt?: string; reason?: string } | undefined,
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
}

async function nudge(state: DbState, times = 1, token = "admin-secret") {
  process.env.ADMIN_TOKEN = "admin-secret";
  process.env.PUBLIC_SITE_URL = "https://babysitterbs.co.za";
  setSupabaseAdminForTests(createFakeSupabase(state) as never);
  const quiet = mock.method(console, "log", () => {});
  try {
    return await Promise.all(
      Array.from({ length: times }, async () => {
        const res = fakeRes();
        await handler({ method: "POST", headers: { "x-admin-token": token }, query: { id: "o-1" } } as never, res as never);
        return res;
      }),
    );
  } finally {
    quiet.mock.restore();
    setSupabaseAdminForTests(null);
    delete process.env.ADMIN_TOKEN;
    delete process.env.PUBLIC_SITE_URL;
  }
}

test("first nudge returns the wa.me link with the reminder and counts it", async () => {
  const state = nudgeState();
  const [res] = await nudge(state);
  assert.equal(res.statusCode, 200);
  const url = new URL(res.body!.url!);
  assert.equal(url.origin + url.pathname, "https://wa.me/27679846864");
  assert.equal(
    url.searchParams.get("text"),
    "Hi Skhumbuzo, your order BS-6V8H4G52 for R600 is reserved but still unpaid, and stock is moving fast. Complete payment here: https://babysitterbs.co.za/pay/o-1",
  );
  assert.equal(res.body!.nudgeCount, 1);
  assert.equal(state.orders[0].nudge_count, 1);
  assert.ok(state.orders[0].last_nudged_at);
});

test("second nudge sends the final reminder; a third is refused", async () => {
  const state = nudgeState({ nudge_count: 1 });
  const [second] = await nudge(state);
  assert.match(new URL(second.body!.url!).searchParams.get("text")!, /^Hi Skhumbuzo, last reminder: /);
  assert.equal(second.body!.nudgeCount, 2);

  const [third] = await nudge(state);
  assert.equal(third.statusCode, 409);
  assert.equal(third.body!.reason, "max_nudges");
  assert.equal(state.orders[0].nudge_count, 2);
});

test("a double click counts one reminder", async () => {
  const state = nudgeState();
  const results = await nudge(state, 2);
  assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 409]);
  assert.equal(results.find((r) => r.statusCode === 409)!.body!.reason, "conflict");
  assert.equal(state.orders[0].nudge_count, 1);
});

test("refuses orders that aren't pending, are superseded, or have no valid phone", async () => {
  const [paid] = await nudge(nudgeState({ status: "paid" }));
  assert.equal(paid.body!.reason, "not_pending");

  const [flagged] = await nudge(nudgeState({ superseded_by: "BS-NEW" }));
  assert.equal(flagged.body!.reason, "superseded");

  const laterPaid = nudgeState();
  laterPaid.orders.push({
    id: "o-2",
    order_number: "BS-NEW",
    status: "paid",
    customer_email: "other@example.com",
    ship_phone: "27679846864",
    created_at: "2026-10-02T10:00:00Z",
  });
  const [computed] = await nudge(laterPaid);
  assert.equal(computed.statusCode, 409);
  assert.equal(computed.body!.reason, "superseded");
  assert.equal(laterPaid.orders[0].nudge_count, 0);

  const [landline] = await nudge(nudgeState({ ship_phone: "0112345678" }));
  assert.equal(landline.statusCode, 422);
  assert.equal(landline.body!.reason, "invalid_phone");

  const [badToken] = await nudge(nudgeState(), 1, "wrong");
  assert.equal(badToken.statusCode, 401);
});

// ── Webhook: cancel superseded orders ──────────────────────────

function paidEvent(orderId: string): YocoWebhookEvent {
  return {
    id: `evt-${orderId}`,
    type: "payment.succeeded",
    payload: { id: `p-${orderId}`, amount: 60000, currency: "ZAR", metadata: { orderId, checkoutId: `ch-${orderId}` } },
  };
}

function supersedeState(): DbState {
  const base = { status: "pending_payment", amount_cents: 60000, customer_name: "Kenny", stock_state: "reserved" };
  return {
    orders: [
      { ...base, id: "o-old-email", order_number: "BS-OLD1", customer_email: "KENNY@example.com", ship_phone: "0811111111", created_at: "2026-10-02T09:00:00Z" },
      { ...base, id: "o-old-phone", order_number: "BS-OLD2", customer_email: "kenny.alt@example.com", ship_phone: "0693187416", created_at: "2026-10-02T09:10:00Z" },
      { ...base, id: "o-stranger", order_number: "BS-OTHER", customer_email: "someone@example.com", ship_phone: "0820000000", created_at: "2026-10-02T09:20:00Z" },
      { ...base, id: "o-new", order_number: "BS-NEW", customer_email: "kenny@example.com", ship_phone: "27693187416", created_at: "2026-10-02T09:30:00Z" },
      { ...base, id: "o-later", order_number: "BS-LATER", customer_email: "kenny@example.com", ship_phone: "0693187416", created_at: "2026-10-02T09:40:00Z" },
    ],
    order_items: [],
    payment_transactions: [],
    payment_webhook_events: [],
    decrementCalls: [],
  };
}

test("paying a new order cancels the customer's earlier pending orders and releases their stock", async () => {
  const state = supersedeState();
  setSupabaseAdminForTests(createFakeSupabase(state) as never);
  const quiet = [mock.method(console, "log", () => {}), mock.method(console, "warn", () => {})];
  try {
    await handleYocoWebhook(paidEvent("o-new"), {});
  } finally {
    quiet.forEach((spy) => spy.mock.restore());
    setSupabaseAdminForTests(null);
  }

  const byId = Object.fromEntries(state.orders.map((o) => [o.id, o]));
  assert.equal(byId["o-new"].status, "paid");
  for (const id of ["o-old-email", "o-old-phone"]) {
    assert.equal(byId[id].status, "cancelled", id);
    assert.equal(byId[id].cancel_reason, "superseded");
    assert.equal(byId[id].superseded_by, "BS-NEW");
  }
  assert.equal(byId["o-stranger"].status, "pending_payment");
  assert.equal(byId["o-later"].status, "pending_payment", "orders placed after the paid one are left alone");
  const released = (state.rpcCalls ?? []).filter((c) => c.name === "release_order_stock").map((c) => c.args.p_order_id);
  assert.deepEqual(released.sort(), ["o-old-email", "o-old-phone"]);
});

test("the pay link refuses a superseded order", async () => {
  const state = nudgeState({ status: "cancelled", superseded_by: "BS-NEW" });
  setSupabaseAdminForTests(createFakeSupabase(state) as never);
  process.env.YOCO_SECRET_KEY = "sk_test_unused";
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    throw new Error("Yoco must not be called");
  });
  try {
    await assert.rejects(createYocoCheckout("o-1"), (err: Error) => err instanceof OrderClosedError && /BS-NEW/.test(err.message));
    assert.equal(fetchMock.mock.callCount(), 0);
  } finally {
    fetchMock.mock.restore();
    setSupabaseAdminForTests(null);
    delete process.env.YOCO_SECRET_KEY;
  }
});
