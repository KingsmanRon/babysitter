-- Payment-id idempotency and payment-method backfill.
--
-- OPTIONAL: the application code does not depend on this migration, so it can
-- be deployed first and this run later at a quiet moment. Everything here is
-- online-safe on tables of this size and safe to run more than once.
--
-- 1. One lifecycle row per Yoco payment id. Combined with the existing unique
--    indexes on (provider, provider_checkout_id) and (provider,
--    provider_event_id), and on payment_webhook_events (provider,
--    provider_event_id), processing the same event or payment twice can't
--    create a second row. (The code already avoids it; this enforces it.)
-- 2. An index for the reconciliation sweep's "orders still waiting" query.
-- 3. Backfill card brand / last 4 / method type on paid rows from the payment
--    payloads we already stored.

-- 1 ─────────────────────────────────────────────────────────────
do $$
declare
  v_dupes text;
begin
  select string_agg(provider_payment_id, ', ')
    into v_dupes
    from (
      select provider_payment_id
        from public.payment_transactions
       where provider_payment_id is not null
       group by provider, provider_payment_id
      having count(*) > 1
    ) d;
  if v_dupes is not null then
    raise exception 'payment_transactions has more than one row for payment id(s): %. Merge them (keep the row with the checkout id) and re-run.', v_dupes;
  end if;
end $$;

create unique index if not exists payment_transactions_provider_payment_unique
  on public.payment_transactions(provider, provider_payment_id)
  where provider_payment_id is not null;

-- 2 ─────────────────────────────────────────────────────────────
create index if not exists orders_open_payment_idx
  on public.orders(created_at)
  where status in ('pending_payment', 'payment_failed');

-- 3 ─────────────────────────────────────────────────────────────
-- Prefer the payload stored on the transaction row; fall back to the raw
-- webhook event for the same payment id.
with src as (
  select
    t.id,
    coalesce(
      t.raw_metadata_json -> 'payment' -> 'paymentMethodDetails',
      (select e.payload_json -> 'payload' -> 'paymentMethodDetails'
         from public.payment_webhook_events e
        where e.provider = 'yoco'
          and e.signature_valid
          and e.payload_json -> 'payload' ->> 'id' = t.provider_payment_id
          and e.payload_json -> 'payload' -> 'paymentMethodDetails' is not null
        order by e.created_at desc
        limit 1)
    ) as pmd
  from public.payment_transactions t
  where t.provider = 'yoco'
    and t.paid_at is not null
    and (t.payment_method_brand is null or t.payment_method_type is null)
), parsed as (
  select
    id,
    nullif(pmd ->> 'type', '') as method_type,
    coalesce(pmd -> 'card', pmd) as card
  from src
  where pmd is not null and jsonb_typeof(pmd) = 'object'
), fields as (
  select
    id,
    method_type,
    nullif(coalesce(card ->> 'scheme', card ->> 'brand', card ->> 'cardBrand', card ->> 'network'), '') as brand,
    right(regexp_replace(coalesce(card ->> 'maskedCard', card ->> 'maskedPan', card ->> 'last4', card ->> 'lastFour', ''), '\D', '', 'g'), 4) as last4
  from parsed
)
update public.payment_transactions t
   set payment_method_type = coalesce(t.payment_method_type, f.method_type),
       payment_method_brand = coalesce(t.payment_method_brand, f.brand),
       payment_method_last4 = coalesce(t.payment_method_last4, nullif(case when length(f.last4) = 4 then f.last4 end, ''))
  from fields f
 where t.id = f.id;
