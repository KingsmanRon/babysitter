// Admin stock editing. The admin edits what is *available to sell now*
// (products.stock_count / size_stock already exclude paid orders and
// checkout holds). Each edit carries the numbers the admin was looking at, so
// a sale that lands while they're typing is never silently overwritten.

export const MAX_STOCK = 100_000;

export type StockSnapshot = { stock_count: number; size_stock: Record<string, number> | null };

export type StockEdit = {
  size_stock?: Record<string, number>;
  expected_size_stock?: Record<string, number>;
  stock_count?: number;
  expected_stock_count?: number;
};

export class StockConflictError extends Error {}

function isStock(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_STOCK;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function validateStockEdit(raw: unknown): StockEdit {
  if (!isRecord(raw)) throw new Error("stock must be an object");
  const allowed = ["size_stock", "expected_size_stock", "stock_count", "expected_stock_count"];
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) throw new Error(`Unsupported stock field: ${key}`);
  }

  if (raw.size_stock !== undefined) {
    if (raw.stock_count !== undefined) throw new Error("Send size_stock or stock_count, not both");
    const sizes = raw.size_stock;
    const expected = raw.expected_size_stock;
    if (!isRecord(sizes) || !isRecord(expected)) throw new Error("size_stock and expected_size_stock must be objects");
    const keys = Object.keys(sizes);
    if (!keys.length) throw new Error("size_stock has no sizes");
    for (const key of keys) {
      if (!isStock(sizes[key])) throw new Error(`Stock for ${key} must be a whole number from 0 to ${MAX_STOCK}`);
      if (!isStock(expected[key])) throw new Error(`expected_size_stock is missing ${key}`);
    }
    return {
      size_stock: sizes as Record<string, number>,
      expected_size_stock: expected as Record<string, number>,
    };
  }

  if (raw.stock_count !== undefined) {
    if (!isStock(raw.stock_count)) throw new Error(`Stock must be a whole number from 0 to ${MAX_STOCK}`);
    if (!isStock(raw.expected_stock_count)) throw new Error("expected_stock_count is required");
    return { stock_count: raw.stock_count, expected_stock_count: raw.expected_stock_count };
  }

  throw new Error("stock needs size_stock or stock_count");
}

// The products update for `edit` against the product as it is now. Sizes the
// admin didn't touch keep their current value; stock_count moves by the same
// amount the sizes did, so it stays the total across sizes.
export function planStockUpdate(current: StockSnapshot, edit: StockEdit): StockSnapshot {
  if (edit.size_stock) {
    if (!current.size_stock) throw new Error("This product has no per-size stock");
    const next = { ...current.size_stock };
    let delta = 0;
    for (const [size, value] of Object.entries(edit.size_stock)) {
      if (!(size in current.size_stock)) throw new Error(`This product has no size ${size}`);
      const now = Number(current.size_stock[size] ?? 0);
      const seen = edit.expected_size_stock![size];
      if (now !== seen) {
        throw new StockConflictError(
          `${size} changed from ${seen} to ${now} while you were editing (a sale or checkout). Check the new numbers and save again.`,
        );
      }
      next[size] = value;
      delta += value - now;
    }
    return { size_stock: next, stock_count: Math.max(0, current.stock_count + delta) };
  }

  if (current.size_stock) throw new Error("This product has per-size stock; edit the sizes");
  if (current.stock_count !== edit.expected_stock_count) {
    throw new StockConflictError(
      `Stock changed from ${edit.expected_stock_count} to ${current.stock_count} while you were editing (a sale or checkout). Check the new number and save again.`,
    );
  }
  return { size_stock: null, stock_count: edit.stock_count! };
}

// ── Sold / held counts for the admin stock table ─────────────────
// Key is the size, or "" for products without sizes.
export type StockUsage = Record<string, Record<string, { sold: number; held: number }>>;

type UsageOrder = { id: string; status: string; stock_state?: string | null };
type UsageItem = { order_id: string; product_id: string | null; size: string | null; quantity: number };

export function tallyStockUsage(orders: UsageOrder[], items: UsageItem[]): StockUsage {
  const byId = new Map(orders.map((o) => [o.id, o]));
  const usage: StockUsage = {};
  for (const item of items) {
    const order = byId.get(item.order_id);
    if (!order || !item.product_id) continue;
    // Paid orders hold sold units, except a late payment that found its size
    // gone (stock_state 'released', flagged for refund). Pre-reservation paid
    // orders have stock_state 'none' but were taken out of stock when paid.
    const sold = order.status === "paid" && order.stock_state !== "released";
    const held = order.status !== "paid" && order.stock_state === "reserved";
    if (!sold && !held) continue;
    const product = (usage[item.product_id] ??= {});
    const entry = (product[item.size ?? ""] ??= { sold: 0, held: 0 });
    if (sold) entry.sold += item.quantity;
    else entry.held += item.quantity;
  }
  return usage;
}
