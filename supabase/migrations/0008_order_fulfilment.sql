-- Fulfilment tracking for paid orders, separate from payment status so an
-- order can be "paid" and "out for delivery" at the same time.
--
--   delivery orders:   unfulfilled -> packed -> out_for_delivery -> delivered
--   collection orders: unfulfilled -> packed -> ready_for_collection -> collected
--
-- dispatched_at / delivered_at record when an order reached those steps.
-- Required before deploying the admin fulfilment controls. Additive, safe to
-- run more than once, near-instant on a table this size.

alter table public.orders
  add column if not exists fulfilment_status text not null default 'unfulfilled',
  add column if not exists courier text null,
  add column if not exists tracking_number text null,
  add column if not exists dispatched_at timestamptz null,
  add column if not exists delivered_at timestamptz null,
  add column if not exists fulfilment_updated_at timestamptz null;

alter table public.orders drop constraint if exists orders_fulfilment_status_check;
alter table public.orders
  add constraint orders_fulfilment_status_check check (fulfilment_status in (
    'unfulfilled',
    'packed',
    'out_for_delivery',
    'delivered',
    'ready_for_collection',
    'collected'
  ));

create index if not exists orders_paid_fulfilment_idx
  on public.orders(fulfilment_status, created_at desc)
  where status = 'paid';
