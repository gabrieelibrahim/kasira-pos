-- Kasira — migration: staff login (username + PIN) + reset-pin hashing.
--
-- App-level auth, NOT Supabase Auth. The customer portal submits orders with
-- the anon key, so we keep RLS wide-open (matching the app's existing
-- convention) and verify credentials server-side via SECURITY DEFINER RPCs
-- that use bcrypt (pgcrypto). All statements are additive/idempotent, so this
-- file is safe to run multiple times.

-- 1. bcrypt via pgcrypto
create extension if not exists pgcrypto;

-- 2. Staff table
create table if not exists public.staff (
  id         uuid primary key default gen_random_uuid(),
  outlet_id  uuid references public.outlets(id) on delete cascade,
  name       text not null,
  username   text not null unique,
  pin_hash   text not null,          -- bcrypt: crypt(pin, gen_salt('bf'))
  role       text not null default 'kasir' check (role in ('admin', 'kasir', 'pelayan', 'dapur', 'pemilik')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Widen the role CHECK (additive; keeps existing 'admin'/'kasir' rows valid).
alter table public.staff drop constraint if exists staff_role_check;
alter table public.staff add constraint staff_role_check
  check (role in ('admin', 'kasir', 'pelayan', 'dapur', 'pemilik'));

alter table public.staff enable row level security;

-- Wide-open policies to match the app's existing RLS convention. Access
-- control is enforced by the SECURITY DEFINER functions below, not by RLS.
drop policy if exists "staff select anon" on public.staff;
create policy "staff select anon" on public.staff for select using (true);
drop policy if exists "staff insert anon" on public.staff;
create policy "staff insert anon" on public.staff for insert with check (true);
drop policy if exists "staff update anon" on public.staff;
create policy "staff update anon" on public.staff for update using (true);

-- 3. Seed the first admin (bootstrap: username 'kasir', PIN '1234').
--    on conflict (username) do nothing makes it safe to re-run.
insert into public.staff (outlet_id, name, username, pin_hash, role, active)
select id, 'Admin', 'kasir', crypt('1234', gen_salt('bf', 10)), 'admin', true
from public.outlets
order by created_at limit 1
on conflict (username) do nothing;

-- 3b. Widen the staff role CHECK to the full fixed role set. Safe to re-run.
alter table public.staff drop constraint if exists staff_role_check;
alter table public.staff add constraint staff_role_check
  check (role in ('admin', 'kasir', 'pelayan', 'dapur', 'pemilik'));

-- 4. Migrate outlets.reset_pin (currently plaintext '1234') to a hash.
--    reset_pin is left in place for one release as a fallback, then dropped.
alter table public.outlets add column if not exists reset_pin_hash text;
update public.outlets
   set reset_pin_hash = crypt(reset_pin, gen_salt('bf', 10))
 where reset_pin_hash is null and reset_pin is not null;

-- 5. Login RPC. SECURITY DEFINER so the anon key can call it and verify
--    against the bcrypt hash without ever reading raw PINs.
--    NOTE: calls crypt(), which lives in the `extensions` schema, so the
--    search_path MUST include extensions or the RPC dies at runtime with
--    "function crypt(text, text) does not exist" → app shows "PIN salah".
create or replace function public.login_staff(p_username text, p_pin text)
returns table (id uuid, name text, username text, role text, outlet_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return query
  select s.id, s.name, s.username, s.role, s.outlet_id
  from public.staff s
  where lower(s.username) = lower(p_username)
    and s.active
    and s.pin_hash = crypt(p_pin, s.pin_hash);
end;
$$;

-- 6. Reset-PIN verification RPC. Works during and after the migration.
--    (Also calls crypt() → search_path must include extensions.)
create or replace function public.verify_reset_pin(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_ok boolean;
begin
  select
    (reset_pin_hash is not null and reset_pin_hash = crypt(p_pin, reset_pin_hash))
    or (reset_pin_hash is null and reset_pin = p_pin)
  into v_ok
  from public.outlets
  limit 1;
  return coalesce(v_ok, false);
end;
$$;

-- 7. Order adjustments: discount (Rp) + service (% of net subtotal) + kitchen
--    station + cash received. All additive/idempotent — safe to re-run.
--    - discount:      potongan dalam rupiah (0 = tidak ada)
--    - service_rate:  % service dari total NET (setelah diskon); null = 0%
--    - station:       'dapur' | 'bar' — routing KDS (Minuman → bar)
--    - cash_received: nominal tunai yang diterima kasir (untuk kembalian struk)
alter table public.orders add column if not exists discount      numeric not null default 0;
alter table public.orders add column if not exists service_rate  numeric;
alter table public.orders add column if not exists station       text    not null default 'dapur';
alter table public.orders add column if not exists cash_received numeric;

-- Backfill: order lama tidak punya diskon → total dianggap net tanpa potongan.
update public.orders set discount = 0 where discount is null;

-- 8. Staff management RPCs + manual-order attribution.
--    All SECURITY DEFINER so the anon key can manage staff without ever
--    reading raw PINs — every write goes through bcrypt hashing server-side.
--    NOTE: pgcrypto's crypt/gen_salt live in the `extensions` schema, so every
--    function that calls them must set search_path to `public, extensions`.
alter table public.orders add column if not exists staff_id uuid;   -- kasir yang membuat order manual

create or replace function public.list_staff(p_outlet_id uuid)
returns table (id uuid, name text, username text, role text, active boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select s.id, s.name, s.username, s.role, s.active
  from public.staff s
  where s.outlet_id = p_outlet_id
  order by s.created_at;
end;
$$;

create or replace function public.insert_staff(
  p_outlet_id uuid, p_name text, p_username text, p_pin text, p_role text default 'kasir'
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  insert into public.staff (outlet_id, name, username, pin_hash, role, active)
  values (p_outlet_id, p_name, lower(p_username), crypt(p_pin, gen_salt('bf', 10)),
          coalesce(nullif(p_role, ''), 'kasir'), true)
  on conflict (username) do nothing;
end;
$$;

create or replace function public.set_staff_password(p_staff_id uuid, p_new_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.staff set pin_hash = crypt(p_new_pin, gen_salt('bf', 10)) where id = p_staff_id;
end;
$$;

create or replace function public.toggle_staff(p_staff_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.staff set active = p_active where id = p_staff_id;
end;
$$;

create or replace function public.set_outlet_reset_pin(p_new_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.outlets
     set reset_pin_hash = crypt(p_new_pin, gen_salt('bf', 10))
   where reset_pin_hash is not null or reset_pin is not null;
end;
$$;

-- 9. Staff management: rename + delete (rename).
--    Same rules as before — single squash merge keeps the history clean.

create or replace function public.update_staff(
  p_id uuid, p_name text, p_username text
)
returns void
language plpgsql
as $$
begin
  update public.staff
     set name     = nullif(btrim(p_name), ''),
         username = nullif(btrim(p_username), '')
   where id = p_id;
end;
$$;

create or replace function public.delete_staff(
  p_id uuid
)
returns void
language plpgsql
as $$
begin
  delete from public.staff where id = p_id;
end;
$$;

-- 10. Table (QR meja) management: add + delete.
--     table_spots has no insert/delete RLS policy (wide-open select/update only),
--     so both writes go through SECURITY DEFINER RPCs.
--     add_table: insert a new spot, using the next free number if none given.
--                Raises if a spot with that number already exists.
--     delete_table: removes a spot. FK orders.table_spot_id is ON DELETE SET
--                NULL, so existing order history survives the table's removal.

create or replace function public.add_table(
  p_outlet_id uuid,
  p_number integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_number integer;
begin
  select coalesce(p_number, coalesce(max(number), 0) + 1)
    into v_number
    from public.table_spots
   where outlet_id = p_outlet_id;

  if v_number <= 0 then
    raise exception 'nomor meja tidak valid';
  end if;

  if exists (select 1 from public.table_spots
              where outlet_id = p_outlet_id and number = v_number) then
    raise exception 'nomor meja % sudah dipakai', v_number;
  end if;

  insert into public.table_spots (outlet_id, number, label, status)
  values (p_outlet_id, v_number, 'Meja ' || lpad(v_number::text, 2, '0'), 'empty');
end;
$$;

create or replace function public.delete_table(
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.table_spots where id = p_id;
end;
$$;

-- ===========================================================================
-- 11. Multi-tenant SaaS: super_admin role + tenant (outlet) management.
--     Single DB, row-level isolation per outlet_id. Client scopes every query
--     by session outletId; the customer portal passes outlet_id in the QR URL.
--     All platform CRUD runs through SECURITY DEFINER RPCs gated on a super
--     admin PIN (is_platform_admin), so the wide-open anon RLS can't call them.
-- ===========================================================================

-- 11a. Widen the staff role CHECK to include 'super_admin'.
alter table public.staff drop constraint if exists staff_role_check;
alter table public.staff add constraint staff_role_check
  check (role in ('admin', 'kasir', 'pelayan', 'dapur', 'pemilik', 'super_admin'));

-- 11b. Subscription / suspension flags on outlets (additive, idempotent).
alter table public.outlets add column if not exists subscription_tier      text not null default 'free';
alter table public.outlets add column if not exists subscription_expires_at timestamptz;
alter table public.outlets add column if not exists is_suspended          boolean not null default false;

-- 11c. Bootstrap the platform super admin. PIN is the 6-digit number the app
--     accepts (all PIN inputs strip non-digits and cap at 6 chars — see
--     Login.jsx / AdminDashboard PinGate). Its outlet_id is a placeholder
--     (the first outlet) — the dashboard ignores it, and login_staff skips the
--     suspension check for super_admin.
insert into public.staff (outlet_id, name, username, pin_hash, role, active)
select id, 'Super Admin', 'superadmin', crypt('123456', gen_salt('bf', 10)), 'super_admin', true
from public.outlets order by created_at limit 1
on conflict (username) do nothing;

-- 11d. login_staff: reject staff whose outlet is suspended (super_admin exempt).
create or replace function public.login_staff(p_username text, p_pin text)
returns table (id uuid, name text, username text, role text, outlet_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return query
  select s.id, s.name, s.username, s.role, s.outlet_id
  from public.staff s
  left join public.outlets o on o.id = s.outlet_id
  where lower(s.username) = lower(p_username)
    and s.active
    and s.pin_hash = crypt(p_pin, s.pin_hash)
    and (s.role = 'super_admin' or not coalesce(o.is_suspended, false));
end;
$$;

-- 11e. Scope reset-PIN verification + update to a specific outlet. p_outlet_id
--      is optional so the pre-existing null-arg calls still behave as before.
create or replace function public.verify_reset_pin(p_pin text, p_outlet_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_ok boolean;
begin
  select
    (reset_pin_hash is not null and reset_pin_hash = crypt(p_pin, reset_pin_hash))
    or (reset_pin_hash is null and reset_pin = p_pin)
  into v_ok
  from public.outlets
  where (p_outlet_id is null or id = p_outlet_id)
  limit 1;
  return coalesce(v_ok, false);
end;
$$;

create or replace function public.set_outlet_reset_pin(p_new_pin text, p_outlet_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.outlets
     set reset_pin_hash = crypt(p_new_pin, gen_salt('bf', 10))
   where (p_outlet_id is null or id = p_outlet_id)
     and (reset_pin_hash is not null or reset_pin is not null);
end;
$$;

-- 11f. Platform gate: true iff p_pin matches an ACTIVE super_admin account.
--     Called by every platform RPC so the anon key can't administer tenants.
create or replace function public.is_platform_admin(p_pin text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.staff s
    where s.role = 'super_admin'
      and s.active
      and s.pin_hash = crypt(p_pin, s.pin_hash)
  );
$$;

-- 11g. Create a tenant: outlet + admin staff + 5 default tables, one txn.
create or replace function public.create_tenant(
  p_name text,
  p_admin_username text,
  p_admin_pin text,
  p_address text default '',
  p_phone text default '',
  p_admin_name text default 'Admin',
  p_tier text default 'free',
  p_super_pin text default null
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_outlet_id uuid;
  v_staff_id uuid;
begin
  if not public.is_platform_admin(p_super_pin) then
    raise exception 'hak akses super admin diperlukan';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception 'nama outlet wajib diisi';
  end if;
  if nullif(btrim(p_admin_username), '') is null or length(btrim(p_admin_username)) < 3 then
    raise exception 'username admin minimal 3 karakter';
  end if;
  if length(coalesce(p_admin_pin, '')) < 4 then
    raise exception 'PIN admin minimal 4 digit';
  end if;

  insert into public.outlets (name, address, phone, subscription_tier)
  values (btrim(p_name), nullif(btrim(p_address), ''), nullif(btrim(p_phone), ''),
          coalesce(nullif(p_tier, ''), 'free'))
  returning id into v_outlet_id;

  insert into public.staff (outlet_id, name, username, pin_hash, role, active)
  values (v_outlet_id, coalesce(nullif(btrim(p_admin_name), ''), 'Admin'),
          lower(btrim(p_admin_username)), crypt(p_admin_pin, gen_salt('bf', 10)),
          'admin', true)
  returning id into v_staff_id;

  for i in 1..5 loop
    insert into public.table_spots (outlet_id, number, label, status)
    values (v_outlet_id, i, 'Meja ' || lpad(i::text, 2, '0'), 'empty');
  end loop;

  return json_build_object('outlet_id', v_outlet_id, 'staff_id', v_staff_id);
end;
$$;

-- 11h. Suspend / activate a tenant (blocks its staff from logging in).
create or replace function public.suspend_tenant(p_outlet_id uuid, p_super_pin text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin(p_super_pin) then
    raise exception 'hak super admin diperlukan';
  end if;
  update public.outlets set is_suspended = true where id = p_outlet_id;
end;
$$;

create or replace function public.activate_tenant(p_outlet_id uuid, p_super_pin text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin(p_super_pin) then
    raise exception 'hak super admin diperlukan';
  end if;
  update public.outlets set is_suspended = false where id = p_outlet_id;
end;
$$;

-- 11i. Delete a tenant (FK CASCADE removes staff/orders/menu/tables).
create or replace function public.delete_tenant(p_outlet_id uuid, p_super_pin text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin(p_super_pin) then
    raise exception 'hak super admin diperlukan';
  end if;
  delete from public.outlets where id = p_outlet_id;
end;
$$;

-- 11j. Live tenant stats for the dashboard (single aggregate + gate).
create or replace function public.outlet_stats(p_super_pin text)
returns table (
  id                         uuid,
  name                       text,
  created_at                 timestamptz,
  is_suspended               boolean,
  subscription_tier          text,
  subscription_expires_at    timestamptz,
  staff_count                bigint,
  menu_count                 bigint,
  table_count                bigint,
  order_count                bigint,
  total_revenue              numeric,
  today_orders               bigint,
  today_revenue              numeric
)
language plpgsql
security definer
set search_path = public
as $$
-- RETURNS TABLE out-params (created_at, today_orders, ...) collide with column
-- names referenced unqualified inside the aggregate subqueries; prefer columns.
#variable_conflict use_column
begin
  if not public.is_platform_admin(p_super_pin) then
    raise exception 'hak super admin diperlukan';
  end if;
  return query
  select
    o.id,
    o.name,
    o.created_at,
    o.is_suspended,
    o.subscription_tier,
    o.subscription_expires_at,
    coalesce(s.staff_count, 0) as staff_count,
    coalesce(m.menu_count, 0) as menu_count,
    coalesce(t.table_count, 0) as table_count,
    coalesce(ord.order_count, 0) as order_count,
    coalesce(ord.total_revenue, 0) as total_revenue,
    coalesce(ord.today_orders, 0) as today_orders,
    coalesce(ord.today_revenue, 0) as today_revenue
  from public.outlets o
  left join (
    select outlet_id, count(*) as staff_count
    from public.staff where active group by outlet_id
  ) s on s.outlet_id = o.id
  left join (
    select outlet_id, count(*) as menu_count
    from public.menu_items group by outlet_id
  ) m on m.outlet_id = o.id
  left join (
    select outlet_id, count(*) as table_count
    from public.table_spots group by outlet_id
  ) t on t.outlet_id = o.id
  left join (
    select
      outlet_id,
      count(*)                                   as order_count,
      sum(total)                                 as total_revenue,
      count(*) filter (where created_at >= date_trunc('day', now())) as today_orders,
      sum(total) filter (where created_at >= date_trunc('day', now())) as today_revenue
    from public.orders
    where status <> 'Ditolak'
    group by outlet_id
  ) ord on ord.outlet_id = o.id
  order by o.created_at;
end;
$$;

-- 11k. Tenant-safe guards on the pre-existing staff/table RPCs. Those functions
--      run SECURITY DEFINER (bypass RLS), so without an outlet check any tenant
--      could toggle/rename/delete a staff member or table of ANOTHER outlet by
--      guessing its UUID. Re-define them with an optional p_outlet_id the client
--      now sends; when supplied, the row must belong to that outlet.
create or replace function public.set_staff_password(p_staff_id uuid, p_new_pin text, p_outlet_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.staff set pin_hash = crypt(p_new_pin, gen_salt('bf', 10))
   where id = p_staff_id
     and (p_outlet_id is null or outlet_id = p_outlet_id);
end;
$$;

create or replace function public.toggle_staff(p_staff_id uuid, p_active boolean, p_outlet_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.staff set active = p_active
   where id = p_staff_id
     and (p_outlet_id is null or outlet_id = p_outlet_id);
end;
$$;

create or replace function public.update_staff(
  p_id uuid, p_name text, p_username text, p_outlet_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.staff
     set name     = nullif(btrim(p_name), ''),
         username = nullif(btrim(p_username), '')
   where id = p_id
     and (p_outlet_id is null or outlet_id = p_outlet_id);
end;
$$;

create or replace function public.delete_staff(p_id uuid, p_outlet_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.staff where id = p_id
    and (p_outlet_id is null or outlet_id = p_outlet_id);
end;
$$;

create or replace function public.delete_table(p_id uuid, p_outlet_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.table_spots where id = p_id
    and (p_outlet_id is null or outlet_id = p_outlet_id);
end;
$$;
