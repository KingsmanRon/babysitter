export type Product = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  image_url: string | null;
  images: string[];
  sizes: string[];
  stock_count: number;
  is_active: boolean;
  compare_at_price_cents?: number | null;
  sale_price_cents?: number | null;
  discount_percent_bps?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
};

export type OrderStatus =
  | "draft"
  | "pending_payment"
  | "paid"
  | "payment_failed"
  | "cancelled"
  | "refunded";

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
  const res = await fetch("/api/products", { cache: "no-store" });
  const data = await asJson<{ products: Product[] }>(res);
  return data.products;
}

export async function createOrder(input: {
  customerEmail: string;
  customerName: string;
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
  if (product.sale_price_cents === null || product.sale_price_cents === undefined || product.sale_price_cents <= 0) {
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

export function formatZARFromCents(cents: number): string {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(cents / 100);
}

export function formatZAR(cents: number): string {
  return formatZARFromCents(cents);
}
