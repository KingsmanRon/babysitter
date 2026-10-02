// Sends a payment.succeeded webhook signed exactly as Yoco signs it, to test
// the endpoint locally (vercel dev) or on a preview deployment.
//   YOCO_WEBHOOK_SECRET=whsec_... npm run yoco:webhook:send-test -- \
//     --order <order uuid> --checkout <ch_... from payment_transactions> \
//     [--url http://localhost:3000/api/webhooks/yoco] [--bad-signature] [--type payment.failed]
import crypto from "node:crypto";
import { signYocoWebhook } from "../lib/yoco.js";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const secret = process.env.YOCO_WEBHOOK_SECRET?.trim();
const orderId = flag("--order");
const checkoutId = flag("--checkout");
if (!secret || !orderId || !checkoutId) {
  console.error("Needs YOCO_WEBHOOK_SECRET plus --order <order id> --checkout <checkout id>.");
  process.exit(1);
}
const url = flag("--url") ?? "http://localhost:3000/api/webhooks/yoco";
const type = flag("--type") ?? "payment.succeeded";

const event = {
  id: `evt_test_${crypto.randomBytes(8).toString("hex")}`,
  type,
  createdDate: new Date().toISOString(),
  payload: {
    id: `p_test_${crypto.randomBytes(8).toString("hex")}`,
    type: "payment",
    status: type === "payment.failed" ? "failed" : "succeeded",
    amount: Number(flag("--amount") ?? 60000),
    currency: "ZAR",
    mode: "test",
    metadata: { checkoutId, orderId },
    paymentMethodDetails: {
      type: "card",
      card: { expiryMonth: 12, expiryYear: 30, maskedCard: "************1111", scheme: "visa" },
    },
  },
};

const body = Buffer.from(JSON.stringify(event));
const webhookId = `msg_test_${crypto.randomBytes(8).toString("hex")}`;
const timestamp = String(Math.floor(Date.now() / 1000));
const signingSecret = process.argv.includes("--bad-signature") ? `whsec_${crypto.randomBytes(24).toString("base64")}` : secret;

const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "webhook-id": webhookId,
    "webhook-timestamp": timestamp,
    "webhook-signature": signYocoWebhook(signingSecret, webhookId, timestamp, body),
  },
  body,
});
console.log(`${res.status} ${await res.text()}  (event ${event.id}, payment ${event.payload.id})`);
