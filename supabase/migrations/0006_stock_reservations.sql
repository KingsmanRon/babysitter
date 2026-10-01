-- Reserve stock when an order is created, so a busy drop can't take more
-- payments than there are units. Previously stock was only decremented when
-- the payment webhook landed, so any number of buyers could pay for the last
-- shirt in a size.
--
-- Lifecycle (orders.stock_state):
--   none      -> nothing held (orders created before this migration)
--   reserved  -> units taken out of products.stock_count / size_stock
--   released  -> reservation expired unpaid; units put back
--   committed -> order paid; units are sold
--
-- Reservations expire after reservation_expires_at. Expired ones are released
-- lazily by release_expired_reservations(), which the API calls whenever it
-- lists products or creates an order. A payment that lands after its
-- reservation expired re-takes the stock if it is still there, and is flagged
-- for a refund if it isn't.

alter table public.orders
  add column if not exists stock_state text not null default 'none'
    check (stock_state in ('none', 'reserved', 'released', 'committed')),
  add column if not exists reservation_expires_at timestamptz null;

create index if not exists orders_reserved_expiry_idx
  on public.orders(reservation_expires_at)
  where stock_state = 'reserved';

-- Inverse of decrement_stock.
create or replace function public.restore_stock(p_product_id uuid, p_qty integer, p_size text default null)
returns void
language plpgsql
security definer
as $$
begin
  update public.products
     set stock_count = stock_count + p_qty,
         size_stock = case
           when size_stock is null or p_size is null then size_stock
           else jsonb_set(size_stock, array[p_size], to_jsonb(coalesce((size_stock ->> p_size)::integer, 0) + p_qty))
         end
   where id = p_product_id;
end;
$$;

-- Take every item of the order out of stock, all or nothing. Caller must hold
-- the order row lock. Returns false (and changes nothing) if any item is short.
create or replace function public.take_order_stock(p_order_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_item record;
begin
  for v_item in
    select product_id, size, quantity
      from public.order_items
     where order_id = p_order_id
     order by product_id, size
  loop
    if public.decrement_stock(v_item.product_id, v_item.quantity, v_item.size) is null then
      raise exception 'insufficient_stock' using errcode = 'P0001';
    end if;
  end loop;
  return true;
exception
  when sqlstate 'P0001' then
    -- Exception block rolls back the decrements made above.
    return false;
end;
$$;

-- Put the order's reserved units back. No-op unless the order is reserved.
create or replace function public.release_order_stock(p_order_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_item record;
begin
  update public.orders
     set stock_state = 'released'
   where id = p_order_id
     and stock_state = 'reserved'
     and status <> 'paid';
  if not found then
    return false;
  end if;

  for v_item in
    select product_id, size, quantity from public.order_items where order_id = p_order_id
  loop
    perform public.restore_stock(v_item.product_id, v_item.quantity, v_item.size);
  end loop;
  return true;
end;
$$;

-- Reserve stock for a new (or expired) order and start its hold timer.
create or replace function public.reserve_order_stock(p_order_id uuid, p_hold_minutes integer default 30)
returns boolean
language plpgsql
security definer
as $$
declare
  v_state text;
begin
  select stock_state into v_state from public.orders where id = p_order_id for update;
  if v_state is null then
    return false;
  end if;
  if v_state = 'reserved' then
    update public.orders
       set reservation_expires_at = now() + make_interval(mins => p_hold_minutes)
     where id = p_order_id;
    return true;
  end if;
  if v_state = 'committed' then
    return true;
  end if;

  if not public.take_order_stock(p_order_id) then
    return false;
  end if;
  update public.orders
     set stock_state = 'reserved',
         reservation_expires_at = now() + make_interval(mins => p_hold_minutes)
   where id = p_order_id;
  return true;
end;
$$;

-- Called once a payment succeeds. Keeps the reservation if there is one,
-- otherwise takes the stock now. Returns false if the units are gone, in
-- which case the order is paid but needs a refund or restock.
create or replace function public.commit_order_stock(p_order_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_state text;
begin
  select stock_state into v_state from public.orders where id = p_order_id for update;
  if v_state is null then
    return false;
  end if;
  if v_state = 'committed' then
    return true;
  end if;
  if v_state <> 'reserved' and not public.take_order_stock(p_order_id) then
    return false;
  end if;
  update public.orders
     set stock_state = 'committed',
         reservation_expires_at = null
   where id = p_order_id;
  return true;
end;
$$;

-- Release every reservation whose hold has run out. Safe to call often and
-- concurrently: rows locked by another caller are skipped.
create or replace function public.release_expired_reservations()
returns integer
language plpgsql
security definer
as $$
declare
  v_order_id uuid;
  v_count integer := 0;
begin
  for v_order_id in
    select id
      from public.orders
     where stock_state = 'reserved'
       and status <> 'paid'
       and reservation_expires_at < now()
     for update skip locked
  loop
    if public.release_order_stock(v_order_id) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- These run with the owner's rights; only the service role should call them.
revoke execute on function public.restore_stock(uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.take_order_stock(uuid) from public, anon, authenticated;
revoke execute on function public.release_order_stock(uuid) from public, anon, authenticated;
revoke execute on function public.reserve_order_stock(uuid, integer) from public, anon, authenticated;
revoke execute on function public.commit_order_stock(uuid) from public, anon, authenticated;
revoke execute on function public.release_expired_reservations() from public, anon, authenticated;
revoke execute on function public.decrement_stock(uuid, integer, text) from public, anon, authenticated;
