import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  FINISHED_FULFILMENT_STEPS,
  FINISHED_UNPAID_STATUSES,
  parseCloseRequest,
  type CloseRequest,
} from "../../../lib/closeOrders.js";
import { log } from "../../../lib/logger.js";
import { supabaseAdmin } from "../../../lib/supabaseAdmin.js";

function unauthorized(res: VercelResponse) {
  return res.status(401).json({ error: "Unauthorized" });
}

// POST /api/admin/orders/close — close or reopen orders.
//   { order_ids: [...], closed: true | false }  the given orders
//   { finished: true, closed: true }            every open order that is done:
//                                               never paid, or delivered / collected
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const token = process.env.ADMIN_TOKEN?.trim();
  if (!token) {
    return res.status(503).json({ error: "ADMIN_TOKEN not configured" });
  }
  const rawProvided = (req.headers["x-admin-token"] || req.query.token || "") as string | string[];
  const provided = (Array.isArray(rawProvided) ? rawProvided[0] ?? "" : rawProvided).trim();
  if (provided !== token) return unauthorized(res);

  let request: CloseRequest;
  try {
    request = parseCloseRequest(req.body);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }

  try {
    const db = supabaseAdmin();
    const closedAt = request.closed ? new Date().toISOString() : null;
    const changed: string[] = [];

    if ("finished" in request) {
      const [unpaid, handedOver] = await Promise.all([
        db
          .from("orders")
          .update({ closed_at: closedAt })
          .is("closed_at", null)
          .in("status", FINISHED_UNPAID_STATUSES)
          .select("id"),
        db
          .from("orders")
          .update({ closed_at: closedAt })
          .is("closed_at", null)
          .eq("status", "paid")
          .in("fulfilment_status", FINISHED_FULFILMENT_STEPS)
          .select("id"),
      ]);
      if (unpaid.error) throw unpaid.error;
      if (handedOver.error) throw handedOver.error;
      changed.push(...(unpaid.data || []).map((o) => o.id), ...(handedOver.data || []).map((o) => o.id));
    } else {
      // Only touch orders not already in the requested state, so closing twice
      // keeps the original closed_at.
      let query = db.from("orders").update({ closed_at: closedAt }).in("id", request.order_ids);
      query = request.closed ? query.is("closed_at", null) : query.not("closed_at", "is", null);
      const { data, error } = await query.select("id");
      if (error) throw error;
      changed.push(...(data || []).map((o) => o.id));
    }

    log.info("api.admin.orders.close", { closed: request.closed, count: changed.length });
    return res.status(200).json({ closed: request.closed, orderIds: changed });
  } catch (err) {
    log.error("api.admin.orders.close.error", { err: (err as Error).message });
    return res.status(500).json({ error: "Failed to update orders" });
  }
}
