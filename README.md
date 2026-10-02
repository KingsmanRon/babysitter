# BABYSITTER

E-commerce site for BABYSITTER drops. A landing page and help desk at `/` (and `/help`), plus a page per drop (currently `/smilano`) with a Yoco-hosted checkout and webhook-confirmed payment state.

## Stack

- Vite + React 19 + TypeScript
- Tailwind CSS 4
- react-router-dom for routing
- Vercel serverless functions in `/api`
- Supabase Postgres as the database (with Realtime for live stock counts)
- Yoco Checkout API for payments — checkout sessions are created server-side, and payment state is confirmed by webhook

## Environment variables

All server-only variables must be set in Vercel without the `VITE_` prefix. Anything with `VITE_` is bundled into the browser.

### Server-only (Vercel env vars)

| Name | Description |
| --- | --- |
| `YOCO_SECRET_KEY` | `sk_test_...` in Preview, `sk_live_...` in Production |
| `YOCO_WEBHOOK_SECRET` | `whsec_...` — set after registering the webhook in the Yoco dashboard |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server only, bypasses RLS) |
| `ADMIN_TOKEN` | Any random string used to authenticate `/admin` requests |
| `CRON_SECRET` | Optional. A password you make up (e.g. `openssl rand -hex 32`) that protects `/api/cron/reconcile-payments`. Vercel Cron sends it automatically as `Authorization: Bearer ...`. Without it the daily sweep is skipped (the endpoint answers 503); everything else works |
| `PUBLIC_SITE_URL` | Where Yoco sends customers after paying, e.g. `https://yourdomain.co.za`. Set it in Production. Defaults to the project's production domain in production, `https://$VERCEL_URL` in previews, or `http://localhost:5173` in dev |

### Client-safe (exposed to the browser)

| Name | Description |
| --- | --- |
| `VITE_SUPABASE_URL` | Same value as `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (safe under RLS) |

### Security warning

**Never** prefix `YOCO_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` or `ADMIN_TOKEN` with `VITE_`. Any var with `VITE_` is inlined into the client bundle and will leak to the browser.

Example `.env.local`:

```bash
# Server-only (DO NOT prefix with VITE_)
YOCO_SECRET_KEY=<your-yoco-secret-key>           # sk_test_... in dev, sk_live_... in prod
YOCO_WEBHOOK_SECRET=<your-yoco-webhook-secret>   # whsec_... (set after webhook registration)
SUPABASE_URL=<your-supabase-project-url>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
ADMIN_TOKEN=<any-long-random-string>
PUBLIC_SITE_URL=http://localhost:3000

# Client-safe
VITE_SUPABASE_URL=<same-as-SUPABASE_URL>
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

## Supabase setup

1. Create a new project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run every file in `/supabase/migrations` in filename order (`0001_init.sql` first). `0004_delivery_fee.sql` adds per-product delivery fees and the delivery/collection choice on orders. `0005_size_stock.sql` adds optional per-size inventory (`products.size_stock`) and makes the stock decrement size-aware. `0006_stock_reservations.sql` holds stock for 30 minutes while a buyer pays (see Architecture notes); the API needs it, so order creation fails until it is applied. `0007_payment_reconciliation.sql` is optional (the code doesn't need it): it enforces one row per payment id and backfills card brand / last 4 from stored payloads. `0008_expired_order_status.sql` adds the `expired` order status and must be applied before deploying the reconciliation code.
3. Run `/supabase/seed.sql` to insert the BABYSITTER product and the S'MILANO SAVED MY LIFE tee (R500, plus R100 when delivered; 200 units split 50 each across S, M, L and XL; its page is `/smilano`).
4. In the Supabase dashboard, go to **Database -> Replication** and confirm the `products` table is part of the `supabase_realtime` publication. The migration does this automatically; this step is just a sanity check.
5. Copy the project URL, the service role key, and the anon key into the Vercel env vars listed above (and into `.env.local` for dev).

## Local dev

Install the Vercel CLI globally:

```bash
npm i -g vercel
```

Install deps:

```bash
npm install
```

Create `.env.local` with the env vars listed above. During `vercel dev`, server vars do **not** need the `VITE_` prefix — both sets are loaded from the same file.

Run the full stack locally:

```bash
vercel dev
```

This serves the Vite frontend **and** the `/api` functions on a single port (usually 3000).

Do **not** use plain `npm run dev` for end-to-end testing. That runs Vite alone with no `/api` routes mounted, so checkout creation, order fetches, and the webhook all return 404. Use `npm run dev` only for pure UI work that does not hit the API.

## Yoco webhook registration

There must be exactly **one** Yoco webhook subscription per mode pointing at the site. Each subscription signs with its own secret, so a second one shows up as a duplicate delivery of every event that fails signature checks (401) and is retried by Yoco.

The scripts below call the Yoco API with `YOCO_SECRET_KEY` (use `sk_live_...` for production subscriptions, `sk_test_...` for test ones). They do not read `.env.local`; pass the variables inline.

```bash
# Read-only: list subscriptions, warning when more than one targets the same URL
YOCO_SECRET_KEY=sk_live_... npm run yoco:webhooks:list

# Register, but only if nothing already points at the URL (safe to re-run)
YOCO_SECRET_KEY=sk_live_... PUBLIC_SITE_URL=https://babysitterbs.co.za npm run yoco:webhook:register

# Delete one subscription by id: shows the target, acts only with --yes
YOCO_SECRET_KEY=sk_live_... npm run yoco:webhook:delete -- <subscription-id> --yes
```

Registration prints the signing secret once. Set it as `YOCO_WEBHOOK_SECRET` in Vercel and redeploy (env changes only take effect on new deployments). Nothing registers webhooks automatically on deploy.

To exercise the endpoint with a correctly signed event (locally under `vercel dev`, or against a preview):

```bash
YOCO_WEBHOOK_SECRET=whsec_... npm run yoco:webhook:send-test -- \
  --order <order id> --checkout <provider_checkout_id> [--url http://localhost:3000/api/webhooks/yoco] [--bad-signature]
```

A valid one returns `200` and marks the order paid; `--bad-signature` must return `401` and write nothing.

## End-to-end test flow

1. Open `/smilano` on the deployed site.
2. Pick a size and delivery or collection, click **Cop it**, fill in your details, click **Pay**.
3. The browser redirects to a Yoco-hosted checkout page.
4. Use a Yoco test card:
   - Number: `4111 1111 1111 1111`
   - Expiry: any future date
   - CVV: any three digits
5. After payment, you are redirected back to `/payment/success`.
6. The success page polls `GET /api/orders/<id>` and flips from `pending_payment` to `paid` once the webhook lands.
7. Confirm in Supabase:
   - The `orders` row is `paid`.
   - `payment_transactions` has a `paid_at` timestamp.
   - `payment_webhook_events` contains the event with `signature_valid = true`.
   - `products.stock_count` went down when you clicked **Pay** (the hold), and the order's `stock_state` is `committed`.

## Going live

1. In Vercel, set **Production** env vars:
   - `YOCO_SECRET_KEY = sk_live_...`
   - `YOCO_WEBHOOK_SECRET = <live webhook secret from Yoco>`
2. Redeploy. Env var changes do not apply to existing deployments.
3. Rotate any test keys that were exposed (screenshots, shared docs, etc.). Generate new test keys in the Yoco dashboard.

## Architecture notes

- **Payment state comes from Yoco, not the success-page redirect.** The redirect URL is advisory — users can close the tab, lose network, or hit back. A verified webhook is the normal write; reconciliation (below) covers webhooks that never arrive.
- **Webhooks are verified before anything else.** The signature is checked over the raw request bytes (Standard Webhooks scheme, 3-minute timestamp tolerance). Unverified deliveries get `401` and are neither parsed, stored nor logged beyond the failure reason.
- **Idempotency**: `payment_webhook_events` is unique on `(provider, provider_event_id)`, and `payment_transactions` on checkout id, event id and payment id, so replays update one row. Only the call that moves the order to `paid` commits stock.
- **Reconciliation**: `lib/reconcile.ts` asks Yoco (`GET /api/checkouts/{id}`, read-only) about orders still `pending_payment` or `payment_failed`, starting 2 minutes after their checkout was created. A completed checkout marks the order paid; an expired/cancelled one, or one still unpaid after 60 minutes, marks the order (and its transaction) `expired` and releases its stock. A later successful payment still moves it to `paid`. It runs for the order a buyer is watching (`GET /api/orders/:id`, at most every 30 s per checkout) and as a sweep from `/api/cron/reconcile-payments` (daily via Vercel Cron, the most a Hobby plan allows; on Pro, change the schedule in `vercel.json` to `*/10 * * * *`, or point any scheduler at it with the `CRON_SECRET` bearer token). Add `?dryRun=1` to see what a sweep would change.
- **Idempotency on checkout creation**: re-clicking Pay on the same order returns the existing Yoco checkout URL instead of creating a duplicate session.
- **Stock is held while the buyer pays**: creating an order calls `reserve_order_stock`, which takes every item out of stock atomically (all or nothing) and holds it for 30 minutes. If the last unit is gone, the buyer gets a 409 "sold out" before reaching Yoco, so a drop can't take more payments than it has units.
- **Abandoned holds come back**: `release_expired_reservations` puts unpaid, expired holds back on sale. The API runs it whenever products are listed or an order is created, so no cron job is needed.
- **Payment commits the hold**: a verified `payment.succeeded` webhook calls `commit_order_stock`. If the hold had already expired, it takes the stock again; if the units were sold to someone else meanwhile, the paid order is flagged (`metadata.stock_flags`) and shows "Out of stock: refund" in `/admin`.
- **Stock functions are server-only**: execute rights on the stock functions are revoked from `anon` and `authenticated`, so the public anon key can't change stock.
- **Live stock counts**: the frontend subscribes to Supabase Realtime `UPDATE` events on the `products` table, so stock counts update live without polling.
- **No card data is stored**. Only safe metadata (card brand, last 4 digits) from Yoco's payment method details is persisted.

## Admin

- The `/admin` page in the frontend prompts for `ADMIN_TOKEN`, then shows orders, transactions, and product stock. Type the token in; do not set a `VITE_ADMIN_TOKEN` env var, since it would be published in the site's JavaScript.
- `/api/admin/summary` returns the same data as JSON. Authenticate with either:
  - `X-Admin-Token: <token>` header, or
  - `?token=<token>` query param.

Example:

```bash
curl -H "X-Admin-Token: $ADMIN_TOKEN" https://<your-vercel-url>/api/admin/summary
```


## Manual discount fallback

If the admin discount controls are unavailable, you can apply or remove a BABYSITTER product discount directly in the Supabase SQL Editor. These statements use the sale pricing columns added in `supabase/migrations/0002_sale_pricing_snapshots.sql`.

To apply a 30% discount immediately with no scheduled end time, run:

```sql
update public.products
set
  compare_at_price_cents = price_cents,
  sale_price_cents = round(price_cents * 0.70),
  discount_percent_bps = 3000,
  sale_starts_at = null,
  sale_ends_at = null
where slug = 'babysitter';
```

To schedule the same 30% discount for a specific window, replace the timestamps with your desired `timestamptz` values:

```sql
update public.products
set
  compare_at_price_cents = price_cents,
  sale_price_cents = round(price_cents * 0.70),
  discount_percent_bps = 3000,
  sale_starts_at = '2026-07-01 00:00:00+00',
  sale_ends_at = '2026-07-08 00:00:00+00'
where slug = 'babysitter';
```

Use `null` for either timestamp when you want that side of the sale window to be open-ended. For example, `sale_starts_at = null` starts the sale immediately, and `sale_ends_at = null` leaves it active until manually removed.

To remove the manual discount and return the product to its regular price, run:

```sql
update public.products
set
  compare_at_price_cents = null,
  sale_price_cents = null,
  discount_percent_bps = null,
  sale_starts_at = null,
  sale_ends_at = null
where slug = 'babysitter';
```

After applying or removing the discount, verify `/admin` shows the expected product pricing and confirm the storefront displays the expected BABYSITTER price before accepting orders.

## File map

### Frontend

- `src/pages/Home.tsx` — landing page and help desk (served at `/` and `/help`).
- `src/pages/Smilano.tsx` — S'MILANO drop page with its own checkout. Talks to `/api`.
- `src/pages/Payment*` — payment status pages. Read-only; they rely on the webhook for truth.
- `src/pages/Admin.tsx` — admin orders / transactions / stock view.
- `src/lib/api.ts` — frontend fetch helpers.
- `src/lib/supabase.ts` — browser Supabase client (anon key, used for Realtime).
- `src/hooks/useProducts.ts` — product list + Realtime stock subscription.

### API (Vercel serverless functions)

- `api/products.ts` — `GET` active products.
- `api/orders/create.ts` — `POST` create a draft order.
- `api/orders/[id].ts` — `GET` order status (used by status pages).
- `api/payments/yoco/create-checkout.ts` — `POST` create a Yoco checkout session.
- `api/webhooks/yoco.ts` — `POST` raw-body webhook receiver (the only Yoco webhook route).
- `api/cron/reconcile-payments.ts` — payment reconciliation sweep (`CRON_SECRET`-gated).
- `api/admin/summary.ts` — `GET` admin summary (token-gated).

### Server libs

- `lib/yoco.ts` — `createYocoCheckout`, `verifyYocoWebhook`, `handleYocoWebhook`, `recordPaymentSucceeded`.
- `lib/yocoApi.ts` — Yoco webhook subscription and checkout lookup calls.
- `lib/reconcile.ts` — reconciles open orders against Yoco and expires stale ones.
- `lib/supabaseAdmin.ts` — service-role Supabase client.
- `lib/rawBody.ts` — raw body reader for the webhook (needed for signature verification).
- `lib/env.ts` — typed env access with helpful error messages.

### Database

- `supabase/migrations/0001_init.sql` — schema, RLS policies, `decrement_stock` function, realtime publication.
- `supabase/migrations/0006_stock_reservations.sql` — stock holds: `reserve_order_stock`, `commit_order_stock`, `release_expired_reservations`.
- `supabase/migrations/0007_payment_reconciliation.sql` — optional: payment-id uniqueness, payment-method backfill.
- `supabase/migrations/0008_expired_order_status.sql` — `expired` order status (required by the reconciliation code).

### Scripts and tests

- `scripts/yoco-webhooks-list.ts`, `scripts/yoco-webhook-register.ts`, `scripts/yoco-webhook-delete.ts`, `scripts/send-test-webhook.ts` — see Yoco webhook registration.
- `npm run test:yoco` — signature verification, webhook idempotency, reconciliation and route tests.
- `supabase/seed.sql` — initial BABYSITTER product.
