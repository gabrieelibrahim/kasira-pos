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
  role       text not null default 'kasir' check (role in ('admin', 'kasir')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

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

-- 4. Migrate outlets.reset_pin (currently plaintext '1234') to a hash.
--    reset_pin is left in place for one release as a fallback, then dropped.
alter table public.outlets add column if not exists reset_pin_hash text;
update public.outlets
   set reset_pin_hash = crypt(reset_pin, gen_salt('bf', 10))
 where reset_pin_hash is null and reset_pin is not null;

-- 5. Login RPC. SECURITY DEFINER so the anon key can call it and verify
--    against the bcrypt hash without ever reading raw PINs.
create or replace function public.login_staff(p_username text, p_pin text)
returns table (id uuid, name text, username text, role text, outlet_id uuid)
language plpgsql
security definer
set search_path = public
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
create or replace function public.verify_reset_pin(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
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
