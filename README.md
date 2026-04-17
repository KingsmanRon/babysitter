# BABYSITTER

E-commerce site for the BABYSITTER drop. Single-product, single-page shop with a Yoco-hosted checkout and webhook-confirmed payment state.

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
| `PUBLIC_SITE_URL` | Optional override; defaults to `https://$VERCEL_URL` in production or `http://localhost:5173` in dev |

### Client-safe (exposed to the browser)

| Name | Description |
| --- | --- |
| `VITE_SUPABASE_URL` | Same value as `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (safe under RLS) |
| `VITE_ADMIN_TOKEN` | Only used by the `/admin` page UI to call the admin API |

### Security warning

**Never** prefix `YOCO_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` with `VITE_`. Any var with `VITE_` is inlined into the client bundle and will leak to the browser.

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
VITE_ADMIN_TOKEN=<same-as-ADMIN_TOKEN>
```

## Supabase setup

1. Create a new project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run `/supabase/migrations/0001_init.sql`.
3. Run `/supabase/seed.sql` to insert the BABYSITTER product.
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

The webhook must be registered against a publicly reachable URL, so you need at least one deploy first.

1. Deploy to Vercel so `/api/webhooks/yoco` exists at a public URL (e.g. `https://<your-vercel-url>/api/webhooks/yoco`).
2. In the Yoco dashboard, go to **Developers -> Webhooks -> Add endpoint**.
3. Subscribe to events: `payment.succeeded` and `payment.failed`.
4. Yoco returns a signing secret (`whsec_...`). Set `YOCO_WEBHOOK_SECRET` in Vercel env vars and redeploy (env changes only take effect on new deployments).
5. Use the **Send test event** button in the Yoco dashboard to verify the endpoint returns `200`.

## End-to-end test flow

1. Open the deployed site.
2. Pick a size, add to cart, fill in email and name, click **Pay**.
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
   - `products.stock_count` has been decremented.

## Going live

1. In Vercel, set **Production** env vars:
   - `YOCO_SECRET_KEY = sk_live_...`
   - `YOCO_WEBHOOK_SECRET = <live webhook secret from Yoco>`
2. Redeploy. Env var changes do not apply to existing deployments.
3. Rotate any test keys that were exposed (screenshots, shared docs, etc.). Generate new test keys in the Yoco dashboard.

## Architecture notes

- **Source of truth for payment state is the webhook**, not the success-page redirect. The redirect URL is advisory — users can close the tab, lose network, or hit back. The webhook is the authoritative write.
- **Idempotency on webhooks**: `payment_webhook_events` has a unique constraint on `(provider, provider_event_id)`, so duplicate deliveries from Yoco are dropped at the database level.
- **Idempotency on checkout creation**: re-clicking Pay on the same order returns the existing Yoco checkout URL instead of creating a duplicate session.
- **Stock decrement is atomic**: stock is decremented via the Postgres function `decrement_stock(product_id, qty)` and **only** when a verified `payment.succeeded` webhook arrives. Adding to cart does not reserve stock.
- **Live stock counts**: the frontend subscribes to Supabase Realtime `UPDATE` events on the `products` table, so stock counts update live without polling.
- **No card data is stored**. Only safe metadata (card brand, last 4 digits) from Yoco's payment method details is persisted.

## Admin

- The `/admin` page in the frontend prompts for `ADMIN_TOKEN`, then shows orders, transactions, and product stock.
- `/api/admin/summary` returns the same data as JSON. Authenticate with either:
  - `X-Admin-Token: <token>` header, or
  - `?token=<token>` query param.

Example:

```bash
curl -H "X-Admin-Token: $ADMIN_TOKEN" https://<your-vercel-url>/api/admin/summary
```

## File map

### Frontend

- `src/App.tsx` — landing + product + cart + checkout modal. Talks to `/api`.
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
- `api/webhooks/yoco.ts` — `POST` raw-body webhook receiver.
- `api/admin/summary.ts` — `GET` admin summary (token-gated).

### Server libs

- `lib/yoco.ts` — `createYocoCheckout`, `verifyYocoWebhook`, `handleYocoWebhook`.
- `lib/supabaseAdmin.ts` — service-role Supabase client.
- `lib/rawBody.ts` — raw body reader for the webhook (needed for signature verification).
- `lib/env.ts` — typed env access with helpful error messages.

### Database

- `supabase/migrations/0001_init.sql` — schema, RLS policies, `decrement_stock` function, realtime publication.
- `supabase/seed.sql` — initial BABYSITTER product.
