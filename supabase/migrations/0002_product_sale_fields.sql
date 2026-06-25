-- Add optional product sale fields managed by the admin sale editor.
alter table public.products
  add column if not exists compare_at_price_cents integer check (compare_at_price_cents is null or compare_at_price_cents >= 0),
  add column if not exists discount_percent_bps integer check (discount_percent_bps is null or (discount_percent_bps >= 0 and discount_percent_bps <= 10000)),
  add column if not exists sale_price_cents integer check (sale_price_cents is null or sale_price_cents >= 0),
  add column if not exists sale_starts_at timestamptz,
  add column if not exists sale_ends_at timestamptz;
