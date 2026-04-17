-- BABYSITTER schema: products, orders, order_items, payment_transactions, payment_webhook_events
-- Run in Supabase SQL editor or via `supabase db push`.

create extension if not exists "pgcrypto";

-- ──────────────────────────────────────────────────────────────
-- updated_at trigger helper
-- ──────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ──────────────────────────────────────────────────────────────
-- products
-- ──────────────────────────────────────────────────────────────
create table if not exists public.products (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  name            text not null,
  description     text,
  price_cents     integer not null check (price_cents >= 0),
  currency        text not null default 'ZAR',
  image_url       text,
  images          jsonb not null default '[]'::jsonb,
  sizes           jsonb not null default '[]'::jsonb,
  stock_count     integer not null default 0 check (stock_count >= 0),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
before update on public.products
for each row execute procedure public.set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- orders
-- ──────────────────────────────────────────────────────────────
create table if not exists public.orders (
  id                  uuid primary key default gen_random_uuid(),
  order_number        text unique not null,
  customer_id         uuid,
  customer_email      text,
  customer_name       text,
  currency            text not null default 'ZAR',
  amount_cents        integer not null check (amount_cents >= 0),
  status              text not null default 'draft'
                        check (status in (
                          'draft',
                          'pending_payment',
                          'paid',
                          'payment_failed',
                          'cancelled',
                          'refunded'
                        )),
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
before update on public.orders
for each row execute procedure public.set_updated_at();

create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_created_at_idx on public.orders(created_at desc);

-- ──────────────────────────────────────────────────────────────
-- order_items
-- ──────────────────────────────────────────────────────────────
create table if not exists public.order_items (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  product_id          uuid not null references public.products(id),
  product_name        text not null,
  size                text,
  quantity            integer not null check (quantity > 0),
  unit_price_cents    integer not null check (unit_price_cents >= 0),
  created_at          timestamptz not null default now()
);

create index if not exists order_items_order_id_idx on public.order_items(order_id);

-- ──────────────────────────────────────────────────────────────
-- payment_transactions
-- ──────────────────────────────────────────────────────────────
create table if not exists public.payment_transactions (
  id                          uuid primary key default gen_random_uuid(),
  order_id                    uuid not null references public.orders(id) on delete cascade,
  provider                    text not null default 'yoco',
  provider_checkout_id        text,
  provider_payment_id         text,
  provider_event_id           text,
  provider_status             text,
  amount_cents                integer not null,
  currency                    text not null,
  processing_mode             text,
  payment_method_type         text,
  payment_method_brand        text,
  payment_method_last4        text,
  client_reference_id         text,
  external_id                 text,
  raw_metadata_json           jsonb,
  paid_at                     timestamptz,
  failed_at                   timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

drop trigger if exists trg_payment_transactions_updated_at on public.payment_transactions;
create trigger trg_payment_transactions_updated_at
before update on public.payment_transactions
for each row execute procedure public.set_updated_at();

create index if not exists pt_order_id_idx on public.payment_transactions(order_id);
create index if not exists pt_checkout_id_idx on public.payment_transactions(provider_checkout_id);
create index if not exists pt_payment_id_idx on public.payment_transactions(provider_payment_id);

-- ──────────────────────────────────────────────────────────────
-- payment_webhook_events
-- ──────────────────────────────────────────────────────────────
create table if not exists public.payment_webhook_events (
  id                      uuid primary key default gen_random_uuid(),
  provider                text not null default 'yoco',
  provider_event_id       text not null,
  event_type              text not null,
  webhook_id              text,
  webhook_timestamp       text,
  signature_valid         boolean not null,
  payload_json            jsonb not null,
  processed_at            timestamptz,
  created_at              timestamptz not null default now(),
  constraint payment_webhook_events_unique_event
    unique (provider, provider_event_id)
);

create index if not exists pwe_event_type_idx on public.payment_webhook_events(event_type);

-- ──────────────────────────────────────────────────────────────
-- Atomic stock decrement (used by webhook fulfilment)
-- Returns the new stock_count on success, NULL if insufficient stock.
-- ──────────────────────────────────────────────────────────────
create or replace function public.decrement_stock(p_product_id uuid, p_qty integer)
returns integer
language plpgsql
security definer
as $$
declare
  v_new_stock integer;
begin
  update public.products
     set stock_count = stock_count - p_qty
   where id = p_product_id
     and stock_count >= p_qty
  returning stock_count into v_new_stock;

  return v_new_stock;
end;
$$;

-- ──────────────────────────────────────────────────────────────
-- Row Level Security
-- ──────────────────────────────────────────────────────────────
alter table public.products                enable row level security;
alter table public.orders                  enable row level security;
alter table public.order_items             enable row level security;
alter table public.payment_transactions    enable row level security;
alter table public.payment_webhook_events  enable row level security;

-- Products: public can read active rows only. Writes are service-role only.
drop policy if exists "products_public_read" on public.products;
create policy "products_public_read"
  on public.products for select
  to anon, authenticated
  using (is_active = true);

-- All other tables: no anon/authenticated access. Service role bypasses RLS.
-- (No policies created — default deny.)

-- ──────────────────────────────────────────────────────────────
-- Realtime: publish products table so the frontend can subscribe
-- ──────────────────────────────────────────────────────────────
-- Safe to run repeatedly.
do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'products'
  ) then
    execute 'alter publication supabase_realtime add table public.products';
  end if;
end $$;
