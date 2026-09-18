-- Task046-2: order snapshot DB layer + print_jobs + DB mutation guards
-- Remote Supabase: NOT applied (migration file only).

begin;

-- ── 1. orders: snapshot columns ──────────────────────────────────────────────
-- cover_photo_id_snapshot is NOT a FK (preserves snapshot after photo deletion)
alter table public.orders
  add column album_title_snapshot         text,
  add column cover_photo_id_snapshot      uuid,
  add column cover_original_path_snapshot text;

-- ── 2. order_photos ──────────────────────────────────────────────────────────
create table public.order_photos (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete restrict,
  photo_id       uuid references public.photos(id) on delete set null,
  position       integer not null check (position >= 0),
  original_path  text not null,
  thumbnail_path text,
  taken_at       timestamptz,
  caption        text,
  created_at     timestamptz not null default now(),
  unique (order_id, position)
);

create index order_photos_order_position_idx
  on public.order_photos (order_id, position);

alter table public.order_photos enable row level security;

create policy "order_photos: owner select"
  on public.order_photos for select
  using (
    exists (
      select 1 from public.orders o
       where o.id = order_photos.order_id
         and o.owner_user_id = auth.uid()
    )
  );

-- Direct INSERT/UPDATE/DELETE forbidden; only service_role via mark_order_paid
revoke insert, update, delete on public.order_photos from authenticated, anon;

-- ── 3. print_jobs ─────────────────────────────────────────────────────────────
create table public.print_jobs (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete restrict,
  provider          text not null,
  idempotency_key   text not null unique,
  provider_order_id text unique,
  status            text not null default 'queued'
    check (status in ('queued','submitted','processing','shipped','failed','cancelled')),
  submitted_at      timestamptz,
  shipped_at        timestamptz,
  failed_at         timestamptz,
  error_code        text,
  tracking_number   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index print_jobs_order_idx on public.print_jobs (order_id);

create trigger print_jobs_updated_at
  before update on public.print_jobs
  for each row execute function public.set_updated_at();

-- print_jobs is an operational table; never expose to client
alter table public.print_jobs enable row level security;
revoke all on public.print_jobs from authenticated, anon;

-- ── 4. DB mutation guard ──────────────────────────────────────────────────────
-- Belt-and-suspenders DB-level guard: prevents mutations on ordered albums
-- even if the Server Action guard was bypassed (race condition or direct PostgREST).

-- Helper: raises P0001 if album is ordered. Called by trigger functions.
create or replace function public.assert_album_mutable(p_album_id uuid)
returns void language plpgsql set search_path = '' as $$
declare
  v_status text;
begin
  select status into v_status
  from public.albums
  where id = p_album_id;

  if v_status = 'ordered' then
    raise exception 'このアルバムは注文済みのため変更できません'
      using errcode = 'P0001';
  end if;
end;
$$;

-- Prevent authenticated users from calling it directly via PostgREST
revoke execute on function public.assert_album_mutable(uuid) from public, anon, authenticated;

-- Trigger function for album_photos INSERT/UPDATE/DELETE
-- SECURITY DEFINER: runs as function owner, bypasses RLS for the status check
create or replace function public.check_album_photos_mutable()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_album_id uuid;
  v_status   text;
begin
  v_album_id := case tg_op when 'DELETE' then OLD.album_id else NEW.album_id end;

  select status into v_status
  from public.albums
  where id = v_album_id;

  if v_status = 'ordered' then
    raise exception 'このアルバムは注文済みのため変更できません'
      using errcode = 'P0001';
  end if;

  return case tg_op when 'DELETE' then OLD else NEW end;
end;
$$;

-- Trigger function for albums title UPDATE
-- SECURITY DEFINER: consistent with check_album_photos_mutable
create or replace function public.check_album_title_mutable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if OLD.status = 'ordered' then
    raise exception 'このアルバムは注文済みのため変更できません'
      using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;

-- Triggers
create trigger album_photos_check_mutable
  before insert or update or delete on public.album_photos
  for each row execute function public.check_album_photos_mutable();

-- Only intercept title updates; status updates (e.g., mark_order_paid) are allowed
create trigger albums_title_check_mutable
  before update of title on public.albums
  for each row execute function public.check_album_title_mutable();

-- ── 5. mark_order_paid: extended with snapshot logic ─────────────────────────
-- Creates snapshot in same transaction as paid transition.
-- Replaces 20260918130000_mark_order_paid.sql version.
create or replace function public.mark_order_paid(
  p_order_id          uuid,
  p_stripe_session_id text,
  p_payment_intent_id text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_album_id      uuid;
  v_status        text;
  v_session_id    text;
  v_album_title   text;
  v_cover_id      uuid;
  v_cover_path    text;
begin
  -- 1. Lock order row
  select album_id, status, stripe_checkout_session_id
    into v_album_id, v_status, v_session_id
    from public.orders
   where id = p_order_id
     for update;

  if not found then return; end if;

  -- 2. Idempotent: already paid (order_photos already created)
  if v_status = 'paid' then return; end if;

  -- 3. Only pending → paid is allowed
  if v_status <> 'pending' then return; end if;

  -- 4. Session ID binding
  if v_session_id is null or v_session_id <> p_stripe_session_id then return; end if;

  -- 5. Lock album row and get snapshot data
  select title, cover_photo_id
    into v_album_title, v_cover_id
    from public.albums
   where id = v_album_id
     for update;

  -- 6. Cover photo storage path snapshot (nullable)
  if v_cover_id is not null then
    select storage_path into v_cover_path
      from public.photos
     where id = v_cover_id;
  end if;

  -- 7. order_photos snapshot (album_photos x photos at this exact moment)
  insert into public.order_photos
    (order_id, photo_id, position, original_path, thumbnail_path, taken_at, caption)
  select
    p_order_id,
    ap.photo_id,
    ap.position,
    ph.storage_path,
    ph.thumbnail_path,
    ph.taken_at,
    ph.caption
  from public.album_photos ap
  join public.photos ph on ph.id = ap.photo_id
  where ap.album_id = v_album_id
  order by ap.position;

  -- 8. Update orders: paid + all snapshots
  update public.orders
     set status                        = 'paid',
         paid_at                       = now(),
         stripe_payment_intent_id      = p_payment_intent_id,
         stripe_checkout_session_id    = coalesce(p_stripe_session_id, stripe_checkout_session_id),
         album_title_snapshot          = v_album_title,
         cover_photo_id_snapshot       = v_cover_id,
         cover_original_path_snapshot  = v_cover_path,
         updated_at                    = now()
   where id = p_order_id;

  -- 9. Lock in album as ordered
  update public.albums
     set status     = 'ordered',
         updated_at = now()
   where id = v_album_id;
end;
$$;

-- Preserve existing grants from 20260918130000
revoke execute on function public.mark_order_paid(uuid, text, text) from public, anon, authenticated;
grant  execute on function public.mark_order_paid(uuid, text, text) to service_role;

-- ── 6. Storage: protect ordered photo originals from direct client DELETE ────
-- The existing policy allows direct Storage DELETE for photos the user owns.
-- This closes the gap: photos referenced by paid order snapshots cannot be deleted
-- even via direct Supabase Storage API calls from the client.
drop policy if exists "Users can delete photos for their own pets" on storage.objects;

create policy "Users can delete photos for their own pets"
on storage.objects for delete to authenticated
using (
  bucket_id = 'pet-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and (
    public.is_owned_pet((storage.foldername(name))[2])
    or owner_id = (select auth.uid()::text)
  )
  -- Block if path is referenced by a paid order snapshot (order_photos)
  and not exists (
    select 1 from public.order_photos op
    join public.orders o on o.id = op.order_id
    where op.original_path = name
      and o.status = 'paid'
  )
  -- Block if path is the cover snapshot of a paid order
  and not exists (
    select 1 from public.orders o
    where o.cover_original_path_snapshot = name
      and o.status = 'paid'
  )
);

commit;
