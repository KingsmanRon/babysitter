import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createYocoCheckout, handleYocoWebhook, SoldOutError, type YocoWebhookEvent } from "../lib/yoco.js";
import { setSupabaseAdminForTests } from "../lib/supabaseAdmin.js";
import { readRawBody } from "../lib/rawBody.js";
import { PassThrough } from "node:stream";
import type { IncomingMessage } from "node:http";

type Order = { id: string; status: string; metadata?: Record<string, unknown> } & Record<string, unknown>;
type OrderItem = { order_id: string; product_id: string; size?: string | null; quantity: number };
type PaymentTransaction = { id: string; order_id: string; provider_checkout_id: string | null } & Record<string, unknown>;

type DbState = {
  orders: Order[];
  order_items: OrderItem[];
  payment_transactions: PaymentTransaction[];
  payment_webhook_events: Record<string, unknown>[];
  decrementCalls: Array<{ productId: string; quantity: number; size: string | null }>;
  failOrderUpdates?: number;
  soldOut?: boolean;
};

class QueryBuilder {
  private operation: "select" | "insert" | "update" | null = null;
  private selected = "";
  private payload: Record<string, unknown> | null = null;
  private filters: Array<{ column: string; op: "eq" | "neq"; value: unknown }> = [];

  constructor(private readonly state: DbState, private readonly table: string) {}

  select(columns: string) {
    this.operation = this.operation ?? "select";
    this.selected = columns;
    return this;
  }

  insert(payload: Record<string, unknown>) {
    this.operation = "insert";
    this.payload = payload;
    return this.execute();
  }

  update(payload: Record<string, unknown>) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, op: "eq", value });
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push({ column, op: "neq", value });
    return this;
  }

  maybeSingle() {
    return this.execute(true);
  }

  single() {
    return this.execute(true);
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(single = false) {
    if (this.operation === "insert") {
      if (this.table === "payment_webhook_events") {
        const duplicate = this.state.payment_webhook_events.some(
          (row) => row.provider_event_id === this.payload!.provider_event_id,
        );
        if (duplicate) return { data: null, error: { code: "23505", message: "duplicate key" } };
        this.state.payment_webhook_events.push(this.payload!);
      } else if (this.table === "payment_transactions") {
        this.state.payment_transactions.push({ id: `tx-${this.state.payment_transactions.length + 1}`, ...(this.payload as Record<string, unknown>) } as PaymentTransaction);
      }
      return { data: null, error: null };
    }

    let rows = this.rows().filter((row) =>
      this.filters.every((filter) =>
        filter.op === "eq" ? row[filter.column] === filter.value : row[filter.column] !== filter.value,
      ),
    );

    if (this.operation === "update") {
      if (this.table === "orders" && this.state.failOrderUpdates) {
        this.state.failOrderUpdates -= 1;
        return { data: null, error: { code: "57014", message: "statement timeout" } };
      }
      rows.forEach((row) => Object.assign(row, this.payload));
    }

    const data = single ? (rows[0] ?? null) : rows.map((row) => this.project(row));
    return { data, error: null };
  }

  private rows(): Record<string, unknown>[] {
    if (this.table === "orders") return this.state.orders as unknown as Record<string, unknown>[];
    if (this.table === "order_items") return this.state.order_items as unknown as Record<string, unknown>[];
    if (this.table === "payment_transactions") return this.state.payment_transactions as unknown as Record<string, unknown>[];
    if (this.table === "payment_webhook_events") return this.state.payment_webhook_events;
    return [];
  }

  private project(row: Record<string, unknown>) {
    if (!this.selected || this.selected === "*") return row;
    return Object.fromEntries(
      this.selected.split(",").map((column) => column.trim()).map((column) => [column, row[column]]),
    );
  }
}

function createFakeSupabase(state: DbState) {
  return {
    from(table: string) {
      return new QueryBuilder(state, table);
    },
    async rpc(name: string, args: Record<string, unknown>) {
      const orderId = args.p_order_id as string;
      if (name === "commit_order_stock") {
        const ok = !state.soldOut;
        if (ok) {
          for (const item of state.order_items.filter((i) => i.order_id === orderId)) {
            state.decrementCalls.push({ productId: item.product_id, quantity: item.quantity, size: item.size ?? null });
          }
        }
        return { data: ok, error: null };
      }
      if (name === "reserve_order_stock") return { data: !state.soldOut, error: null };
      throw new Error(`unexpected rpc ${name}`);
    },
  };
}

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
    await handleYocoWebhook(paymentSucceededEvent("event-1"), {}, true);
    await handleYocoWebhook(paymentSucceededEvent("event-2"), {}, true);
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
    await handleYocoWebhook(paymentSucceededEvent("event-1", createdDate), {}, true);
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
    await handleYocoWebhook(paymentFailedEvent("event-1", createdDate), {}, true);
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

      await assert.doesNotReject(handleYocoWebhook(event, {}, true));
      assert.equal(state.payment_transactions[0][expectedField], now.toISOString());
    }
  } finally {
    setSupabaseAdminForTests(null);
    mock.timers.reset();
  }
});

function pendingOrderState(): DbState {
  return {
    orders: [{ id: "order-1", status: "pending_payment" }],
    order_items: [{ order_id: "order-1", product_id: "product-1", size: "M", quantity: 1 }],
    payment_transactions: [{ id: "tx-1", order_id: "order-1", provider_checkout_id: "checkout-1", provider: "yoco" }],
    payment_webhook_events: [],
    decrementCalls: [],
  };
}

test("a valid retry of an event first stored with a bad signature still marks the order paid", async () => {
  const state = pendingOrderState();
  setSupabaseAdminForTests(createFakeSupabase(state) as never);

  try {
    await handleYocoWebhook(paymentSucceededEvent("event-1"), {}, false);
    assert.equal(state.orders[0].status, "pending_payment");

    const result = await handleYocoWebhook(paymentSucceededEvent("event-1"), {}, true);
    assert.equal(result.duplicate, undefined);
  } finally {
    setSupabaseAdminForTests(null);
  }

  assert.equal(state.orders[0].status, "paid");
  assert.equal(state.payment_webhook_events[0].signature_valid, true);
  assert.ok(state.payment_webhook_events[0].processed_at);
  assert.equal(state.decrementCalls.length, 1);
});

test("replaying an already processed event is a no-op", async () => {
  const state = pendingOrderState();
  setSupabaseAdminForTests(createFakeSupabase(state) as never);

  try {
    await handleYocoWebhook(paymentSucceededEvent("event-1"), {}, true);
    const replay = await handleYocoWebhook(paymentSucceededEvent("event-1"), {}, true);
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
    await assert.rejects(handleYocoWebhook(paymentSucceededEvent("event-1"), {}, true));
    assert.equal(state.orders[0].status, "pending_payment");
    assert.equal(state.payment_webhook_events[0].processed_at, undefined);

    await handleYocoWebhook(paymentSucceededEvent("event-1"), {}, true);
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
    await handleYocoWebhook(paymentSucceededEvent("event-1"), {}, true);
  } finally {
    setSupabaseAdminForTests(null);
  }

  assert.equal(state.orders[0].status, "paid");
  assert.deepEqual(state.orders[0].metadata?.stock_flags, [{ productId: "product-1", size: "M", quantity: 1 }]);
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
