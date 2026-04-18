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
    return (
      optional("PUBLIC_SITE_URL") ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:5173")
    );
  },
};

export function processingMode(): "test" | "live" {
  const key = optional("YOCO_SECRET_KEY") || "";
  return key.startsWith("sk_test_") ? "test" : "live";
}
