-- Add sale pricing fields to products and immutable pricing snapshots to order items.

alter table public.products
  add column if not exists compare_at_price_cents integer null
    check (compare_at_price_cents is null or compare_at_price_cents >= 0),
  add column if not exists sale_price_cents integer null
    check (sale_price_cents is null or sale_price_cents >= 0),
  add column if not exists discount_percent_bps integer null
    check (discount_percent_bps is null or discount_percent_bps between 0 and 10000),
  add column if not exists sale_starts_at timestamptz null,
  add column if not exists sale_ends_at timestamptz null;

alter table public.order_items
  add column if not exists list_unit_price_cents integer null
    check (list_unit_price_cents is null or list_unit_price_cents >= 0),
  add column if not exists discount_cents integer not null default 0
    check (discount_cents >= 0),
  add column if not exists discount_percent_bps integer null
    check (discount_percent_bps is null or discount_percent_bps between 0 and 10000),
  add column if not exists pricing_snapshot jsonb not null default '{}'::jsonb;
