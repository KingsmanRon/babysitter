-- "On its way" / "Ready for collection" emails.
--
-- dispatch_email_sent_at / _id: when the email went out (when admin marked the
-- order Out for delivery or Ready for collection) and its id at the email
-- service. dispatch_email_error: why the last attempt failed.
-- dispatch_email_manual_at: when admin last opened the manual (mailto) version.
--
-- Required before deploying the dispatch email feature. Additive, safe to run
-- more than once, near-instant on a table this size.

alter table public.orders
  add column if not exists dispatch_email_sent_at timestamptz null,
  add column if not exists dispatch_email_id text null,
  add column if not exists dispatch_email_error text null,
  add column if not exists dispatch_email_manual_at timestamptz null;
