// Read-only: lists the Yoco webhook subscriptions for the key's mode.
//   YOCO_SECRET_KEY=sk_live_... npm run yoco:webhooks:list [-- --json]
import { listYocoWebhooks, normalizeWebhookUrl } from "../lib/yocoApi.js";
import { keyMode, run } from "./cli.js";

await run(async () => {
  const mode = keyMode();
  const subs = await listYocoWebhooks();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(subs, null, 2));
    return;
  }

  console.log(`${subs.length} webhook subscription(s) for this ${mode} key:\n`);
  for (const sub of subs) {
    console.log(`  id:   ${sub.id}\n  name: ${sub.name ?? "-"}\n  mode: ${sub.mode ?? "-"}\n  url:  ${sub.url}\n`);
  }

  const byUrl = new Map<string, string[]>();
  for (const sub of subs) {
    let url = sub.url;
    try {
      url = normalizeWebhookUrl(sub.url);
    } catch {
      // keep as-is
    }
    byUrl.set(url, [...(byUrl.get(url) ?? []), sub.id]);
  }
  for (const [url, ids] of byUrl) {
    if (ids.length > 1) {
      console.log(`WARNING: ${ids.length} subscriptions deliver to ${url}: ${ids.join(", ")}`);
      console.log("Each one signs with its own secret, so only one can match YOCO_WEBHOOK_SECRET.");
    }
  }
});
