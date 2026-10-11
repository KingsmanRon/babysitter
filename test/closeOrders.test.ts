import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/admin/orders/close.js";
import summaryHandler from "../api/admin/summary.js";
import { parseCloseRequest } from "../lib/closeOrders.js";
import { setSupabaseAdminForTests } from "../lib/supabaseAdmin.js";
import { createFakeSupabase, type DbState } from "./fakeSupabase.js";

const EARLIER = "2026-09-01T10:00:00.000Z";

function db(): DbState {
  return {
    orders: [
      { id: "delivered", status: "paid", fulfilment_status: "delivered", closed_at: null, created_at: "2026-09-01T01:00:00Z" },
      { id: "collected", status: "paid", fulfilment_status: "collected", closed_at: null, created_at: "2026-09-01T02:00:00Z" },
      { id: "to-send", status: "paid", fulfilment_status: "packed", closed_at: null, created_at: "2026-09-01T03:00:00Z" },
      { id: "pending", status: "pending_payment", fulfilment_status: "unfulfilled", closed_at: null, created_at: "2026-09-01T04:00:00Z" },
      { id: "expired", status: "expired", fulfilment_status: "unfulfilled", closed_at: null, created_at: "2026-09-01T05:00:00Z" },
      { id: "failed", status: "payment_failed", fulfilment_status: "unfulfilled", created_at: "2026-09-01T06:00:00Z" },
      { id: "old", status: "expired", fulfilment_status: "unfulfilled", closed_at: EARLIER, created_at: "2026-08-01T00:00:00Z" },
    ],
    order_items: [],
    payment_transactions: [],
    payment_webhook_events: [],
    products: [],
    decrementCalls: [],
  } as DbState;
}

function fakeRes() {
  return {
    statusCode: 0,
    body: undefined as any,
    setHeader() {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

async function withDb<T>(state: DbState, fn: () => Promise<T>): Promise<T> {
  process.env.ADMIN_TOKEN = "admin-secret";
  setSupabaseAdminForTests(createFakeSupabase(state) as never);
  try {
    return await fn();
  } finally {
    setSupabaseAdminForTests(null);
    delete process.env.ADMIN_TOKEN;
  }
}

async function close(state: DbState, body: unknown, token = "admin-secret") {
  const res = fakeRes();
  await withDb(state, () =>
    handler({ method: "POST", body, headers: { "x-admin-token": token }, query: {} } as never, res as never),
  );
  return res;
}

async function summary(state: DbState, url: string) {
  const res = fakeRes();
  await withDb(state, () =>
    summaryHandler({ method: "GET", url, headers: { "x-admin-token": "admin-secret" }, query: {} } as never, res as never),
  );
  return res.body.orders.map((o: { id: string }) => o.id).sort();
}

const closedIds = (state: DbState) => state.orders.filter((o) => o.closed_at).map((o) => o.id).sort();

test("close finished orders closes never-paid and delivered / collected ones, nothing still in progress", async () => {
  const state = db();
  const res = await close(state, { finished: true, closed: true });
  assert.equal(res.statusCode, 200);
  assert.deepEqual([...res.body.orderIds].sort(), ["collected", "delivered", "expired", "failed"]);
  assert.deepEqual(closedIds(state), ["collected", "delivered", "expired", "failed", "old"]);
  // Already-closed orders keep their original close time; nothing else changes.
  assert.equal(state.orders.find((o) => o.id === "old")!.closed_at, EARLIER);
  assert.equal(state.orders.find((o) => o.id === "delivered")!.status, "paid");
  assert.equal(state.orders.find((o) => o.id === "delivered")!.fulfilment_status, "delivered");
});

test("single orders can be closed whatever their state, and reopened", async () => {
  const state = db();
  const closed = await close(state, { order_ids: ["to-send", "old"], closed: true });
  assert.deepEqual(closed.body.orderIds, ["to-send"]);
  assert.deepEqual(closedIds(state), ["old", "to-send"]);

  const reopened = await close(state, { order_ids: ["old"], closed: false });
  assert.deepEqual(reopened.body.orderIds, ["old"]);
  assert.deepEqual(closedIds(state), ["to-send"]);
});

test("admin summary hides closed orders except under the Closed filter", async () => {
  const state = db();
  assert.deepEqual(await summary(state, "/api/admin/summary"), ["collected", "delivered", "expired", "failed", "pending", "to-send"]);
  assert.deepEqual(await summary(state, "/api/admin/summary?status=expired"), ["expired"]);
  assert.deepEqual(await summary(state, "/api/admin/summary?closed=1"), ["old"]);

  await close(state, { finished: true, closed: true });
  assert.deepEqual(await summary(state, "/api/admin/summary"), ["pending", "to-send"]);
  assert.deepEqual(await summary(state, "/api/admin/summary?fulfilment=done"), []);
});

test("close requires the admin token and a well-formed body", async () => {
  const state = db();
  assert.equal((await close(state, { finished: true, closed: true }, "wrong")).statusCode, 401);
  for (const body of [
    null,
    { closed: true },
    { order_ids: [], closed: true },
    { order_ids: ["a"] },
    { order_ids: ["a"], closed: true, finished: true },
    { finished: true, closed: false },
    { order_ids: ["a"], closed: true, status: "paid" },
  ]) {
    assert.equal((await close(state, body)).statusCode, 400, JSON.stringify(body));
  }
  assert.deepEqual(closedIds(state), ["old"]);
});

test("parseCloseRequest de-duplicates and trims ids", () => {
  assert.deepEqual(parseCloseRequest({ order_ids: [" a ", "a", "b"], closed: true }), { closed: true, order_ids: ["a", "b"] });
});
