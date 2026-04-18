-- Seed the single BABYSITTER product variant set.
-- Safe to run repeatedly; uses slug as the idempotency key.

insert into public.products (slug, name, description, price_cents, currency, image_url, images, sizes, stock_count, is_active)
values (
  'babysitter-tee',
  'BABYSITTER™',
  'Premium streetwear crafted for everyday confidence. Featuring tailored fits, breathable fabrics, and timeless style for any occasion.',
  24900,
  'ZAR',
  '/media/boygirl.jpeg',
  '["/media/boygirl.jpeg","/media/boy.jpeg","/media/pinkracer.jpeg","/media/girl.jpeg","/media/greenracer.jpeg"]'::jsonb,
  '["XS","S","M","L","XL","XXL"]'::jsonb,
  50,
  true
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
