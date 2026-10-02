import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/admin/orders/[id].js";
import summaryHandler from "../api/admin/summary.js";
import { buildFulfilmentUpdate } from "../lib/fulfilment.js";
import { setSupabaseAdminForTests } from "../lib/supabaseAdmin.js";
import { createFakeSupabase, type DbState } from "./fakeSupabase.js";

const NOW = new Date("2026-10-02T12:00:00.000Z");
const paidDelivery = { status: "paid", fulfilment_method: "delivery", dispatched_at: null, delivered_at: null };

test("delivery orders move through packed, out for delivery and delivered, stamping each step once", () => {
  assert.deepEqual(buildFulfilmentUpdate(paidDelivery, { fulfilment_status: "packed" }, NOW), {
    fulfilment_status: "packed",
    dispatched_at: null,
    delivered_at: null,
    fulfilment_updated_at: NOW.toISOString(),
  });

  const out = buildFulfilmentUpdate(paidDelivery, { fulfilment_status: "out_for_delivery" }, NOW);
  assert.equal(out.dispatched_at, NOW.toISOString());
  assert.equal(out.delivered_at, null);

  const earlier = "2026-10-02T09:00:00.000Z";
  const delivered = buildFulfilmentUpdate({ ...paidDelivery, dispatched_at: earlier }, { fulfilment_status: "delivered" }, NOW);
  assert.equal(delivered.dispatched_at, earlier);
  assert.equal(delivered.delivered_at, NOW.toISOString());
});

test("moving an order back a step clears the later timestamps", () => {
  const update = buildFulfilmentUpdate(
    { ...paidDelivery, dispatched_at: "2026-10-02T09:00:00Z", delivered_at: "2026-10-02T10:00:00Z" },
    { fulfilment_status: "packed" },
    NOW,
  );
  assert.equal(update.dispatched_at, null);
  assert.equal(update.delivered_at, null);
});

test("collection orders use ready for collection / collected, not delivery steps", () => {
  const collection = { ...paidDelivery, fulfilment_method: "collection" };
  assert.equal(buildFulfilmentUpdate(collection, { fulfilment_status: "collected" }, NOW).delivered_at, NOW.toISOString());
  assert.throws(() => buildFulfilmentUpdate(collection, { fulfilment_status: "out_for_delivery" }, NOW), /collection order/);
  assert.throws(() => buildFulfilmentUpdate(paidDelivery, { fulfilment_status: "collected" }, NOW), /delivery order/);
});

test("only paid orders can be fulfilled, and tracking fields are trimmed", () => {
  assert.throws(
    () => buildFulfilmentUpdate({ ...paidDelivery, status: "pending_payment" }, { fulfilment_status: "packed" }, NOW),
    /Only paid orders/,
  );
  const update = buildFulfilmentUpdate(paidDelivery, { courier: "  The Courier Guy ", tracking_number: "" }, NOW);
  assert.equal(update.courier, "The Courier Guy");
  assert.equal(update.tracking_number, null);
  assert.equal(update.fulfilment_status, undefined);
  assert.throws(() => buildFulfilmentUpdate(paidDelivery, {}, NOW), /Nothing to update/);
});

function fakeRes() {
  return {
    statusCode: 0,
    body: undefined as unknown,
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

function orderState(): DbState {
  return {
    orders: [
      { id: "o-paid", status: "paid", fulfilment_method: "delivery", fulfilment_status: "unfulfilled", created_at: "2026-10-02T07:00:00Z" },
      { id: "o-sent", status: "paid", fulfilment_method: "delivery", fulfilment_status: "out_for_delivery", created_at: "2026-10-02T06:00:00Z" },
      { id: "o-pending", status: "pending_payment", fulfilment_method: "delivery", fulfilment_status: "unfulfilled", created_at: "2026-10-02T08:00:00Z" },
    ],
    order_items: [],
    payment_transactions: [],
    payment_webhook_events: [],
    products: [],
    decrementCalls: [],
  } as DbState;
}

async function call(fn: typeof handler, state: DbState, req: Record<string, unknown>) {
  process.env.ADMIN_TOKEN = "admin-secret";
  setSupabaseAdminForTests(createFakeSupabase(state) as never);
  const res = fakeRes();
  try {
    await fn({ headers: { "x-admin-token": "admin-secret" }, query: {}, ...req } as never, res as never);
  } finally {
    setSupabaseAdminForTests(null);
    delete process.env.ADMIN_TOKEN;
  }
  return res;
}

test("PATCH /api/admin/orders/:id marks a paid order out for delivery with tracking", async () => {
  const state = orderState();
  const res = await call(handler, state, {
    method: "PATCH",
    query: { id: "o-paid" },
    body: { fulfilment_status: "out_for_delivery", courier: "Pargo", tracking_number: "PG123" },
  });
  assert.equal(res.statusCode, 200);
  const order = state.orders[0];
  assert.equal(order.fulfilment_status, "out_for_delivery");
  assert.equal(order.tracking_number, "PG123");
  assert.ok(order.dispatched_at);
});

test("PATCH refuses unpaid orders, bad tokens and unknown fields", async () => {
  const state = orderState();
  const unpaid = await call(handler, state, { method: "PATCH", query: { id: "o-pending" }, body: { fulfilment_status: "packed" } });
  assert.equal(unpaid.statusCode, 400);
  assert.equal(state.orders[2].fulfilment_status, "unfulfilled");

  const extra = await call(handler, state, { method: "PATCH", query: { id: "o-paid" }, body: { status: "refunded" } });
  assert.equal(extra.statusCode, 400);
  assert.equal(state.orders[0].status, "paid");

  const badToken = await call(handler, state, {
    method: "PATCH",
    headers: { "x-admin-token": "wrong" },
    query: { id: "o-paid" },
    body: { fulfilment_status: "packed" },
  });
  assert.equal(badToken.statusCode, 401);
});

test("the admin fulfilment filter lists paid orders at that stage", async () => {
  const state = orderState();
  const toFulfil = await call(summaryHandler as typeof handler, state, { method: "GET", url: "/api/admin/summary?fulfilment=to_fulfil" });
  assert.deepEqual((toFulfil.body as { orders: Array<{ id: string }> }).orders.map((o) => o.id), ["o-paid"]);

  const sent = await call(summaryHandler as typeof handler, state, { method: "GET", url: "/api/admin/summary?fulfilment=dispatched" });
  assert.deepEqual((sent.body as { orders: Array<{ id: string }> }).orders.map((o) => o.id), ["o-sent"]);
});
