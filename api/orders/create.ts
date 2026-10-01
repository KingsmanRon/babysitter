import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../../lib/supabaseAdmin.js";
import { log } from "../../lib/logger.js";

type ItemInput = { productId: string; size?: string; quantity: number };
type ShippingInput = {
  phone?: string;
  line1?: string;
  line2?: string;
  suburb?: string;
  city?: string;
  province?: string;
  postalCode?: string;
};
type FulfilmentMethod = "delivery" | "collection";
type CreateOrderBody = {
  customerEmail?: string;
  customerName?: string;
  fulfilment?: FulfilmentMethod;
  shipping?: ShippingInput;
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
  delivery_fee_cents: number | null;
  currency: string;
  stock_count: number;
  size_stock: Record<string, number> | null;
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
    if (!item.productId || !Number.isInteger(item.quantity) || item.quantity <= 0) {
      return res.status(400).json({ error: "invalid item" });
    }
  }

  const fulfilment: FulfilmentMethod = body.fulfilment ?? "delivery";
  if (fulfilment !== "delivery" && fulfilment !== "collection") {
    return res.status(400).json({ error: "fulfilment must be delivery or collection" });
  }

  const ship = body.shipping ?? {};
  const shipping = {
    phone: (ship.phone ?? "").trim(),
    line1: (ship.line1 ?? "").trim(),
    line2: (ship.line2 ?? "").trim(),
    suburb: (ship.suburb ?? "").trim(),
    city: (ship.city ?? "").trim(),
    province: (ship.province ?? "").trim(),
    postalCode: (ship.postalCode ?? "").trim(),
  };
  const isDelivery = fulfilment === "delivery";
  // Collection orders only need a phone number so we can arrange pickup.
  const requiredShip: Array<readonly [string, string]> =
    isDelivery
      ? [
          ["phone number", shipping.phone],
          ["street address", shipping.line1],
          ["suburb", shipping.suburb],
          ["city", shipping.city],
          ["province", shipping.province],
          ["postal code", shipping.postalCode],
        ]
      : [["phone number", shipping.phone]];
  const missingShip = requiredShip.find(([, value]) => !value);
  if (missingShip) {
    const label = isDelivery ? "Delivery" : "Contact";
    return res.status(400).json({ error: `${label} ${missingShip[0]} is required` });
  }

  try {
    const db = supabaseAdmin();

    // Hand back units held by checkouts that were abandoned, before checking stock.
    const { error: releaseErr } = await db.rpc("release_expired_reservations");
    if (releaseErr) log.warn("api.orders.create.release_expired_failed", { err: releaseErr.message });

    const productIds = body.items.map((i) => i.productId);
    const { data: products, error: productsErr } = await db
      .from("products")
      .select("id, name, price_cents, delivery_fee_cents, currency, stock_count, size_stock, is_active, compare_at_price_cents, sale_price_cents, discount_percent_bps, sale_starts_at, sale_ends_at")
      .in("id", productIds);
    if (productsErr) throw productsErr;

    const productMap = new Map((products || []).map((p) => [p.id, p]));

    let totalCents = 0;
    // One delivery per order: charge the highest fee among the items.
    let deliveryFeeCents = 0;
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
      if (product.size_stock) {
        const sizeAvailable = item.size ? product.size_stock[item.size] ?? 0 : 0;
        if (sizeAvailable < item.quantity) {
          return res.status(409).json({
            error: item.size ? `Size ${item.size} is sold out for ${product.name}` : `A size is required for ${product.name}`,
            productId: product.id,
          });
        }
      }
      const pricing = calculatePricingSnapshot(product, now);

      totalCents += pricing.effectiveUnitPriceCents * item.quantity;
      if (isDelivery) {
        deliveryFeeCents = Math.max(deliveryFeeCents, product.delivery_fee_cents ?? 0);
      }
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

    totalCents += deliveryFeeCents;

    const orderNumber = generateOrderNumber();
    const { data: order, error: orderErr } = await db
      .from("orders")
      .insert({
        order_number: orderNumber,
        customer_email: body.customerEmail ?? null,
        customer_name: body.customerName ?? null,
        fulfilment_method: fulfilment,
        delivery_fee_cents: deliveryFeeCents,
        ship_phone: shipping.phone,
        ship_line1: isDelivery ? shipping.line1 : null,
        ship_line2: isDelivery ? shipping.line2 || null : null,
        ship_suburb: isDelivery ? shipping.suburb : null,
        ship_city: isDelivery ? shipping.city : null,
        ship_province: isDelivery ? shipping.province : null,
        ship_postal_code: isDelivery ? shipping.postalCode : null,
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

    // Hold the units for this buyer while they pay. The check above can race
    // other buyers; this is the atomic, all-or-nothing step.
    const { data: reserved, error: reserveErr } = await db.rpc("reserve_order_stock", {
      p_order_id: order.id,
    });
    if (reserveErr || reserved !== true) {
      await db.from("orders").delete().eq("id", order.id);
      if (reserveErr) throw reserveErr;
      log.info("api.orders.create.sold_out", { orderId: order.id });
      return res.status(409).json({ error: "Sorry, that size just sold out. Pick another size." });
    }

    log.info("api.orders.create.ok", { orderId: order.id, orderNumber });
    return res.status(201).json({ order });
  } catch (err) {
    log.error("api.orders.create.error", { err: (err as Error).message });
    return res.status(500).json({ error: "Failed to create order" });
  }
}
