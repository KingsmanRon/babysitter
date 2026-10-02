// Registers the site's webhook with Yoco, but only if no subscription already
// points at that URL, so running it again (or on every deploy) never creates a
// second subscription with a second secret.
//   YOCO_SECRET_KEY=sk_live_... PUBLIC_SITE_URL=https://babysitterbs.co.za \
//     npm run yoco:webhook:register [-- --url <full webhook url>] [-- --name <name>]
import { registerYocoWebhookOnce } from "../lib/yocoApi.js";
import { keyMode, run } from "./cli.js";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

await run(async () => {
  const mode = keyMode();
  const site = process.env.PUBLIC_SITE_URL?.replace(/\/$/, "");
  const url = flag("--url") ?? (site ? `${site}/api/webhooks/yoco` : undefined);
  if (!url) {
    console.error("Pass --url https://<domain>/api/webhooks/yoco or set PUBLIC_SITE_URL.");
    process.exit(1);
  }
  const name = flag("--name") ?? "babysitter";

  const result = await registerYocoWebhookOnce(url, name);
  if (!result.created) {
    console.log(`Not registering: ${result.existing.length} ${mode} subscription(s) already deliver to ${url}:`);
    for (const sub of result.existing) console.log(`  ${sub.id}  ${sub.name ?? "-"}`);
    if (result.existing.length > 1) {
      console.log("Delete the extras with npm run yoco:webhook:delete -- <id> --yes, keeping the one whose secret is in YOCO_WEBHOOK_SECRET.");
    }
    return;
  }

  console.log(`Registered ${mode} subscription ${result.subscription.id} -> ${url}`);
  if (result.secret) {
    console.log("\nSigning secret (shown once; set it as YOCO_WEBHOOK_SECRET in Vercel, then redeploy):");
    console.log(result.secret);
  } else {
    console.log("Yoco did not return a signing secret; check the subscription in the Yoco dashboard.");
  }
});
