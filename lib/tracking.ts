// Customer-facing order tracking. Builds what a customer may see about their
// own order: no street address, phone or email in the response, only the
// suburb/city it is going to.
import { phoneKey } from "./nudge.js";

export const TRACKING_ORDER_COLUMNS =
  "id, order_number, status, amount_cents, currency, customer_email, ship_phone, fulfilment_method, ship_suburb, ship_city, fulfilment_status, courier, tracking_number, dispatched_at, delivered_at, superseded_by, created_at";

export type TrackingOrderRow = {
  id: string;
  order_number: string;
  status: string;
  amount_cents: number;
  currency: string;
  customer_email: string | null;
  ship_phone: string | null;
  fulfilment_method: string | null;
  ship_suburb: string | null;
  ship_city: string | null;
  fulfilment_status: string | null;
  courier: string | null;
  tracking_number: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  superseded_by: string | null;
  created_at: string;
};

export type TrackingItem = { product_name: string; size: string | null; quantity: number };

export type TrackingStep = { key: string; label: string; done: boolean; at: string | null };

export type TrackingView = {
  orderNumber: string;
  placedAt: string;
  amountCents: number;
  currency: string;
  method: "delivery" | "collection";
  // One of: awaiting_payment, payment_failed, expired, processing, packed,
  // out_for_delivery, ready_for_collection, delivered, collected, cancelled,
  // superseded, refunded.
  stage: string;
  headline: string;
  detail: string | null;
  steps: TrackingStep[];
  courier: string | null;
  trackingNumber: string | null;
  destination: string | null;
  items: TrackingItem[];
  // Only while the order can still be paid, for the "Complete payment" link.
  payOrderId: string | null;
};

// "bs-6v8h4g52", " BS 6V8H4G52 ", "6V8H4G52" -> "BS-6V8H4G52".
export function normaliseOrderNumber(input: string | null | undefined): string | null {
  const compact = (input ?? "").toUpperCase().replace(/[\s-]/g, "");
  const code = compact.startsWith("BS") && compact.length === 10 ? compact.slice(2) : compact;
  return /^[A-Z0-9]{8}$/.test(code) ? `BS-${code}` : null;
}

// The customer proves it's their order with the email or phone they ordered with.
export function contactMatches(order: Pick<TrackingOrderRow, "customer_email" | "ship_phone">, contact: string): boolean {
  const value = contact.trim();
  if (!value) return false;
  if (value.includes("@")) {
    return !!order.customer_email && order.customer_email.trim().toLowerCase() === value.toLowerCase();
  }
  const key = phoneKey(value);
  return !!key && key === phoneKey(order.ship_phone);
}

function fulfilmentRank(status: string | null): number {
  switch (status) {
    case "packed":
      return 1;
    case "out_for_delivery":
    case "ready_for_collection":
      return 2;
    case "delivered":
    case "collected":
      return 3;
    default:
      return 0;
  }
}

export function buildTrackingView(order: TrackingOrderRow, items: TrackingItem[], paidAt: string | null): TrackingView {
  const method = order.fulfilment_method === "collection" ? "collection" : "delivery";
  const isCollection = method === "collection";
  const paid = order.status === "paid";
  const rank = paid ? fulfilmentRank(order.fulfilment_status) : -1;

  const steps: TrackingStep[] = [
    { key: "placed", label: "Order placed", done: true, at: order.created_at },
    { key: "paid", label: "Payment received", done: paid, at: paid ? paidAt : null },
    { key: "packed", label: "Packed", done: rank >= 1, at: null },
    {
      key: "dispatched",
      label: isCollection ? "Ready for collection" : "Out for delivery",
      done: rank >= 2,
      at: rank >= 2 ? order.dispatched_at : null,
    },
    {
      key: "done",
      label: isCollection ? "Collected" : "Delivered",
      done: rank >= 3,
      at: rank >= 3 ? order.delivered_at : null,
    },
  ];

  let stage: string;
  let headline: string;
  let detail: string | null = null;
  let payable = false;

  if (paid) {
    stage = ["processing", "packed", isCollection ? "ready_for_collection" : "out_for_delivery", isCollection ? "collected" : "delivered"][rank];
    headline = [
      "Paid, we're getting it ready",
      "Packed and ready to go",
      isCollection ? "Ready for collection" : "Out for delivery",
      isCollection ? "Collected" : "Delivered",
    ][rank];
    if (rank === 2 && isCollection) detail = "We'll be in touch on WhatsApp to arrange pickup.";
  } else if (order.status === "cancelled" && order.superseded_by) {
    stage = "superseded";
    headline = "Replaced by a newer order";
    detail = `You paid for this on order ${order.superseded_by}. Track that one instead.`;
  } else if (order.status === "cancelled") {
    stage = "cancelled";
    headline = "Cancelled";
  } else if (order.status === "refunded") {
    stage = "refunded";
    headline = "Refunded";
  } else if (order.status === "payment_failed") {
    stage = "payment_failed";
    headline = "Payment didn't go through";
    detail = "Your card was declined. You can try again below.";
    payable = true;
  } else if (order.status === "expired") {
    stage = "expired";
    headline = "Payment window closed";
    detail = "This order wasn't paid in time. You can still try to pay if your size is in stock.";
    payable = true;
  } else {
    stage = "awaiting_payment";
    headline = "Waiting for payment";
    detail = "We haven't received payment for this order yet.";
    payable = true;
  }

  return {
    orderNumber: order.order_number,
    placedAt: order.created_at,
    amountCents: order.amount_cents,
    currency: order.currency,
    method,
    stage,
    headline,
    detail,
    steps,
    courier: paid ? order.courier : null,
    trackingNumber: paid ? order.tracking_number : null,
    destination: isCollection ? null : [order.ship_suburb, order.ship_city].filter(Boolean).join(", ") || null,
    items,
    payOrderId: payable ? order.id : null,
  };
}
