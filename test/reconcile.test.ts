import test, { mock } from "node:test";
import assert from "node:assert/strict";
import {
  PENDING_EXPIRY_MINUTES,
  RECONCILE_THROTTLE_SECONDS,
  reconcileOrder,
  reconcilePendingOrders,
  resetReconcileThrottleForTests,
} from "../lib/reconcile.js";
import { setSupabaseAdminForTests } from "../lib/supabaseAdmin.js";
import { createFakeSupabase, pendingOrderState, type DbState } from "./fakeSupabase.js";

// pendingOrderState()'s checkout was created at 07:00Z.
const CREATED = Date.parse("2026-10-02T07:00:00.000Z");
const at = (minutesAfterCheckout: number) => new Date(CREATED + minutesAfterCheckout * 60_000);

type CheckoutReply = { status: number; body?: Record<string, unknown> } | ((state: DbState) => { status: number; body?: Record<string, unknown> });

async function withYoco<T>(state: DbState, reply: CheckoutReply, fn: () => Promise<T>) {
  process.env.YOCO_SECRET_KEY = "sk_test_reconcile";
  resetReconcileThrottleForTests();
  setSupabaseAdminForTests(createFakeSupabase(state) as never);
  const calls: string[] = [];
  const fetchMock = mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    assert.equal(init?.method ?? "GET", "GET", "reconciliation must only read from Yoco");
    calls.push(url);
    const r = typeof reply === "function" ? reply(state) : reply;
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
  });
  const quiet = [mock.method(console, "log", () => {}), mock.method(console, "warn", () => {}), mock.method(console, "error", () => {})];
  try {
    return { result: await fn(), calls };
  } finally {
    fetchMock.mock.restore();
    quiet.forEach((spy) => spy.mock.restore());
    setSupabaseAdminForTests(null);
    delete process.env.YOCO_SECRET_KEY;
  }
}

const completed = { status: 200, body: { id: "checkout-1", status: "completed", paymentId: "p_late", amount: 60000, currency: "ZAR" } };
const open = { status: 200, body: { id: "checkout-1", status: "created" } };

test("a checkout Yoco reports completed marks the missed order paid, once", async () => {
  const state = pendingOrderState();
  const { result, calls } = await withYoco(state, completed, async () => [
    await reconcileOrder("order-1", { now: at(5) }),
    await reconcileOrder("order-1", { now: at(6) }),
  ]);

  assert.deepEqual(result, ["paid", "skipped"]);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/api\/checkouts\/checkout-1$/);
  assert.equal(state.orders[0].status, "paid");
  assert.equal(state.payment_transactions[0].provider_payment_id, "p_late");
  assert.ok(state.payment_transactions[0].paid_at);
  assert.equal(state.decrementCalls.length, 1);
});

test("gives the webhook a head start before asking Yoco", async () => {
  const state = pendingOrderState();
  const { result, calls } = await withYoco(state, completed, () => reconcileOrder("order-1", { now: at(1) }));
  assert.equal(result, "skipped");
  assert.equal(calls.length, 0);
});

test("asks Yoco about one checkout at most once per throttle window", async () => {
  const state = pendingOrderState();
  const { result, calls } = await withYoco(state, open, async () => [
    await reconcileOrder("order-1", { now: at(10) }),
    await reconcileOrder("order-1", { now: new Date(at(10).getTime() + (RECONCILE_THROTTLE_SECONDS - 1) * 1000) }),
    await reconcileOrder("order-1", { now: new Date(at(10).getTime() + (RECONCILE_THROTTLE_SECONDS + 1) * 1000) }),
  ]);
  assert.deepEqual(result, ["open", "skipped", "open"]);
  assert.equal(calls.length, 2);
});

test(`an unpaid checkout is left open until ${PENDING_EXPIRY_MINUTES} minutes, then expired and its stock released`, async () => {
  const state = pendingOrderState();
  const { result } = await withYoco(state, open, async () => [
    await reconcileOrder("order-1", { now: at(PENDING_EXPIRY_MINUTES - 1) }),
    await reconcileOrder("order-1", { now: at(PENDING_EXPIRY_MINUTES + 1) }),
  ]);

  assert.deepEqual(result, ["open", "expired"]);
  assert.equal(state.orders[0].status, "expired");
  assert.equal(state.payment_transactions[0].provider_status, "expired");
  assert.ok(state.payment_transactions[0].failed_at);
  assert.deepEqual(state.rpcCalls?.map((c) => c.name), ["release_order_stock"]);
});

test("a checkout Yoco reports expired is expired straight away", async () => {
  const state = pendingOrderState();
  const { result } = await withYoco(state, { status: 200, body: { status: "expired" } }, () =>
    reconcileOrder("order-1", { now: at(5) }),
  );
  assert.equal(result, "expired");
  assert.equal(state.orders[0].status, "expired");
});

test("never expires a checkout Yoco is still processing", async () => {
  const state = pendingOrderState();
  const { result } = await withYoco(state, { status: 200, body: { status: "processing" } }, () =>
    reconcileOrder("order-1", { now: at(PENDING_EXPIRY_MINUTES + 30) }),
  );
  assert.equal(result, "open");
  assert.equal(state.orders[0].status, "pending_payment");
});

test("a webhook that pays the order mid-reconcile wins over expiry", async () => {
  const state = pendingOrderState();
  const { result } = await withYoco(
    state,
    (s) => {
      s.orders[0].status = "paid"; // webhook lands while we wait on Yoco
      return open;
    },
    () => reconcileOrder("order-1", { now: at(PENDING_EXPIRY_MINUTES + 1) }),
  );
  assert.equal(result, "skipped");
  assert.equal(state.orders[0].status, "paid");
  assert.equal(state.payment_transactions[0].provider_status, "created");
});

test("a recorded decline keeps its failed status when the order expires", async () => {
  const state = pendingOrderState();
  state.orders[0].status = "payment_failed";
  Object.assign(state.payment_transactions[0], { provider_status: "failed", failed_at: "2026-10-02T07:05:00.000Z" });
  const { result } = await withYoco(state, open, () => reconcileOrder("order-1", { now: at(PENDING_EXPIRY_MINUTES + 1) }));
  assert.equal(result, "expired");
  assert.equal(state.orders[0].status, "expired");
  assert.equal(state.payment_transactions[0].provider_status, "failed");
});

test("Yoco errors leave the order untouched; a 404 past expiry expires it", async () => {
  const state = pendingOrderState();
  const { result } = await withYoco(state, { status: 500 }, () => reconcileOrder("order-1", { now: at(PENDING_EXPIRY_MINUTES + 1) }));
  assert.equal(result, "error");
  assert.equal(state.orders[0].status, "pending_payment");

  const gone = pendingOrderState();
  const { result: goneResult } = await withYoco(gone, { status: 404 }, () =>
    reconcileOrder("order-1", { now: at(PENDING_EXPIRY_MINUTES + 1) }),
  );
  assert.equal(goneResult, "expired");
});

test("the sweep checks open orders only, and a dry run changes nothing", async () => {
  const state = pendingOrderState();
  state.orders.push(
    { id: "order-paid", status: "paid", created_at: "2026-10-02T06:00:00.000Z" },
    { id: "order-old", status: "pending_payment", created_at: "2026-10-01T06:00:00.000Z" },
  );
  state.payment_transactions.push({
    id: "tx-old",
    order_id: "order-old",
    provider: "yoco",
    provider_checkout_id: "checkout-old",
    provider_status: "created",
    paid_at: null,
    created_at: "2026-10-01T06:00:00.000Z",
  });

  const dry = await withYoco(state, open, () => reconcilePendingOrders({ now: at(30), dryRun: true }));
  assert.deepEqual(dry.result.orders, [
    { orderId: "order-old", outcome: "expired" },
    { orderId: "order-1", outcome: "open" },
  ]);
  assert.equal(state.writes ?? 0, 0);
  assert.equal(state.orders.find((o) => o.id === "order-old")!.status, "pending_payment");

  const real = await withYoco(state, open, () => reconcilePendingOrders({ now: at(30) }));
  assert.equal(real.result.outcomes.expired, 1);
  assert.equal(state.orders.find((o) => o.id === "order-old")!.status, "expired");
  assert.equal(state.orders.find((o) => o.id === "order-paid")!.status, "paid");
});

test("never times out an order whose stock hold was restarted by a second Pay click", async () => {
  const state = pendingOrderState();
  // Checkout created at 07:00; buyer clicked Pay again at 07:55, restarting the 30-minute hold.
  Object.assign(state.orders[0], { stock_state: "reserved", reservation_expires_at: at(85).toISOString() });
  const { result } = await withYoco(state, open, async () => [
    await reconcileOrder("order-1", { now: at(PENDING_EXPIRY_MINUTES + 5) }),
    await reconcileOrder("order-1", { now: at(90) }),
  ]);
  assert.deepEqual(result, ["open", "expired"]);
  assert.equal(state.orders[0].status, "expired");
});
