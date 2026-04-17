import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyYocoWebhook, handleYocoWebhook, YocoWebhookEvent } from "../../lib/yoco.js";
import { readRawBody } from "../../lib/rawBody.js";
import { log } from "../../lib/logger.js";

// Disable Vercel's built-in JSON body parser so we can access the raw body
// for HMAC signature verification.
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  let rawBody: Buffer;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    log.error("webhook.yoco.read_body_failed", { err: (err as Error).message });
    return res.status(400).json({ error: "Invalid body" });
  }

  const verification = verifyYocoWebhook(req.headers, rawBody);
  const signatureValid = verification.ok === true;
  if (!signatureValid) {
    log.warn("webhook.yoco.signature_invalid", { reason: (verification as { ok: false; reason: string }).reason });
    // We still try to persist the event (with signature_valid=false) for audit,
    // but we respond 401 so Yoco retries if applicable.
  }

  let event: YocoWebhookEvent;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }
  if (!event.id || !event.type) {
    return res.status(400).json({ error: "Malformed event" });
  }

  try {
    await handleYocoWebhook(event, req.headers, signatureValid);
  } catch (err) {
    log.error("webhook.yoco.handler_error", {
      eventId: event.id,
      type: event.type,
      err: (err as Error).message,
    });
    return res.status(500).json({ error: "Webhook handler failed" });
  }

  if (!signatureValid) {
    return res.status(401).json({ error: "Invalid signature" });
  }
  return res.status(200).json({ received: true });
}
