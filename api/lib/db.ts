import { Redis } from '@upstash/redis';

// Initialize Redis client from environment variables
// Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

// --- Order types ---
export interface Order {
  orderId: string;
  email: string;
  name: string;
  items: { size: string; quantity: number }[];
  amount: number;
  itemName: string;
  status: 'pending' | 'paid' | 'cancelled' | 'failed';
  createdAt: string;
  updatedAt: string;
}

// Default stock levels (used as initial values and as fallback)
const DEFAULT_STOCK: Record<string, number> = { S: 10, M: 15, L: 10 };

// --- Order operations ---

export async function saveOrder(order: Order): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    console.log('[DB Fallback] Would save order:', order.orderId);
    return false;
  }
  await redis.set(`order:${order.orderId}`, JSON.stringify(order));
  await redis.lpush('orders:list', order.orderId);
  return true;
}

export async function getOrder(orderId: string): Promise<Order | null> {
  const redis = getRedis();
  if (!redis) return null;
  const data = await redis.get<string>(`order:${orderId}`);
  if (!data) return null;
  return typeof data === 'string' ? JSON.parse(data) : data as unknown as Order;
}

export async function updateOrderStatus(
  orderId: string,
  status: Order['status']
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    console.log(`[DB Fallback] Would update order ${orderId} to ${status}`);
    return false;
  }
  const order = await getOrder(orderId);
  if (!order) return false;
  order.status = status;
  order.updatedAt = new Date().toISOString();
  await redis.set(`order:${order.orderId}`, JSON.stringify(order));
  return true;
}

// --- Stock operations ---

export async function initStock(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  // Only initialize if stock keys don't exist yet
  for (const [size, qty] of Object.entries(DEFAULT_STOCK)) {
    const exists = await redis.exists(`stock:${size}`);
    if (!exists) {
      await redis.set(`stock:${size}`, qty);
    }
  }
}

export async function getStock(): Promise<Record<string, number>> {
  const redis = getRedis();
  if (!redis) return { ...DEFAULT_STOCK };
  const sizes = Object.keys(DEFAULT_STOCK);
  const stock: Record<string, number> = {};
  for (const size of sizes) {
    const val = await redis.get<number>(`stock:${size}`);
    stock[size] = val ?? DEFAULT_STOCK[size];
  }
  return stock;
}

export async function decrementStock(
  items: { size: string; quantity: number }[]
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    console.log('[DB Fallback] Would decrement stock:', items);
    return false;
  }
  for (const { size, quantity } of items) {
    const current = await redis.get<number>(`stock:${size}`);
    const newVal = (current ?? DEFAULT_STOCK[size]) - quantity;
    if (newVal < 0) return false; // Not enough stock
    await redis.set(`stock:${size}`, newVal);
  }
  return true;
}
