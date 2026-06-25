import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../../lib/supabaseAdmin.js";
import { log } from "../../lib/logger.js";

type ItemInput = { productId: string; size?: string; quantity: number };
type CreateOrderBody = {
  customerEmail?: string;
  customerName?: string;
  items: ItemInput[];
};

function generateOrderNumber(): string {
  const rnd = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `BS-${rnd}`;
}

type ProductRow = {
  id: string;
  name: string;
  price_cents: number;
  currency: string;
  stock_count: number;
  is_active: boolean;
  compare_at_price_cents: number | null;
  sale_price_cents: number | null;
  discount_percent_bps: number | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
};

function calculatePricingSnapshot(product: ProductRow, now = new Date()) {
  const saleStartsAt = product.sale_starts_at ? new Date(product.sale_starts_at) : null;
  const saleEndsAt = product.sale_ends_at ? new Date(product.sale_ends_at) : null;
  const saleIsActive =
    product.sale_price_cents !== null &&
    product.sale_price_cents < product.price_cents &&
    (!saleStartsAt || saleStartsAt <= now) &&
    (!saleEndsAt || saleEndsAt >= now);

  const effectiveUnitPriceCents = saleIsActive ? product.sale_price_cents! : product.price_cents;
  const listUnitPriceCents = product.compare_at_price_cents ?? product.price_cents;
  const discountCents = Math.max(0, listUnitPriceCents - effectiveUnitPriceCents);
  const discountPercentBps =
    listUnitPriceCents > 0 ? Math.round((discountCents / listUnitPriceCents) * 10000) : null;

  return {
    effectiveUnitPriceCents,
    listUnitPriceCents,
    discountCents,
    discountPercentBps,
    pricingSnapshot: {
      product_price_cents: product.price_cents,
      compare_at_price_cents: product.compare_at_price_cents,
      sale_price_cents: product.sale_price_cents,
      product_discount_percent_bps: product.discount_percent_bps,
      sale_starts_at: product.sale_starts_at,
      sale_ends_at: product.sale_ends_at,
      sale_is_active: saleIsActive,
      effective_unit_price_cents: effectiveUnitPriceCents,
      list_unit_price_cents: listUnitPriceCents,
      discount_cents: discountCents,
      discount_percent_bps: discountPercentBps,
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const body = (req.body ?? {}) as CreateOrderBody;
  if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
    return res.status(400).json({ error: "items are required" });
  }
  for (const item of body.items) {
    if (!item.productId || !item.quantity || item.quantity <= 0) {
      return res.status(400).json({ error: "invalid item" });
    }
  }

  try {
    const db = supabaseAdmin();

    const productIds = body.items.map((i) => i.productId);
    const { data: products, error: productsErr } = await db
      .from("products")
      .select("id, name, price_cents, currency, stock_count, is_active, compare_at_price_cents, sale_price_cents, discount_percent_bps, sale_starts_at, sale_ends_at")
      .in("id", productIds);
    if (productsErr) throw productsErr;

    const productMap = new Map((products || []).map((p) => [p.id, p]));

    let totalCents = 0;
    let currency = "ZAR";
    const itemRows: Array<{
      product_id: string;
      product_name: string;
      size: string | null;
      quantity: number;
      unit_price_cents: number;
      list_unit_price_cents: number;
      discount_cents: number;
      discount_percent_bps: number | null;
      pricing_snapshot: Record<string, unknown>;
    }> = [];

    const now = new Date();
    for (const item of body.items) {
      const product = productMap.get(item.productId);
      if (!product || !product.is_active) {
        return res.status(400).json({ error: `Product unavailable: ${item.productId}` });
      }
      if (product.stock_count < item.quantity) {
        return res
          .status(409)
          .json({ error: `Insufficient stock for ${product.name}`, productId: product.id });
      }
      const pricing = calculatePricingSnapshot(product, now);

      totalCents += pricing.effectiveUnitPriceCents * item.quantity;
      currency = product.currency;
      itemRows.push({
        product_id: product.id,
        product_name: product.name,
        size: item.size ?? null,
        quantity: item.quantity,
        unit_price_cents: pricing.effectiveUnitPriceCents,
        list_unit_price_cents: pricing.listUnitPriceCents,
        discount_cents: pricing.discountCents,
        discount_percent_bps: pricing.discountPercentBps,
        pricing_snapshot: pricing.pricingSnapshot,
      });
    }

    const orderNumber = generateOrderNumber();
    const { data: order, error: orderErr } = await db
      .from("orders")
      .insert({
        order_number: orderNumber,
        customer_email: body.customerEmail ?? null,
        customer_name: body.customerName ?? null,
        currency,
        amount_cents: totalCents,
        status: "draft",
      })
      .select("id, order_number, amount_cents, currency, status")
      .single();
    if (orderErr || !order) throw orderErr ?? new Error("Failed to insert order");

    const { error: itemsErr } = await db
      .from("order_items")
      .insert(itemRows.map((r) => ({ ...r, order_id: order.id })));
    if (itemsErr) {
      await db.from("orders").delete().eq("id", order.id);
      throw itemsErr;
    }

    log.info("api.orders.create.ok", { orderId: order.id, orderNumber });
    return res.status(201).json({ order });
  } catch (err) {
    log.error("api.orders.create.error", { err: (err as Error).message });
    return res.status(500).json({ error: "Failed to create order" });
  }
}
