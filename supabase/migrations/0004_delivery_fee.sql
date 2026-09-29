-- Per-product delivery fee and a fulfilment choice on each order.
-- Products default to free delivery (0), so existing products are unchanged.
-- Orders store the method and the fee that was charged, so amount_cents
-- always equals the item subtotal plus delivery_fee_cents.

alter table public.products
  add column if not exists delivery_fee_cents integer not null default 0
    check (delivery_fee_cents >= 0);

alter table public.orders
  add column if not exists fulfilment_method text not null default 'delivery'
    check (fulfilment_method in ('delivery', 'collection')),
  add column if not exists delivery_fee_cents integer not null default 0
    check (delivery_fee_cents >= 0);
