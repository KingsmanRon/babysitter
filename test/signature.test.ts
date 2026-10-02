import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { MAX_WEBHOOK_AGE_SECONDS, signYocoWebhook, verifyYocoWebhook } from "../lib/yoco.js";

const SECRET = `whsec_${crypto.randomBytes(24).toString("base64")}`;
const OTHER_SECRET = `whsec_${crypto.randomBytes(24).toString("base64")}`;
const NOW_MS = Date.parse("2026-10-02T07:51:16.000Z");
const TS = String(Math.floor(NOW_MS / 1000));
// Whitespace and key order exactly as received; re-serialising changes both.
const RAW = Buffer.from('{"id":"evt_vx5YP31ND6ZUrynTwNjh0okx",  "type":"payment.succeeded","payload":{"id":"p_1","amount":60000}}');

function headers(overrides: Record<string, string | undefined> = {}, body = RAW, secret = SECRET) {
  const id = overrides["webhook-id"] ?? "msg_1";
  const ts = overrides["webhook-timestamp"] ?? TS;
  return {
    "webhook-id": id,
    "webhook-timestamp": ts,
    "webhook-signature": signYocoWebhook(secret, id, ts, body),
    ...overrides,
  };
}

function verify(h: Record<string, string | undefined>, body = RAW, nowMs = NOW_MS) {
  return verifyYocoWebhook(h, body, nowMs);
}

test.beforeEach(() => {
  process.env.YOCO_WEBHOOK_SECRET = SECRET;
});
test.after(() => {
  delete process.env.YOCO_WEBHOOK_SECRET;
});

test("accepts a signature over the raw body", () => {
  assert.deepEqual(verify(headers()), { ok: true });
});

test("matches Yoco's spec: base64 HMAC-SHA256 of id.timestamp.body keyed by the decoded secret", () => {
  const key = Buffer.from(SECRET.slice("whsec_".length), "base64");
  const sig = crypto.createHmac("sha256", key).update(`msg_1.${TS}.${RAW.toString()}`).digest("base64");
  assert.deepEqual(verify({ "webhook-id": "msg_1", "webhook-timestamp": TS, "webhook-signature": `v1,${sig}` }), { ok: true });
});

test("rejects the same JSON re-serialised", () => {
  const reserialised = Buffer.from(JSON.stringify(JSON.parse(RAW.toString())));
  assert.notDeepEqual(reserialised, RAW);
  assert.deepEqual(verify(headers(), reserialised), { ok: false, reason: "signature mismatch" });
});

test("rejects a tampered body", () => {
  const tampered = Buffer.from(RAW.toString().replace("60000", "1"));
  assert.deepEqual(verify(headers(), tampered), { ok: false, reason: "signature mismatch" });
});

test("rejects a delivery signed with another subscription's secret", () => {
  assert.deepEqual(verify(headers({}, RAW, OTHER_SECRET)), { ok: false, reason: "signature mismatch" });
});

test("accepts any matching v1 entry among several, and ignores other versions", () => {
  const good = signYocoWebhook(SECRET, "msg_1", TS, RAW);
  const bad = signYocoWebhook(OTHER_SECRET, "msg_1", TS, RAW);
  assert.deepEqual(verify(headers({ "webhook-signature": `${bad} ${good}` })), { ok: true });

  const value = good.slice("v1,".length);
  assert.equal(verify(headers({ "webhook-signature": `v2,${value}` })).ok, false);
  assert.equal(verify(headers({ "webhook-signature": value })).ok, false);
});

test("enforces the timestamp tolerance in both directions", () => {
  const at = (offsetSeconds: number) => String(Math.floor(NOW_MS / 1000) + offsetSeconds);
  assert.equal(verify(headers({ "webhook-timestamp": at(-MAX_WEBHOOK_AGE_SECONDS) })).ok, true);
  assert.equal(verify(headers({ "webhook-timestamp": at(-MAX_WEBHOOK_AGE_SECONDS - 1) })).ok, false);
  assert.equal(verify(headers({ "webhook-timestamp": at(MAX_WEBHOOK_AGE_SECONDS + 1) })).ok, false);
  assert.equal(verify(headers({ "webhook-timestamp": "17000000a0" })).ok, false);
});

test("rejects missing headers and a missing secret", () => {
  assert.equal(verify({ ...headers(), "webhook-signature": undefined }).ok, false);
  assert.equal(verify({ ...headers(), "webhook-id": undefined }).ok, false);
  delete process.env.YOCO_WEBHOOK_SECRET;
  assert.deepEqual(verify(headers()), { ok: false, reason: "YOCO_WEBHOOK_SECRET not configured" });
});

test("tolerates a pasted secret with a trailing newline", () => {
  process.env.YOCO_WEBHOOK_SECRET = `${SECRET}\n`;
  assert.deepEqual(verify(headers()), { ok: true });
});

test("verifies the exact bytes, even ones that aren't valid UTF-8", () => {
  const body = Buffer.concat([Buffer.from('{"id":"evt_1","note":"'), Buffer.from([0xff, 0xfe]), Buffer.from('"}')]);
  assert.deepEqual(verify(headers({}, body), body), { ok: true });
  const lossy = Buffer.from(body.toString("utf8"));
  assert.equal(verify(headers({}, body), lossy).ok, false);
});
