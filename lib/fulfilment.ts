// Fulfilment steps for paid orders. Kept apart from payment status (orders.status)
// so payment reconciliation and fulfilment never overwrite each other.

export const DELIVERY_STEPS = ["unfulfilled", "packed", "out_for_delivery", "delivered"] as const;
export const COLLECTION_STEPS = ["unfulfilled", "packed", "ready_for_collection", "collected"] as const;

export type FulfilmentStatus = (typeof DELIVERY_STEPS)[number] | (typeof COLLECTION_STEPS)[number];
export type FulfilmentMethod = "delivery" | "collection";

// Index of the step at which the order has left us (dispatched / ready) and
// the one at which the customer has it (delivered / collected).
const DISPATCHED_STEP = 2;
const DONE_STEP = 3;

export function stepsFor(method: FulfilmentMethod | string | null | undefined): readonly FulfilmentStatus[] {
  return method === "collection" ? COLLECTION_STEPS : DELIVERY_STEPS;
}

export type FulfilmentInput = {
  fulfilment_status?: unknown;
  courier?: unknown;
  tracking_number?: unknown;
};

export type CurrentOrder = {
  status: string;
  fulfilment_method: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
};

function optionalText(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`${field} must be a string or null`);
  const trimmed = value.trim();
  if (trimmed.length > 100) throw new Error(`${field} must be 100 characters or fewer`);
  return trimmed || null;
}

// Validates an admin update and returns the columns to write. Throws with a
// message safe to show the admin.
export function buildFulfilmentUpdate(
  order: CurrentOrder,
  input: FulfilmentInput,
  now: Date = new Date(),
): Record<string, unknown> {
  if (order.status !== "paid") {
    throw new Error("Only paid orders can be packed or shipped");
  }

  const update: Record<string, unknown> = {};

  if (input.fulfilment_status !== undefined) {
    const steps = stepsFor(order.fulfilment_method);
    const index = steps.indexOf(input.fulfilment_status as FulfilmentStatus);
    if (index < 0) {
      throw new Error(
        `fulfilment_status for a ${order.fulfilment_method === "collection" ? "collection" : "delivery"} order must be one of: ${steps.join(", ")}`,
      );
    }
    update.fulfilment_status = steps[index];
    // Keep the first time a step was reached; clear it if the order is moved back.
    update.dispatched_at = index >= DISPATCHED_STEP ? (order.dispatched_at ?? now.toISOString()) : null;
    update.delivered_at = index >= DONE_STEP ? (order.delivered_at ?? now.toISOString()) : null;
  }
  if (input.courier !== undefined) update.courier = optionalText(input.courier, "courier");
  if (input.tracking_number !== undefined) update.tracking_number = optionalText(input.tracking_number, "tracking_number");

  if (Object.keys(update).length === 0) {
    throw new Error("Nothing to update");
  }
  update.fulfilment_updated_at = now.toISOString();
  return update;
}
