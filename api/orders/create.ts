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
      .select("id, name, price_cents, currency, stock_count, is_active")
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
    }> = [];

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
      totalCents += product.price_cents * item.quantity;
      currency = product.currency;
      itemRows.push({
        product_id: product.id,
        product_name: product.name,
        size: item.size ?? null,
        quantity: item.quantity,
        unit_price_cents: product.price_cents,
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
