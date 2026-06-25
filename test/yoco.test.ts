import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { handleYocoWebhook, type YocoWebhookEvent } from "../lib/yoco.js";
import { setSupabaseAdminForTests } from "../lib/supabaseAdmin.js";

type Order = { id: string; status: string };
type OrderItem = { order_id: string; product_id: string; quantity: number };
type PaymentTransaction = { id: string; order_id: string; provider_checkout_id: string | null } & Record<string, unknown>;

type DbState = {
  orders: Order[];
  order_items: OrderItem[];
  payment_transactions: PaymentTransaction[];
  payment_webhook_events: Record<string, unknown>[];
  decrementCalls: Array<{ productId: string; quantity: number }>;
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
      rows.forEach((row) => Object.assign(row, this.payload));
    }

    const data = single ? (rows[0] ?? null) : rows.map((row) => this.project(row));
    return { data, error: null };
  }

  private rows(): Record<string, unknown>[] {
    if (this.table === "orders") return this.state.orders as unknown as Record<string, unknown>[];
    if (this.table === "order_items") return this.state.order_items as unknown as Record<string, unknown>[];
    if (this.table === "payment_transactions") return this.state.payment_transactions as unknown as Record<string, unknown>[];
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
      assert.equal(name, "decrement_stock");
      state.decrementCalls.push({
        productId: args.p_product_id as string,
        quantity: args.p_qty as number,
      });
      return { data: 10, error: null };
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
    order_items: [{ order_id: "order-1", product_id: "product-1", quantity: 2 }],
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
  assert.deepEqual(state.decrementCalls, [{ productId: "product-1", quantity: 2 }]);
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
