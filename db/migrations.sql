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
--     table_spots has no insert policy and only a permissive DELETE policy added
--     below, so both writes go through SECURITY DEFINER RPCs (delete is also
--     RLS-authorized; a definer still respects RLS without a DELETE policy).
--     add_table: insert a new empty spot, using the next free number if none.
--                Raises if a spot with that number already exists.
--     delete_table: removes a spot, scoped to the owning outlet. FK
--                orders.table_spot_id is ON DELETE SET NULL, so existing order
--                history survives the table's removal. The 1-arg legacy
--                overload is DROPPED — it would make the client call ambiguous
--                (PGRST203 "could not choose between overloads").

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

-- The legacy 1-arg delete_table had no outlet scope and left a second overload
-- that made client calls ambiguous; remove it.
drop function if exists public.delete_table(uuid);

create or replace function public.delete_table(
  p_id uuid,
  p_outlet_id uuid default null
)
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

-- table_spots has no INSERT policy (add_table definer handles it) and had no
-- DELETE policy — under RLS even a definer's DELETE on table_spots was blocked
-- ("cannot delete"). Add one so the def functions and direct client cleans can
-- both remove rows.
create policy "table_spots_delete" on public.table_spots
  for delete to public
  using (true);

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

  -- Mirror the new admin into Supabase Auth so they can sign in.
  perform public.sync_staff_auth(v_staff_id, p_admin_pin);

  return json_build_object('outlet_id', v_outlet_id, 'staff_id', v_staff_id);
end;
$$;

-- 11g2. place_order — the customer portal's write path. SECURITY DEFINER so it
-- can insert an order + mark the table occupied atomically, regardless of RLS.
-- The outlet is forced from the caller's `current_outlet()` (JWT claim for
-- staff/portal header) and cannot be supplied by the caller, closing spoofing.
create or replace function public.place_order(
  p_table_label text,
  p_customer text,
  p_note text,
  p_status text,
  p_payment_method text,
  p_payment_status text,
  p_total numeric,
  p_lines jsonb,
  p_station text,
  p_table_spot_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_outlet uuid := public.current_outlet();
  v_id uuid;
begin
  if v_outlet is null then raise exception 'outlet tidak dikenali'; end if;
  insert into public.orders (outlet_id, table_spot_id, table_label, customer_name,
    note, status, payment_method, payment_status, total, lines, station, staff_id)
  values (v_outlet, p_table_spot_id, p_table_label, p_customer, p_note,
    p_status, p_payment_method, p_payment_status, p_total, coalesce(p_lines, '[]'::jsonb),
    p_station, null)
  returning id into v_id;

  if p_table_spot_id is not null then
    update public.table_spots set status = 'occupied'
     where id = p_table_spot_id and outlet_id = v_outlet;
  end if;
  return v_id;
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
-- NOTE: this intentionally carries NO transaction / revenue data — the SaaS
-- owner's dashboard is resource-only (staff / menu / tables). The return
-- shape changed from an earlier revision, so we drop before (re)creating.
drop function if exists public.outlet_stats(text);
create or replace function public.outlet_stats(p_super_pin text)
returns table (
  id                      uuid,
  name                    text,
  created_at              timestamptz,
  is_suspended            boolean,
  subscription_tier       text,
  subscription_expires_at timestamptz,
  staff_count             bigint,
  menu_count              bigint,
  table_count             bigint
)
language plpgsql
security definer
set search_path = public
as $$
-- RETURNS TABLE out-params (created_at, ...) collide with column names
-- referenced unqualified inside the aggregate subqueries; prefer columns.
#variable_conflict use_column
begin
  if not public.is_platform_admin(p_super_pin) then
    raise exception 'hak super admin diperlukan';
  end if;
  return query
  select
    o.id, o.name, o.created_at, o.is_suspended, o.subscription_tier, o.subscription_expires_at,
    coalesce(s.staff_count, 0)::bigint, coalesce(m.menu_count, 0)::bigint,
    coalesce(t.table_count, 0)::bigint
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

-- 11l. Least-privilege grants on outlets. The app never reads the reset-PIN
--      columns over REST (only the SECURITY DEFINER verify_reset_pin /
--      set_outlet_reset_pin RPCs touch them), so an anon or authenticated key
--      must NOT be able to select reset_pin / reset_pin_hash. A column-level
--      revoke alone is inert while a table-level SELECT grant stands, so we
--      drop the table grants and re-grant the explicit columns the app reads
--      (matches state.jsx loadSnapshot / update outlet). Client writes ride on
--      anon (app-level auth via RPCs), so UPDATE stays on the editable fields.
revoke all on public.outlets from anon;
revoke all on public.outlets from authenticated;

grant select (id,name,address,phone,open_time,close_time,tax_rate,is_suspended,created_at,subscription_tier,subscription_expires_at)
  on public.outlets to anon;
grant update (name,address,phone,open_time,close_time,tax_rate,is_suspended,subscription_tier,subscription_expires_at)
  on public.outlets to anon;
grant select (id,name,address,phone,open_time,close_time,tax_rate,is_suspended,created_at,subscription_tier,subscription_expires_at)
  on public.outlets to authenticated;
grant update (name,address,phone,open_time,close_time,tax_rate,is_suspended,subscription_tier,subscription_expires_at)
  on public.outlets to authenticated;

-- ===========================================================================
-- 12. TRUE per-tenant DB isolation via Supabase Auth + RLS.
--     REPLACES the fake "filter in the client" model. Now:
--       * Every staff member IS a Supabase Auth user (email = <username>@<slug>
--         with app_metadata.outlet_id + role + super_admin flag).
--       * Login uses signInWithPassword → the session JWT carries
--         `role: authenticated` + `outlet_id` + `super_admin` claims.
--       * RLS reads the outlet from the JWT (request.jwt.claims) so BOTH REST
--         and realtime (which cannot send custom headers) evaluate the same
--         policy and enforce the same tenant scope.
--       * Anon (customer portal) stays wide for SELECT on the tenant-scoped
--         data it must serve, but is throttled to its own outlet via
--         `current_outlet()` from request.http headers, and order writes go
--         through the SECURITY DEFINER `place_order` RPC.
-- ===========================================================================

-- 12a. Helper: the caller's outlet id. Reads the Auth JWT first (authoritative),
--      then HttpContext: http x-kasira-outlet header for the anon portal.
--      Custom claims live under app_metadata in GoTrue JWTs, so read
--      `->'app_metadata'->>'outlet_id'`, not the top-level claim.
create or replace function public.current_outlet()
returns uuid
language sql
stable
set search_path = public
as $$
  select nullif(coalesce(
    current_setting('request.jwt.claims', true)::json->'app_metadata'->>'outlet_id',
    -- fallback for anon portal requests: header carried by supabase-js
    current_setting('request.headers', true)::json->>'x-kasira-outlet',
    ''
  ), '')::uuid
$$;

-- 12b. Row guard used by every tenant table: true iff the row belongs to the
--      caller's outlet. For Super Admin (session JWT has super_admin=true and
--      outlet_id=their seed outlet) we also allow ALL rows so the platform
--      dashboard can query aggregates; its write surface is only the RPCs.
create or replace function public.belongs_outlet(p_outlet uuid)
returns boolean
language sql
stable
as $$
  select coalesce(public.current_outlet(), uuid_nil()) = coalesce(p_outlet, uuid_nil())
      or (current_setting('request.jwt.claims', true)::json->'app_metadata'->>'super_admin' = 'true')
$$;

-- 12c. Drop ALL the old wide-open policies in one pass, then recreate scoped.
alter policy "staff select anon"        on public.staff        drop;
alter policy "staff insert anon"        on public.staff        drop;
alter policy "staff update anon"        on public.staff        drop;
alter policy "tables_read"              on public.table_spots  drop;
alter policy "table_spots_update"       on public.table_spots  drop;
alter policy "table_spots_delete"       on public.table_spots  drop;
alter policy "menu_read"                on public.menu_items   drop;
alter policy "menu_insert"              on public.menu_items   drop;
alter policy "menu_update"              on public.menu_items   drop;
alter policy "menu_delete"              on public.menu_items   drop;
alter policy "outlet_read"              on public.outlets      drop;
alter policy "outlet_update"            on public.outlets      drop;
alter policy "orders_read"              on public.orders       drop;
alter policy "orders_insert"            on public.orders       drop;
alter policy "orders_update"            on public.orders       drop;
alter policy "order_items_insert"       on public.order_items  drop;
alter policy "order_items_read"         on public.order_items  drop;

-- 12d. Recreate as scoped. All SELECT/UPDATE/DELETE only affect rows whose
--      outlet is the caller's, or the caller is the platform super admin.
--      INSERT requires the new row's outlet to be the caller's.

-- orders — the customer portal submits via `place_order` RPC (SECURITY
-- DEFINER), so raw INSERT is restricted to tenants. Cashier/kitchen read and
-- advance orders of their outlet.
create policy "orders_select_scoped" on public.orders
  for select to public using ( public.belongs_outlet(outlet_id) );
create policy "orders_update_scoped" on public.orders
  for update to public using ( public.belongs_outlet(outlet_id) );
create policy "orders_insert_scoped" on public.orders
  for insert to public with check ( public.belongs_outlet(outlet_id) );

-- order_items
create policy "order_items_select_scoped" on public.order_items
  for select to public using ( public.belongs_outlet(
    (select o.outlet_id from public.orders o where o.id = order_id) ) );
create policy "order_items_insert_scoped" on public.order_items
  for insert to public with check ( public.belongs_outlet(
    (select o.outlet_id from public.orders o where o.id = order_id) ) );

-- menu_items
create policy "menu_select_scoped" on public.menu_items
  for select to public using ( public.belongs_outlet(outlet_id) );
create policy "menu_insert_scoped" on public.menu_items
  for insert to public with check ( public.belongs_outlet(outlet_id) );
create policy "menu_update_scoped" on public.menu_items
  for update to public using ( public.belongs_outlet(outlet_id) );
create policy "menu_delete_scoped" on public.menu_items
  for delete to public using ( public.belongs_outlet(outlet_id) );

-- table_spots
create policy "tables_select_scoped" on public.table_spots
  for select to public using ( public.belongs_outlet(outlet_id) );
create policy "tables_insert_scoped" on public.table_spots
  for insert to public with check ( public.belongs_outlet(outlet_id) );
create policy "tables_update_scoped" on public.table_spots
  for update to public using ( public.belongs_outlet(outlet_id) );
create policy "tables_delete_scoped" on public.table_spots
  for delete to public using ( public.belongs_outlet(outlet_id) );

-- outlets — only the outlet itself (or super admin) reads/writes a row.
create policy "outlet_select_scoped" on public.outlets
  for select to public using ( public.belongs_outlet(id) );
create policy "outlet_update_scoped" on public.outlets
  for update to public using ( public.belongs_outlet(id) );

-- staff — readable w/ the outlet, writable only via SECURITY DEFINER RPCs.
create policy "staff_select_scoped" on public.staff
  for select to public using ( public.belongs_outlet(outlet_id) );

-- 12e. Tighten table-level grants so the raw credential columns (staff.pin_hash,
--      outlets.reset_pin / reset_pin_hash) are NEVER readable over REST. The
--      app reads/writes them only via SECURITY DEFINER RPCs. anon keeps the
--      columns the public portal must read; authenticated keeps the columns
--      the POS must read.
revoke all on public.staff from anon, authenticated;
grant select (id, name, username, role, active, created_at, outlet_id) on public.staff to anon;
grant select (id, name, username, role, active, created_at, outlet_id) on public.staff to authenticated;
-- (no UPDATE/INSERT/DELETE grants on staff — only RPCs can mutate it)

revoke all on public.outlets from anon, authenticated;
grant select (id,name,address,phone,open_time,close_time,tax_rate,is_suspended,created_at,subscription_tier,subscription_expires_at)
  on public.outlets to anon;
grant select (id,name,address,phone,open_time,close_time,tax_rate,is_suspended,created_at,subscription_tier,subscription_expires_at)
  on public.outlets to authenticated;
grant update (name,address,phone,open_time,close_time,tax_rate,is_suspended,subscription_tier,subscription_expires_at)
  on public.outlets to authenticated;

-- 12f. Staff/Auth bridge: when staff are managed via RPCs, keep the
--      corresponding Supabase Auth user in sync so login is real Auth.
--      email = lower(username) || '@kasira.local' (deterministic & unique —
--      staff.username is globally unique), password = PIN, app_metadata =
--      { outlet_id, role, super_admin }. SECURITY DEFINER (bypass RLS), called
--      only with a valid super-admin PIN or from a scoped outlet context.
create or replace function public.staff_email(p_username text)
returns text
language sql
stable
as $$
  select lower(p_username) || '@kasira.local'
$$;

-- Ensure a Supabase Auth user exists for a staff row and matches its current
-- PIN/role/outlet. Creates on first call, otherwise updates password (PIN) and
-- app_metadata. Returns the auth user id. SECURITY DEFINER for auth.users.
create or replace function public.sync_staff_auth(p_staff_id uuid, p_pin text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.staff%rowtype;
  v_email text;
  v_auth_id uuid;
  v_meta jsonb;
  v_encrypted text;
begin
  select * into v_staff from public.staff where id = p_staff_id;
  if not found then raise exception 'staff not found'; end if;

  v_email := public.staff_email(v_staff.username);
  v_meta := jsonb_build_object(
    'outlet_id', v_staff.outlet_id,
    'role', v_staff.role,
    'super_admin', (v_staff.role = 'super_admin')
  );
  -- Same bcrypt format Supabase Auth stores (cost 10).
  v_encrypted := crypt(p_pin, gen_salt('bf', 10));

  select id into v_auth_id from auth.users where email = v_email;
  if v_auth_id is null then
    -- GoTrue's Go scanner rejects NULL in these text columns, so set '' not NULL
    -- (real GoTrue-created users have '' there too).
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, phone, phone_change, phone_change_token,
      email_change_token_current, reauthentication_token, email_change_confirm_status,
      is_super_admin, created_at, updated_at, is_sso_user, is_anonymous)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
      v_email, v_encrypted, now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')) || v_meta,
      '', '', '',
      '', null, '', '',
      '', '', 0,
      false, now(), now(), false, false)
    returning id into v_auth_id;

    -- GoTrue resolves password sign-in through auth.identities; a users row
    -- without one is invisible to login. email is a generated column there, so
    -- it derives from identity_data (do not set it directly).
    insert into auth.identities (provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at, id)
    values (v_email, v_auth_id,
      jsonb_build_object('sub', v_auth_id::text, 'email', v_email,
        'email_verified', false, 'phone_verified', false),
      'email', now(), now(), now(), gen_random_uuid());
  else
    update auth.users
       set encrypted_password = v_encrypted,
           raw_app_meta_data = jsonb_build_object('provider','email','providers',jsonb_build_array('email')) || v_meta,
           updated_at = now()
     where id = v_auth_id;
  end if;
  return v_auth_id;
end;
$$;

-- Delete the Auth user mirror for a staff row (when staff is removed).
create or replace function public.delete_staff_auth(p_staff_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_email text; v_username text;
begin
  select username into v_username from public.staff where id = p_staff_id;
  if v_username is not null then
    v_email := public.staff_email(v_username);
    delete from auth.users where email = v_email;
  end if;
end;
$$;

-- 12g. Re-define the staff-write RPCs so every change is mirrored to the Auth
--      user (login must stay real-Auth). These override the 11k definitions.
--      Every write is additionally guarded by belongs_outlet(): the caller's
--      own tenant (JWT claim / portal header) must own the target outlet, or
--      the caller is the platform super admin. Prevents a compromised session
--      from writing into another tenant.
--
-- insert_staff: create staff row + Auth user. Returns the staff id so the
-- client can sync if needed.
create or replace function public.insert_staff(
  p_outlet_id uuid, p_name text, p_username text, p_pin text, p_role text default 'kasir'
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_id uuid;
begin
  if not public.belongs_outlet(p_outlet_id) then
    raise exception 'tidak berhak mengelola staf outlet ini';
  end if;
  insert into public.staff (outlet_id, name, username, pin_hash, role, active)
  values (p_outlet_id, p_name, lower(p_username), crypt(p_pin, gen_salt('bf', 10)),
          coalesce(nullif(p_role, ''), 'kasir'), true)
  returning id into v_id;

  -- Mirror/refresh the Auth user: created if the staff is new, updated
  -- (PIN + metadata) if a staff row / earlier backfill left one stale.
  perform public.sync_staff_auth(v_id, p_pin);
  return v_id;
end;
$$;

-- set_staff_password: rotate the staff PIN and its Auth user's password.
create or replace function public.set_staff_password(p_staff_id uuid, p_new_pin text, p_outlet_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_outlet_id is not null and not public.belongs_outlet(p_outlet_id) then
    raise exception 'tidak berhak mengelola staf outlet ini';
  end if;
  update public.staff set pin_hash = crypt(p_new_pin, gen_salt('bf', 10))
   where id = p_staff_id
     and (p_outlet_id is null or outlet_id = p_outlet_id);
  if found then perform public.sync_staff_auth(p_staff_id, p_new_pin); end if;
end;
$$;

-- update_staff: rename staff + keep Auth email in sync (email derives from username).
create or replace function public.update_staff(
  p_id uuid, p_name text, p_username text, p_outlet_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_old_username text; v_new_username text;
begin
  if p_outlet_id is not null and not public.belongs_outlet(p_outlet_id) then
    raise exception 'tidak berhak mengelola staf outlet ini';
  end if;
  select username into v_old_username from public.staff where id = p_id;
  update public.staff
     set name     = nullif(btrim(p_name), ''),
         username = nullif(btrim(p_username), '')
   where id = p_id
     and (p_outlet_id is null or outlet_id = p_outlet_id);
  if found and v_old_username is distinct from nullif(btrim(p_username), '') then
    v_new_username := nullif(btrim(p_username), '');
    update auth.users set email = public.staff_email(v_new_username)
     where email = public.staff_email(v_old_username);
  end if;
end;
$$;

-- delete_staff: remove staff row + its Auth user.
create or replace function public.delete_staff(p_id uuid, p_outlet_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_outlet_id is not null and not public.belongs_outlet(p_outlet_id) then
    raise exception 'tidak berhak mengelola staf outlet ini';
  end if;
  perform public.delete_staff_auth(p_id) where exists
    (select 1 from public.staff where id = p_id
       and (p_outlet_id is null or outlet_id = p_outlet_id));
  delete from public.staff where id = p_id
    and (p_outlet_id is null or outlet_id = p_outlet_id);
end;
$$;

-- 12h. Backfill Auth users for the EXISTING staff (created before the Auth
-- bridge existed). Email/outlet/role derive from staff rows; the password is
-- copied from the staff's live bcrypt pin_hash — so the PINs staff already know
-- keep working, no plaintext needed, idempotent. Run once at deploy.
-- The user insert sets '' (not NULL) on the text columns GoTrue scans as Go
-- strings, and the identity insert mirrors the user so password sign-in can
-- resolve it (GoTrue resolves users through auth.identities).
with auth_inserts as (
  insert into auth.users
    (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data,
     confirmation_token, recovery_token, email_change_token_new,
     email_change, phone, phone_change, phone_change_token, email_change_token_current,
     reauthentication_token, email_change_confirm_status,
     is_super_admin, created_at, updated_at, is_sso_user, is_anonymous)
  select
    '00000000-0000-0000-0000-000000000000'::uuid,
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    s.username || '@kasira.local',
    s.pin_hash,
    now(),
    jsonb_build_object(
      'provider', 'email',
      'providers', jsonb_build_array('email'),
      'outlet_id', s.outlet_id,
      'role', s.role,
      'super_admin', (s.role = 'super_admin')
    ),
    '', '', '',
    '', null, '', '',
    '', '', 0,
    false, now(), now(), false, false
  from public.staff s
  where s.active
    and not exists (
      select 1 from auth.users u where u.email = s.username || '@kasira.local'
    )
  returning id, email
)
insert into auth.identities (provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at, id)
select
  a.email, a.id,
  jsonb_build_object('sub', a.id::text, 'email', a.email,
    'email_verified', false, 'phone_verified', false),
  'email', now(), now(), now(), gen_random_uuid()
from auth_inserts a;

