import { env } from "./env.js";

// Thin client for the Yoco Checkout API endpoints we call outside of checkout
// creation: webhook subscriptions (used by the scripts in /scripts) and
// checkout lookups (used by payment reconciliation).
export const YOCO_API_BASE = "https://payments.yoco.com/api";

export type YocoWebhookSubscription = {
  id: string;
  name?: string;
  url: string;
  mode?: string;
  [key: string]: unknown;
};

export type YocoCheckout = {
  id: string;
  status?: string;
  amount?: number;
  currency?: string;
  paymentId?: string | null;
  metadata?: Record<string, unknown> | null;
  processingMode?: string;
  [key: string]: unknown;
};

export class YocoApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    message: string,
  ) {
    super(message);
    this.name = "YocoApiError";
  }
}

async function yocoRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${YOCO_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.YOCO_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new YocoApiError(res.status, text.slice(0, 500), `Yoco ${init.method || "GET"} ${path} failed (${res.status})`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

// The list endpoint has answered with a bare array and with { subscriptions }
// over time; accept either shape.
function subscriptionsFrom(body: unknown): YocoWebhookSubscription[] {
  if (Array.isArray(body)) return body as YocoWebhookSubscription[];
  if (body && typeof body === "object") {
    for (const key of ["subscriptions", "webhooks", "data"]) {
      const value = (body as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value as YocoWebhookSubscription[];
    }
  }
  return [];
}

export async function listYocoWebhooks(): Promise<YocoWebhookSubscription[]> {
  return subscriptionsFrom(await yocoRequest<unknown>("/webhooks"));
}

export async function deleteYocoWebhook(id: string): Promise<void> {
  await yocoRequest<unknown>(`/webhooks/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function normalizeWebhookUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hostname = parsed.hostname.toLowerCase();
  return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, "")}${parsed.search}`;
}

export type RegisterResult =
  | { created: false; existing: YocoWebhookSubscription[] }
  | { created: true; subscription: YocoWebhookSubscription; secret: string | null };

// Creates a subscription only when none already points at `url`. Yoco only
// reveals a subscription's signing secret at creation, so a second
// subscription is never the fix for a lost secret: delete the old one first.
export async function registerYocoWebhookOnce(url: string, name: string): Promise<RegisterResult> {
  const target = normalizeWebhookUrl(url);
  const existing = (await listYocoWebhooks()).filter((sub) => {
    try {
      return normalizeWebhookUrl(sub.url) === target;
    } catch {
      return false;
    }
  });
  if (existing.length > 0) {
    return { created: false, existing };
  }

  const created = await yocoRequest<YocoWebhookSubscription & { secret?: string }>("/webhooks", {
    method: "POST",
    body: JSON.stringify({ name, url }),
  });
  const { secret, ...subscription } = created;
  return { created: true, subscription, secret: secret ?? null };
}

export async function getYocoCheckout(checkoutId: string): Promise<YocoCheckout> {
  return yocoRequest<YocoCheckout>(`/checkouts/${encodeURIComponent(checkoutId)}`);
}
