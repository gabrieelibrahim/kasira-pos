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
