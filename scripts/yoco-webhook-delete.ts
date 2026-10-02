// Deletes ONE Yoco webhook subscription by id. Changes your Yoco account, so
// it shows what it would delete and only acts with --yes.
//   YOCO_SECRET_KEY=sk_live_... npm run yoco:webhook:delete -- <subscription-id> --yes
import { deleteYocoWebhook, listYocoWebhooks } from "../lib/yocoApi.js";
import { keyMode, run } from "./cli.js";

await run(async () => {
  const mode = keyMode();
  const args = process.argv.slice(2);
  const id = args.find((arg) => !arg.startsWith("--"));
  if (!id) {
    console.error("Usage: npm run yoco:webhook:delete -- <subscription-id> --yes");
    process.exit(1);
  }

  const target = (await listYocoWebhooks()).find((sub) => sub.id === id);
  if (!target) {
    console.error(`No ${mode} webhook subscription with id ${id}. Run npm run yoco:webhooks:list.`);
    process.exit(1);
  }
  console.log(`Target (${mode}): ${target.id}  ${target.name ?? "-"}  ${target.url}`);

  if (!args.includes("--yes")) {
    console.log("Dry run. Re-run with --yes to delete it.");
    process.exit(1);
  }

  await deleteYocoWebhook(id);
  const remaining = await listYocoWebhooks();
  console.log(`Deleted ${id}. ${remaining.length} subscription(s) remain:`);
  for (const sub of remaining) console.log(`  ${sub.id}  ${sub.name ?? "-"}  ${sub.url}`);
});
