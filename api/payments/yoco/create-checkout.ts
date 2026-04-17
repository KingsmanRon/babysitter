import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createYocoCheckout } from "../../../lib/yoco.js";
import { log } from "../../../lib/logger.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { orderId } = (req.body ?? {}) as { orderId?: string };
  if (!orderId) return res.status(400).json({ error: "orderId is required" });

  try {
    const { redirectUrl, checkoutId } = await createYocoCheckout(orderId);
    return res.status(200).json({ redirectUrl, checkoutId });
  } catch (err) {
    const message = (err as Error).message || "Checkout creation failed";
    log.error("api.create_checkout.error", { orderId, err: message });
    return res.status(500).json({ error: "Unable to start checkout. Please try again." });
  }
}
