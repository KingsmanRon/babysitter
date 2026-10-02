// WhatsApp payment reminders for pending orders. Pure functions only: the
// admin sends the message from the shop's own WhatsApp via a wa.me link, so
// there is no messaging API involved.

export const MAX_NUDGES = 2;

// South African mobile numbers: 27 followed by 6, 7 or 8 and eight more digits.
const SA_MOBILE = /^27[6-8]\d{8}$/;

// Normalises what customers type ("065 872 5011", "+27 65 872 5011",
// "639399611", "0027...") to wa.me digits, or null if it isn't an SA mobile.
export function normaliseSaPhone(raw: string | null | undefined): string | null {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `27${digits.slice(1)}`;
  else if (digits.length === 9) digits = `27${digits}`;
  return SA_MOBILE.test(digits) ? digits : null;
}

// Last 9 digits identify a number however it was typed (0693187416,
// 27693187416, +27 69 318 7416 all give 693187416).
export function phoneKey(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : null;
}

export function firstName(fullName: string | null | undefined): string {
  const first = (fullName ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first) return "there";
  return first.charAt(0).toUpperCase() + first.slice(1);
}

// 60000 -> "R600", 59950 -> "R599.50".
export function formatRand(amountCents: number): string {
  const rands = amountCents / 100;
  return Number.isInteger(rands) ? `R${rands}` : `R${rands.toFixed(2)}`;
}

export type NudgeOrder = {
  id: string;
  order_number: string;
  amount_cents: number;
  customer_name: string | null;
};

export function payLine(payUrl: string | null): string {
  return payUrl
    ? `Complete payment here: ${payUrl}`
    : "Reply YES and we'll send you a fresh payment link.";
}

// nudgeNumber is 1 for the first reminder, 2 for the final one.
export function buildNudgeMessage(order: NudgeOrder, nudgeNumber: 1 | 2, payUrl: string | null): string {
  const name = firstName(order.customer_name);
  const amount = formatRand(order.amount_cents);
  const line = payLine(payUrl);
  if (nudgeNumber === 1) {
    return `Hi ${name}, your order ${order.order_number} for ${amount} is reserved but still unpaid, and stock is moving fast. ${line}`;
  }
  return `Hi ${name}, last reminder: we're holding order ${order.order_number} (${amount}) for a few more hours before it's released. ${line}`;
}

export function waMeUrl(phoneDigits: string, message: string): string {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;
}

// ── Superseded orders ─────────────────────────────────────────
// A pending order is superseded when the same customer paid a later order.
// Same customer = same email (case-insensitive) or same last 9 phone digits.

export type CustomerOrder = {
  id: string;
  order_number: string;
  customer_email: string | null;
  ship_phone: string | null;
  created_at: string;
};

export function isSameCustomer(a: CustomerOrder, b: CustomerOrder): boolean {
  const emailA = a.customer_email?.trim().toLowerCase();
  const emailB = b.customer_email?.trim().toLowerCase();
  if (emailA && emailA === emailB) return true;
  const phoneA = phoneKey(a.ship_phone);
  return !!phoneA && phoneA === phoneKey(b.ship_phone);
}

// The paid order that supersedes `pending`, if any: same customer, created later.
export function findSupersedingOrder<T extends CustomerOrder>(pending: CustomerOrder, paidOrders: T[]): T | null {
  const createdAt = Date.parse(pending.created_at);
  return (
    paidOrders.find(
      (paid) => paid.id !== pending.id && Date.parse(paid.created_at) > createdAt && isSameCustomer(pending, paid),
    ) ?? null
  );
}
