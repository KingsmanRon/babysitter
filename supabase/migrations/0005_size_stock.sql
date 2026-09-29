-- Optional per-size inventory. When size_stock is set (e.g. {"S":50,"M":50}),
-- each size sells out on its own and stock_count stays the total across sizes.
-- Products with size_stock = null keep the single product-level count.

alter table public.products
  add column if not exists size_stock jsonb null;

-- Replace the 2-arg decrement with one that also takes the ordered size.
-- p_size defaults to null, so existing callers keep working.
drop function if exists public.decrement_stock(uuid, integer);

create or replace function public.decrement_stock(p_product_id uuid, p_qty integer, p_size text default null)
returns integer
language plpgsql
security definer
as $$
declare
  v_new_stock integer;
begin
  update public.products
     set stock_count = stock_count - p_qty,
         size_stock = case
           when size_stock is null then null
           else jsonb_set(size_stock, array[p_size], to_jsonb((size_stock ->> p_size)::integer - p_qty))
         end
   where id = p_product_id
     and stock_count >= p_qty
     and (size_stock is null or coalesce((size_stock ->> p_size)::integer, 0) >= p_qty)
  returning stock_count into v_new_stock;

  return v_new_stock;
end;
$$;
