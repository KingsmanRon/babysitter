-- Merge legacy Yoco payment lifecycle rows before enforcing provider identifiers.
--
-- Older payment flows could create one row when checkout started
-- (provider_checkout_id present) and a second succeeded-only row when the
-- webhook arrived (provider_payment_id/provider_event_id present). Fold those
-- success details back into the checkout row so payment_transactions has one
-- lifecycle row per provider checkout/event while payment_webhook_events remains
-- the immutable raw webhook history.

with duplicate_success_rows as (
  select
    checkout.id as checkout_transaction_id,
    success.id as success_transaction_id,
    success.provider_payment_id,
    success.provider_event_id,
    success.provider_status,
    success.amount_cents,
    success.currency,
    success.processing_mode,
    success.payment_method_type,
    success.payment_method_brand,
    success.payment_method_last4,
    success.client_reference_id,
    success.external_id,
    success.raw_metadata_json,
    success.paid_at,
    row_number() over (
      partition by success.id
      order by checkout.created_at desc, checkout.id
    ) as success_match_rank
  from public.payment_transactions checkout
  join public.payment_transactions success
    on success.order_id = checkout.order_id
   and success.provider = checkout.provider
  where checkout.provider = 'yoco'
    and checkout.provider_checkout_id is not null
    and success.provider_checkout_id is null
    and success.provider_payment_id is not null
    and success.provider_event_id is not null
    and success.provider_status = 'succeeded'
), merged_success_rows as (
  update public.payment_transactions checkout
     set provider_payment_id = duplicate_success_rows.provider_payment_id,
         provider_event_id = duplicate_success_rows.provider_event_id,
         provider_status = duplicate_success_rows.provider_status,
         amount_cents = duplicate_success_rows.amount_cents,
         currency = duplicate_success_rows.currency,
         processing_mode = coalesce(duplicate_success_rows.processing_mode, checkout.processing_mode),
         payment_method_type = duplicate_success_rows.payment_method_type,
         payment_method_brand = duplicate_success_rows.payment_method_brand,
         payment_method_last4 = duplicate_success_rows.payment_method_last4,
         client_reference_id = coalesce(duplicate_success_rows.client_reference_id, checkout.client_reference_id),
         external_id = coalesce(duplicate_success_rows.external_id, checkout.external_id),
         raw_metadata_json = duplicate_success_rows.raw_metadata_json,
         paid_at = duplicate_success_rows.paid_at,
         failed_at = null
    from duplicate_success_rows
   where duplicate_success_rows.success_match_rank = 1
     and checkout.id = duplicate_success_rows.checkout_transaction_id
  returning checkout.order_id,
            duplicate_success_rows.success_transaction_id,
            duplicate_success_rows.provider_payment_id,
            duplicate_success_rows.provider_event_id
)
delete from public.payment_transactions success
using merged_success_rows
where success.id = merged_success_rows.success_transaction_id
  and success.order_id = merged_success_rows.order_id
  and success.provider = 'yoco'
  and success.provider_checkout_id is null
  and success.provider_payment_id = merged_success_rows.provider_payment_id
  and success.provider_event_id = merged_success_rows.provider_event_id
  and success.provider_status = 'succeeded';

create unique index if not exists payment_transactions_provider_checkout_unique
  on public.payment_transactions(provider, provider_checkout_id)
  where provider_checkout_id is not null;

create unique index if not exists payment_transactions_provider_event_unique
  on public.payment_transactions(provider, provider_event_id)
  where provider_event_id is not null;
