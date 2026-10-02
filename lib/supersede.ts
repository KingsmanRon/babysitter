import { log } from "./logger.js";
import { findSupersedingOrder, type CustomerOrder } from "./nudge.js";
import { supabaseAdmin } from "./supabaseAdmin.js";

export const CUSTOMER_COLUMNS = "id, order_number, customer_email, ship_phone, created_at";

// After `paid` is marked paid: cancel the same customer's earlier orders that
// are still waiting on payment (they retried and paid on a new order), and put
// any stock those orders hold back on sale. Returns the cancelled order ids.
export async function supersedeEarlierOrders(paid: CustomerOrder): Promise<string[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("orders")
    .select(CUSTOMER_COLUMNS)
    .eq("status", "pending_payment")
    .lt("created_at", paid.created_at)
    .limit(500);
  if (error) throw new Error(`pending orders lookup failed: ${error.message}`);

  const cancelled: string[] = [];
  for (const pending of (data || []) as CustomerOrder[]) {
    if (findSupersedingOrder(pending, [paid]) === null) continue;

    // Conditional on still pending, so a payment landing on the old order
    // meanwhile is never cancelled.
    const { data: updated, error: updateErr } = await db
      .from("orders")
      .update({ status: "cancelled", cancel_reason: "superseded", superseded_by: paid.order_number })
      .eq("id", pending.id)
      .eq("status", "pending_payment")
      .select("id")
      .maybeSingle();
    if (updateErr) {
      log.error("orders.supersede.update_failed", { orderId: pending.id, err: updateErr.message });
      continue;
    }
    if (!updated) continue;

    // No-op unless the order still holds a stock reservation.
    const { error: releaseErr } = await db.rpc("release_order_stock", { p_order_id: pending.id });
    if (releaseErr) log.warn("orders.supersede.release_failed", { orderId: pending.id, err: releaseErr.message });

    cancelled.push(pending.id);
    log.info("orders.superseded", { orderId: pending.id, supersededBy: paid.order_number });
  }
  return cancelled;
}
