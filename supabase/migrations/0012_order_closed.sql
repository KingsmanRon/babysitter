-- Closing orders. A closed order is done with as far as the admin is
-- concerned (e.g. an earlier drop's delivered or expired orders): it drops out
-- of the admin order list (there's a Closed filter to find it again), but its
-- payment and fulfilment state are untouched and the customer can still
-- track it.
--
-- closed_at is null while the order is open. Required before deploying the
-- admin close controls. Additive, safe to run more than once, near-instant on
-- a table this size.

alter table public.orders
  add column if not exists closed_at timestamptz null;

create index if not exists orders_open_created_idx
  on public.orders(created_at desc)
  where closed_at is null;
