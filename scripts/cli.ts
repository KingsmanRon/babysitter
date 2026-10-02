import { YocoApiError } from "../lib/yocoApi.js";

export function keyMode(): string {
  const key = process.env.YOCO_SECRET_KEY || "";
  if (!key) {
    console.error("Set YOCO_SECRET_KEY (sk_live_... for production webhooks, sk_test_... for test ones).");
    process.exit(1);
  }
  return key.startsWith("sk_test_") ? "test" : key.startsWith("sk_live_") ? "live" : "unknown";
}

export async function run(main: () => Promise<void>): Promise<void> {
  try {
    await main();
  } catch (err) {
    if (err instanceof YocoApiError) {
      console.error(`${err.message}\n${err.body}`);
    } else {
      console.error((err as Error).message);
    }
    process.exit(1);
  }
}
