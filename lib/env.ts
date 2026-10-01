function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set it in Vercel Project Settings → Environment Variables.`,
    );
  }
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const env = {
  get YOCO_SECRET_KEY(): string {
    return required("YOCO_SECRET_KEY");
  },
  get YOCO_WEBHOOK_SECRET(): string | undefined {
    return optional("YOCO_WEBHOOK_SECRET");
  },
  get SUPABASE_URL(): string {
    return required("SUPABASE_URL");
  },
  get SUPABASE_SERVICE_ROLE_KEY(): string {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get PUBLIC_SITE_URL(): string {
    // In production prefer the project's production domain: VERCEL_URL is the
    // per-deployment URL, which Vercel Deployment Protection can put behind a
    // login wall, stranding customers after they pay.
    const host =
      (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
      process.env.VERCEL_URL;
    return optional("PUBLIC_SITE_URL") || (host ? `https://${host}` : "http://localhost:5173");
  },
};

export function processingMode(): "test" | "live" {
  const key = optional("YOCO_SECRET_KEY") || "";
  return key.startsWith("sk_test_") ? "test" : "live";
}
