-- Order confirmation emails.
--
-- confirmation_email_sent_at / _id: when the branded confirmation email went
-- out through the email service, and its id there.
-- confirmation_email_error: why the last attempt failed (cleared on success).
-- confirmation_email_manual_at: when admin last opened the manual (mailto)
-- version; we can't know if it was actually sent from their mail app.
--
-- Required before deploying the confirmation email feature. Additive, safe to
-- run more than once, near-instant on a table this size.

alter table public.orders
  add column if not exists confirmation_email_sent_at timestamptz null,
  add column if not exists confirmation_email_id text null,
  add column if not exists confirmation_email_error text null,
  add column if not exists confirmation_email_manual_at timestamptz null;
