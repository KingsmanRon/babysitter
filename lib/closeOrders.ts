// Closing orders hides them from the admin order list once they're dealt with
// (e.g. the previous drop's orders when the next one goes live). It is a flag
// on top of payment and fulfilment status, which it never changes.

export const MAX_CLOSE_IDS = 200;

// Orders that need nothing more from us: never paid, or paid and handed over.
export const FINISHED_UNPAID_STATUSES = ["payment_failed", "expired", "cancelled", "refunded"];
export const FINISHED_FULFILMENT_STEPS = ["delivered", "collected"];

export type CloseRequest = { closed: boolean } & ({ order_ids: string[] } | { finished: true });

// Validates the admin's request. Throws with a message safe to show the admin.
export function parseCloseRequest(raw: unknown): CloseRequest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Request body must be an object");
  const body = raw as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (!["closed", "order_ids", "finished"].includes(key)) throw new Error(`Unsupported field: ${key}`);
  }
  if (typeof body.closed !== "boolean") throw new Error("closed must be true or false");

  if (body.finished !== undefined) {
    if (body.finished !== true || body.order_ids !== undefined) throw new Error("Send order_ids or finished: true, not both");
    if (!body.closed) throw new Error("Finished orders can only be closed in bulk; reopen them one at a time");
    return { closed: true, finished: true };
  }

  const ids = body.order_ids;
  if (!Array.isArray(ids) || !ids.length) throw new Error("order_ids must be a non-empty list");
  if (ids.length > MAX_CLOSE_IDS) throw new Error(`At most ${MAX_CLOSE_IDS} orders at a time`);
  if (!ids.every((id) => typeof id === "string" && id.trim())) throw new Error("order_ids must be order ids");
  return { closed: body.closed, order_ids: [...new Set(ids.map((id: string) => id.trim()))] };
}
