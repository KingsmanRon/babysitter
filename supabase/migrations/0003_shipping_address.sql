-- Capture the customer's delivery address on each order so paid orders can
-- actually be fulfilled. Recipient name and email already live on
-- public.orders (customer_name / customer_email); these add the postal address.

alter table public.orders
  add column if not exists ship_phone       text,
  add column if not exists ship_line1       text,
  add column if not exists ship_line2       text,
  add column if not exists ship_suburb      text,
  add column if not exists ship_city        text,
  add column if not exists ship_province    text,
  add column if not exists ship_postal_code text,
  add column if not exists ship_country     text not null default 'ZA';
