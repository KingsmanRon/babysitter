import test from "node:test";
import assert from "node:assert/strict";
import productHandler from "../api/admin/products/[id].js";
import summaryHandler from "../api/admin/summary.js";
import { planStockUpdate, StockConflictError, tallyStockUsage, validateStockEdit } from "../lib/adminStock.js";
import { setSupabaseAdminForTests } from "../lib/supabaseAdmin.js";
import { createFakeSupabase, type DbState, type Row } from "./fakeSupabase.js";

const tee = () => ({ stock_count: 25, size_stock: { S: 5, M: 1, L: 12, XL: 7 } });

test("editing one size leaves the others alone and moves the total by the same amount", () => {
  const next = planStockUpdate(tee(), validateStockEdit({ size_stock: { M: 4 }, expected_size_stock: { M: 1 } }));
  assert.deepEqual(next, { stock_count: 28, size_stock: { S: 5, M: 4, L: 12, XL: 7 } });

  const closed = planStockUpdate(tee(), { size_stock: { M: 0, L: 10 }, expected_size_stock: { M: 1, L: 12 } });
  assert.deepEqual(closed, { stock_count: 22, size_stock: { S: 5, M: 0, L: 10, XL: 7 } });
});

test("a sale in the size being edited is a conflict, not an overwrite", () => {
  const afterSale = { stock_count: 24, size_stock: { S: 5, M: 0, L: 12, XL: 7 } };
  assert.throws(
    () => planStockUpdate(afterSale, { size_stock: { M: 3 }, expected_size_stock: { M: 1 } }),
    (err: Error) => err instanceof StockConflictError && /M changed from 1 to 0/.test(err.message),
  );
  // A sale in another size doesn't block the edit.
  const next = planStockUpdate(afterSale, { size_stock: { L: 20 }, expected_size_stock: { L: 12 } });
  assert.deepEqual(next, { stock_count: 32, size_stock: { S: 5, M: 0, L: 20, XL: 7 } });
});

test("products without sizes edit stock_count with the same check", () => {
  const cap = { stock_count: 10, size_stock: null };
  assert.deepEqual(planStockUpdate(cap, { stock_count: 15, expected_stock_count: 10 }), { stock_count: 15, size_stock: null });
  assert.throws(() => planStockUpdate(cap, { stock_count: 15, expected_stock_count: 11 }), StockConflictError);
  assert.throws(() => planStockUpdate(tee(), { stock_count: 15, expected_stock_count: 25 }), /per-size/);
  assert.throws(() => planStockUpdate(cap, { size_stock: { M: 1 }, expected_size_stock: { M: 0 } }), /no per-size/);
});

test("stock edits are validated", () => {
  for (const bad of [
    null,
    {},
    { size_stock: { M: -1 }, expected_size_stock: { M: 1 } },
    { size_stock: { M: 1.5 }, expected_size_stock: { M: 1 } },
    { size_stock: { M: "3" }, expected_size_stock: { M: 1 } },
    { size_stock: { M: 3 } },
    { size_stock: { M: 3 }, expected_size_stock: { M: 1 }, price_cents: 0 },
    { size_stock: {}, expected_size_stock: {} },
    { stock_count: 3 },
  ]) {
    assert.throws(() => validateStockEdit(bad), JSON.stringify(bad));
  }
  assert.throws(() => planStockUpdate(tee(), { size_stock: { XXL: 3 }, expected_size_stock: { XXL: 0 } }), /no size XXL/);
});

test("sold counts paid orders, held counts unpaid checkout holds", () => {
  const usage = tallyStockUsage(
    [
      { id: "paid", status: "paid", stock_state: "committed" },
      { id: "old-paid", status: "paid", stock_state: "none" },
      { id: "late-paid-no-stock", status: "paid", stock_state: "released" },
      { id: "checkout", status: "pending_payment", stock_state: "reserved" },
      { id: "expired", status: "expired", stock_state: "released" },
    ],
    [
      { order_id: "paid", product_id: "tee", size: "M", quantity: 2 },
      { order_id: "old-paid", product_id: "tee", size: "M", quantity: 1 },
      { order_id: "late-paid-no-stock", product_id: "tee", size: "M", quantity: 1 },
      { order_id: "checkout", product_id: "tee", size: "M", quantity: 1 },
      { order_id: "checkout", product_id: "cap", size: null, quantity: 3 },
      { order_id: "expired", product_id: "tee", size: "L", quantity: 1 },
    ],
  );
  assert.deepEqual(usage, { tee: { M: { sold: 3, held: 1 } }, cap: { "": { sold: 0, held: 3 } } });
});

function fakeRes() {
  return {
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
}

function stateWith(product: Row, extra: Partial<DbState> = {}): DbState {
  return {
    orders: [],
    order_items: [],
    payment_transactions: [],
    payment_webhook_events: [],
    products: [product],
    decrementCalls: [],
    ...extra,
  } as DbState;
}

async function patch(state: DbState, body: unknown) {
  process.env.ADMIN_TOKEN = "admin-secret";
  setSupabaseAdminForTests(createFakeSupabase(state) as never);
  const res = fakeRes();
  try {
    await productHandler(
      { method: "PATCH", headers: { "x-admin-token": "admin-secret" }, query: { id: "tee" }, body } as never,
      res as never,
    );
  } finally {
    setSupabaseAdminForTests(null);
    delete process.env.ADMIN_TOKEN;
  }
  return res;
}

test("PATCH stock saves the new size numbers", async () => {
  const state = stateWith({ id: "tee", ...tee(), updated_at: "2026-10-03T08:00:00.000000+00:00" });
  const res = await patch(state, { stock: { size_stock: { M: 0 }, expected_size_stock: { M: 1 } } });
  assert.equal(res.statusCode, 200);
  const row = (state as unknown as { products: Row[] }).products[0];
  assert.deepEqual(row.size_stock, { S: 5, M: 0, L: 12, XL: 7 });
  assert.equal(row.stock_count, 24);
});

test("PATCH stock returns 409 and changes nothing when the size moved", async () => {
  const state = stateWith({ id: "tee", ...tee(), updated_at: "2026-10-03T08:00:00.000000+00:00" });
  const res = await patch(state, { stock: { size_stock: { M: 5 }, expected_size_stock: { M: 2 } } });
  assert.equal(res.statusCode, 409);
  assert.match(String(res.body!.error), /M changed from 2 to 1/);
  assert.deepEqual((state as unknown as { products: Row[] }).products[0].size_stock, tee().size_stock);
  assert.equal(state.writes ?? 0, 0);
});

test("PATCH stock can't be mixed with sale fields", async () => {
  const state = stateWith({ id: "tee", ...tee(), updated_at: "x" });
  const res = await patch(state, { stock: { size_stock: { M: 5 }, expected_size_stock: { M: 1 } }, sale_price_cents: 100 });
  assert.equal(res.statusCode, 400);
});

test("admin summary reports sold and held units per product and size", async () => {
  const state = stateWith(
    { id: "tee", slug: "smilano-tee", ...tee(), created_at: "2026-01-01T00:00:00Z" },
    {
      orders: [
        { id: "o1", status: "paid", stock_state: "committed", created_at: "2026-10-02T07:00:00Z" },
        { id: "o2", status: "pending_payment", stock_state: "reserved", created_at: "2026-10-02T07:01:00Z" },
      ],
      order_items: [
        { order_id: "o1", product_id: "tee", product_name: "Tee", size: "M", quantity: 9 },
        { order_id: "o2", product_id: "tee", product_name: "Tee", size: "M", quantity: 1 },
      ],
    },
  );
  process.env.ADMIN_TOKEN = "admin-secret";
  setSupabaseAdminForTests(createFakeSupabase(state) as never);
  const res = fakeRes();
  try {
    await summaryHandler(
      { method: "GET", url: "/api/admin/summary", headers: { "x-admin-token": "admin-secret" }, query: {} } as never,
      res as never,
    );
  } finally {
    setSupabaseAdminForTests(null);
    delete process.env.ADMIN_TOKEN;
  }
  assert.equal(res.statusCode, 200);
  const [product] = res.body!.products as Array<{ stock_usage: unknown }>;
  assert.deepEqual(product.stock_usage, { M: { sold: 9, held: 1 } });
});
