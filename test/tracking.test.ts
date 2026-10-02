import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/orders/track.js";
import { buildTrackingView, contactMatches, normaliseOrderNumber, type TrackingOrderRow } from "../lib/tracking.js";
import { setSupabaseAdminForTests } from "../lib/supabaseAdmin.js";
import { createFakeSupabase, type DbState } from "./fakeSupabase.js";

const ORDER_ID = "6f9b2a4e-1c3d-4e5f-8a9b-0c1d2e3f4a5b";

function orderRow(overrides: Partial<TrackingOrderRow> = {}): TrackingOrderRow & Record<string, unknown> {
  return {
    id: ORDER_ID,
    order_number: "BS-REJ3IH6V",
    status: "paid",
    amount_cents: 60000,
    currency: "ZAR",
    customer_email: "Letsie@Example.com",
    customer_name: "Letsie Moletsane",
    ship_phone: "0683484146",
    ship_line1: "31B Matroosberg Street",
    ship_postal_code: "2499",
    fulfilment_method: "delivery",
    ship_suburb: "Obroholzer",
    ship_city: "Carletonville",
    fulfilment_status: "out_for_delivery",
    courier: "Pargo",
    tracking_number: "PG123456789",
    dispatched_at: "2026-10-02T12:00:00Z",
    delivered_at: null,
    superseded_by: null,
    created_at: "2026-10-02T08:10:04Z",
    ...overrides,
  };
}

test("order numbers are accepted however they're typed", () => {
  assert.equal(normaliseOrderNumber("BS-REJ3IH6V"), "BS-REJ3IH6V");
  assert.equal(normaliseOrderNumber(" bs-rej3ih6v "), "BS-REJ3IH6V");
  assert.equal(normaliseOrderNumber("BS REJ3IH6V"), "BS-REJ3IH6V");
  assert.equal(normaliseOrderNumber("REJ3IH6V"), "BS-REJ3IH6V");
  assert.equal(normaliseOrderNumber("BS-123"), null);
  assert.equal(normaliseOrderNumber(""), null);
});

test("the customer proves it's theirs with their email or phone, in any format", () => {
  const order = orderRow();
  assert.ok(contactMatches(order, "letsie@example.com"));
  assert.ok(contactMatches(order, " LETSIE@EXAMPLE.COM "));
  assert.ok(contactMatches(order, "+27 68 348 4146"));
  assert.ok(contactMatches(order, "27683484146"));
  assert.ok(!contactMatches(order, "someone@example.com"));
  assert.ok(!contactMatches(order, "0820000000"));
  assert.ok(!contactMatches(order, ""));
  assert.ok(!contactMatches({ customer_email: null, ship_phone: null }, "0683484146"));
});

test("a paid delivery out for delivery shows progress, courier and suburb, but never the address", () => {
  const view = buildTrackingView(orderRow(), [{ product_name: "S'MILANO SAVED MY LIFE", size: "XL", quantity: 1 }], "2026-10-02T08:12:00Z");
  assert.equal(view.stage, "out_for_delivery");
  assert.deepEqual(view.steps.map((s) => [s.key, s.done]), [
    ["placed", true],
    ["paid", true],
    ["packed", true],
    ["dispatched", true],
    ["done", false],
  ]);
  assert.equal(view.steps[1].at, "2026-10-02T08:12:00Z");
  assert.equal(view.steps[3].at, "2026-10-02T12:00:00Z");
  assert.equal(view.trackingNumber, "PG123456789");
  assert.equal(view.destination, "Obroholzer, Carletonville");
  assert.equal(view.payOrderId, null);
  const json = JSON.stringify(view);
  for (const secret of ["Matroosberg", "2499", "0683484146", "Letsie@Example.com", "Moletsane"]) {
    assert.ok(!json.includes(secret), `leaked ${secret}`);
  }
});

test("collection orders use ready / collected steps", () => {
  const view = buildTrackingView(orderRow({ fulfilment_method: "collection", fulfilment_status: "collected", delivered_at: "2026-10-03T10:00:00Z" }), [], null);
  assert.equal(view.stage, "collected");
  assert.deepEqual(view.steps.slice(3).map((s) => s.label), ["Ready for collection", "Collected"]);
  assert.equal(view.destination, null);
});

test("unpaid orders offer the payment link and hide fulfilment details", () => {
  const pending = buildTrackingView(orderRow({ status: "pending_payment", fulfilment_status: "unfulfilled" }), [], null);
  assert.equal(pending.stage, "awaiting_payment");
  assert.equal(pending.payOrderId, ORDER_ID);
  assert.equal(pending.trackingNumber, null);
  assert.ok(pending.steps.slice(1).every((s) => !s.done));

  assert.equal(buildTrackingView(orderRow({ status: "expired" }), [], null).payOrderId, ORDER_ID);
  const superseded = buildTrackingView(orderRow({ status: "cancelled", superseded_by: "BS-NEW12345" }), [], null);
  assert.equal(superseded.stage, "superseded");
  assert.match(superseded.detail!, /BS-NEW12345/);
  assert.equal(superseded.payOrderId, null);
});

// ── Endpoint ───────────────────────────────────────────────────

function state(): DbState {
  return {
    orders: [orderRow()],
    order_items: [{ order_id: ORDER_ID, product_name: "S'MILANO SAVED MY LIFE", size: "XL", quantity: 1, unit_price_cents: 50000 }],
    payment_transactions: [
      { id: "t1", order_id: ORDER_ID, provider_checkout_id: "ch_1", paid_at: "2026-10-02T08:12:00Z" },
      { id: "t0", order_id: ORDER_ID, provider_checkout_id: "ch_0", paid_at: null },
    ],
    payment_webhook_events: [],
    decrementCalls: [],
  };
}

async function call(req: Record<string, unknown>) {
  setSupabaseAdminForTests(createFakeSupabase(state()) as never);
  const res = {
    statusCode: 0,
    body: undefined as { order?: ReturnType<typeof buildTrackingView>; error?: string } | undefined,
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
    await handler({ headers: {}, query: {}, ...req } as never, res as never);
  } finally {
    setSupabaseAdminForTests(null);
  }
  return res;
}

test("POST /api/orders/track finds the order by number + email or phone", async () => {
  const byEmail = await call({ method: "POST", body: { orderNumber: "bs-rej3ih6v", contact: "letsie@example.com" } });
  assert.equal(byEmail.statusCode, 200);
  assert.equal(byEmail.body!.order!.stage, "out_for_delivery");
  assert.equal(byEmail.body!.order!.steps[1].at, "2026-10-02T08:12:00Z");
  assert.deepEqual(byEmail.body!.order!.items, [{ product_name: "S'MILANO SAVED MY LIFE", size: "XL", quantity: 1 }]);

  const byPhone = await call({ method: "POST", body: { orderNumber: "REJ3IH6V", contact: "+27 68 348 4146" } });
  assert.equal(byPhone.statusCode, 200);
});

test("wrong details and unknown orders get the same answer", async () => {
  const wrongContact = await call({ method: "POST", body: { orderNumber: "BS-REJ3IH6V", contact: "someone@example.com" } });
  const unknown = await call({ method: "POST", body: { orderNumber: "BS-ZZZZZZZZ", contact: "letsie@example.com" } });
  assert.equal(wrongContact.statusCode, 404);
  assert.equal(unknown.statusCode, 404);
  assert.equal(wrongContact.body!.error, unknown.body!.error);

  const malformed = await call({ method: "POST", body: { orderNumber: "nope", contact: "" } });
  assert.equal(malformed.statusCode, 400);
});

test("GET /api/orders/track?id= works for the private link only", async () => {
  const ok = await call({ method: "GET", url: `/api/orders/track?id=${ORDER_ID}` });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body!.order!.orderNumber, "BS-REJ3IH6V");

  const bad = await call({ method: "GET", url: "/api/orders/track?id=BS-REJ3IH6V" });
  assert.equal(bad.statusCode, 404);
});
