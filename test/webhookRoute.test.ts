import test, { mock } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { PassThrough } from "node:stream";
import handler from "../api/webhooks/yoco.js";
import { signYocoWebhook } from "../lib/yoco.js";
import { setSupabaseAdminForTests } from "../lib/supabaseAdmin.js";
import { createFakeSupabase, pendingOrderState, type DbState } from "./fakeSupabase.js";

const SECRET = `whsec_${crypto.randomBytes(24).toString("base64")}`;
const STRAY_SECRET = `whsec_${crypto.randomBytes(24).toString("base64")}`;

const EVENT = {
  id: "evt_vx5YP31ND6ZUrynTwNjh0okx",
  type: "payment.succeeded",
  createdDate: "2026-10-02T07:51:15.000Z",
  payload: {
    id: "p_rEy7ezAYVoXSYJafPKwc6vRx",
    status: "succeeded",
    amount: 60000,
    currency: "ZAR",
    metadata: { checkoutId: "checkout-1", orderId: "order-1" },
    paymentMethodDetails: { type: "card", card: { scheme: "visa", maskedCard: "************6972" } },
  },
};

function deliver(body: Buffer, secret: string, webhookId = "msg_1") {
  const ts = String(Math.floor(Date.now() / 1000));
  const req = new PassThrough() as PassThrough & { method: string; headers: Record<string, string> };
  req.method = "POST";
  req.headers = {
    "content-type": "application/json",
    "webhook-id": webhookId,
    "webhook-timestamp": ts,
    "webhook-signature": signYocoWebhook(secret, webhookId, ts, body),
  };
  req.end(body);

  const res = {
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
  return handler(req as never, res as never).then(() => res);
}

async function withDb<T>(state: DbState, fn: () => Promise<T>): Promise<{ result: T; logs: string }> {
  process.env.YOCO_WEBHOOK_SECRET = SECRET;
  setSupabaseAdminForTests(createFakeSupabase(state) as never);
  const lines: string[] = [];
  const capture = (...args: unknown[]) => void lines.push(args.join(" "));
  const spies = [mock.method(console, "log", capture), mock.method(console, "warn", capture), mock.method(console, "error", capture)];
  try {
    return { result: await fn(), logs: lines.join("\n") };
  } finally {
    spies.forEach((spy) => spy.mock.restore());
    setSupabaseAdminForTests(null);
    delete process.env.YOCO_WEBHOOK_SECRET;
  }
}

test("an unverified delivery gets 401 and nothing from its body is stored or logged", async () => {
  const state = pendingOrderState();
  const body = Buffer.from(JSON.stringify(EVENT));
  const { result: res, logs } = await withDb(state, () => deliver(body, STRAY_SECRET));

  assert.equal(res.statusCode, 401);
  assert.equal(state.payment_webhook_events.length, 0);
  assert.equal(state.writes ?? 0, 0);
  assert.equal(state.orders[0].status, "pending_payment");
  assert.match(logs, /webhook\.yoco\.signature_invalid/);
  assert.doesNotMatch(logs, /evt_vx5|payment\.succeeded|order-1/);
});

test("an unverified body is never parsed, so even invalid JSON gets 401 rather than 400", async () => {
  const { result: res } = await withDb(pendingOrderState(), () => deliver(Buffer.from("not json"), STRAY_SECRET));
  assert.equal(res.statusCode, 401);
});

test("production sequence: one verified and three stray-subscription deliveries pay the order exactly once", async () => {
  const state = pendingOrderState();
  const body = Buffer.from(JSON.stringify(EVENT));
  const { result } = await withDb(state, async () => {
    // Both subscriptions deliver at once, then Yoco retries the rejected one.
    const [verified, stray] = await Promise.all([deliver(body, SECRET, "msg_a"), deliver(body, STRAY_SECRET, "msg_b")]);
    const retry1 = await deliver(body, STRAY_SECRET, "msg_b");
    const retry2 = await deliver(body, STRAY_SECRET, "msg_b");
    const replay = await deliver(body, SECRET, "msg_a");
    return [verified, stray, retry1, retry2, replay].map((r) => r.statusCode);
  });

  assert.deepEqual(result, [200, 401, 401, 401, 200]);
  assert.equal(state.orders[0].status, "paid");
  assert.equal(state.decrementCalls.length, 1);
  assert.equal(state.payment_webhook_events.length, 1);
  assert.equal(state.payment_webhook_events[0].signature_valid, true);
  assert.equal(state.payment_transactions[0].payment_method_brand, "visa");
  assert.equal(state.payment_transactions[0].payment_method_last4, "6972");
});
