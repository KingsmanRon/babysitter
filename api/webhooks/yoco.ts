import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyYocoWebhook, handleYocoWebhook, YocoWebhookEvent } from "../../lib/yoco.js";
import { readRawBody } from "../../lib/rawBody.js";
import { log } from "../../lib/logger.js";

// Next.js-style hint; Vercel's plain Node runtime ignores it and still buffers
// the body, which is why readRawBody reads the replayed data/end events.
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

  // Verify before reading anything from the body. An unverified delivery is
  // rejected without being parsed, stored or logged: its contents (event id,
  // type, order) are attacker-controlled until the signature checks out.
  const verification = verifyYocoWebhook(req.headers, rawBody);
  if (!verification.ok) {
    const webhookId = req.headers["webhook-id"];
    log.warn("webhook.yoco.signature_invalid", {
      reason: verification.reason,
      // Header only, for correlating deliveries in Yoco's dashboard.
      webhookId: typeof webhookId === "string" ? webhookId.slice(0, 64) : null,
    });
    return res.status(401).json({ error: "Invalid signature" });
  }

  let event: YocoWebhookEvent;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }
  if (!event?.id || !event.type || !event.payload) {
    return res.status(400).json({ error: "Malformed event" });
  }

  try {
    await handleYocoWebhook(event, req.headers);
  } catch (err) {
    log.error("webhook.yoco.handler_error", {
      eventId: event.id,
      type: event.type,
      err: (err as Error).message,
    });
    return res.status(500).json({ error: "Webhook handler failed" });
  }

  return res.status(200).json({ received: true });
}
