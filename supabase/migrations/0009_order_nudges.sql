-- WhatsApp payment reminders and superseded orders.
--
-- nudge_count / last_nudged_at: how many reminders admin has sent for a
-- pending order (max 2) and when the last one went out.
-- superseded_by / cancel_reason: set when the customer paid on a later order,
-- so this pending one is cancelled (cancel_reason = 'superseded',
-- superseded_by = the paid order's number) and its stock released.
--
-- Required before deploying the nudge feature. Additive, safe to run more
-- than once, near-instant on a table this size.

alter table public.orders
  add column if not exists nudge_count integer not null default 0,
  add column if not exists last_nudged_at timestamptz null,
  add column if not exists superseded_by text null,
  add column if not exists cancel_reason text null;

alter table public.orders drop constraint if exists orders_nudge_count_check;
alter table public.orders
  add constraint orders_nudge_count_check check (nudge_count between 0 and 2);
