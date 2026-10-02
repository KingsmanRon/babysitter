import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/admin/summary.js";
import { setSupabaseAdminForTests } from "../lib/supabaseAdmin.js";
import { createFakeSupabase, type DbState } from "./fakeSupabase.js";

async function summary(url: string) {
  const state = {
    orders: [
      { id: "o-paid", status: "paid", created_at: "2026-10-02T07:00:00Z" },
      { id: "o-pending", status: "pending_payment", created_at: "2026-10-02T07:01:00Z" },
      { id: "o-draft", status: "draft", created_at: "2026-10-02T07:02:00Z" },
      { id: "o-cancelled", status: "cancelled", created_at: "2026-10-02T07:03:00Z" },
    ],
    order_items: [],
    payment_transactions: [
      { id: "t-paid", order_id: "o-paid", created_at: "2026-10-02T07:00:00Z" },
      { id: "t-pending", order_id: "o-pending", created_at: "2026-10-02T07:01:00Z" },
    ],
    payment_webhook_events: [],
    products: [],
    decrementCalls: [],
  } as DbState;
  process.env.ADMIN_TOKEN = "admin-secret";
  setSupabaseAdminForTests(createFakeSupabase(state) as never);
  const res = {
    statusCode: 0,
    body: undefined as { orders: Array<{ id: string }>; transactions: Array<{ id: string }> } | undefined,
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
  try {
    await handler({ method: "GET", url, headers: { "x-admin-token": "admin-secret" }, query: {} } as never, res as never);
  } finally {
    setSupabaseAdminForTests(null);
    delete process.env.ADMIN_TOKEN;
  }
  return res;
}

test("admin summary filters orders, and their transactions, by status group", async () => {
  const paid = await summary("/api/admin/summary?status=paid");
  assert.equal(paid.statusCode, 200);
  assert.deepEqual(paid.body!.orders.map((o) => o.id), ["o-paid"]);
  assert.deepEqual(paid.body!.transactions.map((t) => t.id), ["t-paid"]);

  const pending = await summary("/api/admin/summary?status=pending");
  assert.deepEqual(pending.body!.orders.map((o) => o.id).sort(), ["o-draft", "o-pending"]);
});

test("no or unknown filter returns every order", async () => {
  for (const url of ["/api/admin/summary", "/api/admin/summary?status=bogus"]) {
    const res = await summary(url);
    assert.equal(res.body!.orders.length, 4);
  }
});
