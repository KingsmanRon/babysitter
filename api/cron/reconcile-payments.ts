import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { reconcilePendingOrders } from "../../lib/reconcile.js";
import { log } from "../../lib/logger.js";

// Scheduled sweep of orders still waiting on payment (see lib/reconcile.ts).
// Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`; any other
// scheduler can do the same. Add `?dryRun=1` to see what it would change.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return res.status(503).json({ error: "CRON_SECRET not configured" });
  }
  const provided = Buffer.from(String(req.headers.authorization ?? ""));
  const expected = Buffer.from(`Bearer ${secret}`);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Read the flag from the URL directly; req.query goes through Node's
  // deprecated url.parse() inside Vercel's request helpers.
  const dryRun = new URL(req.url ?? "/", "http://localhost").searchParams.get("dryRun") === "1";

  try {
    const summary = await reconcilePendingOrders({ dryRun });
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(summary);
  } catch (err) {
    log.error("api.cron.reconcile.error", { err: (err as Error).message });
    return res.status(500).json({ error: "Reconciliation failed" });
  }
}
