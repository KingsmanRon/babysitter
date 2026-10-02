-- Adds the 'expired' order status: checkouts the buyer never completed.
-- lib/reconcile.ts sets it once a checkout is still unpaid 60 minutes after it
-- was created (or Yoco reports it expired/cancelled). A late successful payment
-- still moves the order to 'paid'.
--
-- REQUIRED before deploying the code that sets it. Safe to run more than once;
-- the constraint swap is near-instant on a table this size.

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check check (status in (
    'draft',
    'pending_payment',
    'paid',
    'payment_failed',
    'cancelled',
    'refunded',
    'expired'
  ));
