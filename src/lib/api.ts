export type Product = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_cents: number;
  delivery_fee_cents?: number | null;
  compare_at_price_cents?: number | null;
  sale_price_cents?: number | null;
  discount_percent_bps?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
  currency: string;
  image_url: string | null;
  images: string[];
  sizes: string[];
  stock_count: number;
  // Per-size counts when the product tracks inventory by size.
  size_stock?: Record<string, number> | null;
  is_active: boolean;
};

export type OrderStatus =
  | "draft"
  | "pending_payment"
  | "paid"
  | "payment_failed"
  | "cancelled"
  | "refunded"
  | "expired";

export type Order = {
  id: string;
  order_number: string;
  status: OrderStatus;
  amount_cents: number;
  currency: string;
  created_at: string;
  updated_at: string;
};

export type OrderItem = {
  product_name: string;
  size: string | null;
  quantity: number;
  unit_price_cents: number;
};

async function asJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let err = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error) err = parsed.error;
    } catch {
      /* ignore */
    }
    throw new Error(err);
  }
  return JSON.parse(text) as T;
}

export async function fetchProducts(): Promise<Product[]> {
  // Default cache mode: "no-store" would send Cache-Control: no-cache and
  // skip the short CDN cache /api/products sets (max-age=0 still revalidates).
  const res = await fetch("/api/products");
  const data = await asJson<{ products: Product[] }>(res);
  return data.products;
}

export type ShippingAddress = {
  phone: string;
  line1: string;
  line2?: string;
  suburb: string;
  city: string;
  province: string;
  postalCode: string;
};

export type FulfilmentMethod = "delivery" | "collection";

export async function createOrder(input: {
  customerEmail: string;
  customerName: string;
  fulfilment?: FulfilmentMethod;
  shipping: ShippingAddress;
  items: Array<{ productId: string; size?: string; quantity: number }>;
}): Promise<Order> {
  const res = await fetch("/api/orders/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await asJson<{ order: Order }>(res);
  return data.order;
}

export async function createYocoCheckout(orderId: string): Promise<{ redirectUrl: string }> {
  const res = await fetch("/api/payments/yoco/create-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId }),
  });
  return asJson<{ redirectUrl: string }>(res);
}

export type TrackingStep = { key: string; label: string; done: boolean; at: string | null };

export type TrackingView = {
  orderNumber: string;
  placedAt: string;
  amountCents: number;
  currency: string;
  method: "delivery" | "collection";
  stage: string;
  headline: string;
  detail: string | null;
  steps: TrackingStep[];
  courier: string | null;
  trackingNumber: string | null;
  destination: string | null;
  items: Array<{ product_name: string; size: string | null; quantity: number }>;
  payOrderId: string | null;
};

// Look up an order by its number plus the email or phone used to order.
export async function trackOrder(orderNumber: string, contact: string): Promise<TrackingView> {
  const res = await fetch("/api/orders/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderNumber, contact }),
  });
  return (await asJson<{ order: TrackingView }>(res)).order;
}

// Look up an order from the private link on the payment pages.
export async function trackOrderById(id: string): Promise<TrackingView> {
  const res = await fetch(`/api/orders/track?id=${encodeURIComponent(id)}`, { cache: "no-store" });
  return (await asJson<{ order: TrackingView }>(res)).order;
}

export async function fetchOrder(id: string): Promise<{ order: Order; items: OrderItem[] }> {
  const res = await fetch(`/api/orders/${id}`, { cache: "no-store" });
  return asJson<{ order: Order; items: OrderItem[] }>(res);
}

export type ActiveSale = {
  isActive: true;
  compareAtPriceCents: number;
  salePriceCents: number;
  discountPercent: number | null;
};

export function getActiveSale(product: Product, now = new Date()): ActiveSale | null {
  if (product.sale_price_cents == null || product.sale_price_cents <= 0) {
    return null;
  }

  const startsAt = product.sale_starts_at ? new Date(product.sale_starts_at) : null;
  const endsAt = product.sale_ends_at ? new Date(product.sale_ends_at) : null;

  if ((startsAt && startsAt > now) || (endsAt && endsAt < now)) {
    return null;
  }

  return {
    isActive: true,
    compareAtPriceCents: product.compare_at_price_cents ?? product.price_cents,
    salePriceCents: product.sale_price_cents,
    discountPercent: product.discount_percent_bps == null ? null : product.discount_percent_bps / 100,
  };
}

export function getEffectiveDisplayPriceCents(product: Product, now = new Date()): number {
  return getActiveSale(product, now)?.salePriceCents ?? product.price_cents;
}

export function formatZarFromCents(cents: number): string {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(cents / 100);
}