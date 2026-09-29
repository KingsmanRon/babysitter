-- Seed products. Safe to run repeatedly; uses slug as the idempotency key.

-- Drop 001, the original BABYSITTER tee. Sold out and retired: kept inactive
-- so past orders still reference it, with its imagery removed from the site.

insert into public.products (slug, name, description, price_cents, currency, image_url, images, sizes, stock_count, is_active)
values (
  'babysitter-tee',
  'BABYSITTER™',
  'Premium streetwear crafted for everyday confidence. Featuring tailored fits, breathable fabrics, and timeless style for any occasion.',
  24900,
  'ZAR',
  null,
  '[]'::jsonb,
  '["XS","S","M","L","XL","XXL"]'::jsonb,
  0,
  false
)
on conflict (slug) do update set
  name        = excluded.name,
  description = excluded.description,
  price_cents = excluded.price_cents,
  currency    = excluded.currency,
  image_url   = excluded.image_url,
  images      = excluded.images,
  sizes       = excluded.sizes,
  is_active   = excluded.is_active;

-- S'MILANO SAVED MY LIFE tee: R500, plus R100 when the order is delivered.
-- 200 units, 50 per size. Stock is only set on first insert so re-running the
-- seed never resets sales.
insert into public.products (slug, name, description, price_cents, delivery_fee_cents, currency, image_url, images, sizes, stock_count, size_stock, is_active)
values (
  'smilano-tee',
  'S''MILANO SAVED MY LIFE',
  'Heavyweight black tee with an oversized cracked-print S''MILANO SAVED MY LIFE graphic. Made for the Vaal, worn everywhere.',
  50000,
  10000,
  'ZAR',
  '/media/SSML.jpeg',
  '["/media/SSML.jpeg","/media/4gents.jpeg"]'::jsonb,
  '["S","M","L","XL"]'::jsonb,
  200,
  '{"S":50,"M":50,"L":50,"XL":50}'::jsonb,
  true
)
on conflict (slug) do update set
  name               = excluded.name,
  description        = excluded.description,
  price_cents        = excluded.price_cents,
  delivery_fee_cents = excluded.delivery_fee_cents,
  currency           = excluded.currency,
  image_url          = excluded.image_url,
  images             = excluded.images,
  sizes              = excluded.sizes,
  is_active          = excluded.is_active;
