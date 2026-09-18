-- Task047-5: print job pipeline additions
-- Remote Supabase: NOT applied (migration file only).

begin;

-- ── print_jobs: asset paths + atomic claim column ─────────────────────────────
alter table public.print_jobs
  add column cover_file_path   text,
  add column content_file_path text,
  add column prepared_at       timestamptz;

-- ── mark_order_paid: extended with p_provider + queued job creation ──────────
-- Replaces both the 3-param version (20260918130000) and 4-param version.
-- The webhook passes PRINT_PROVIDER env value as p_provider so the DB never
-- reads process.env. Client cannot influence the provider choice.
create or replace function public.mark_order_paid(
  p_order_id          uuid,
  p_stripe_session_id text,
  p_payment_intent_id text,
  p_provider          text default 'mock'
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_album_id    uuid;
  v_status      text;
  v_session_id  text;
  v_album_title text;
  v_cover_id    uuid;
  v_cover_path  text;
begin
  -- 1. Lock order row
  select album_id, status, stripe_checkout_session_id
    into v_album_id, v_status, v_session_id
    from public.orders
   where id = p_order_id
     for update;

  if not found then return; end if;
  if v_status = 'paid' then return; end if;    -- idempotent
  if v_status <> 'pending' then return; end if;
  if v_session_id is null or v_session_id <> p_stripe_session_id then return; end if;

  -- 2. Lock album + snapshot cover info
  select title, cover_photo_id
    into v_album_title, v_cover_id
    from public.albums
   where id = v_album_id
     for update;

  if v_cover_id is not null then
    select storage_path into v_cover_path
      from public.photos
     where id = v_cover_id;
  end if;

  -- 3. Snapshot order_photos
  insert into public.order_photos
    (order_id, photo_id, position, original_path, thumbnail_path, taken_at, caption)
  select p_order_id, ap.photo_id, ap.position,
         ph.storage_path, ph.thumbnail_path, ph.taken_at, ph.caption
    from public.album_photos ap
    join public.photos ph on ph.id = ap.photo_id
   where ap.album_id = v_album_id
   order by ap.position;

  -- 4. Update orders: paid + all snapshots
  update public.orders
     set status                       = 'paid',
         paid_at                      = now(),
         stripe_payment_intent_id     = p_payment_intent_id,
         stripe_checkout_session_id   = coalesce(p_stripe_session_id, stripe_checkout_session_id),
         album_title_snapshot         = v_album_title,
         cover_photo_id_snapshot      = v_cover_id,
         cover_original_path_snapshot = v_cover_path,
         updated_at                   = now()
   where id = p_order_id;

  -- 5. Lock in album as ordered
  update public.albums
     set status     = 'ordered',
         updated_at = now()
   where id = v_album_id;

  -- 6. Create queued print job — idempotent via UNIQUE idempotency_key
  insert into public.print_jobs (order_id, provider, idempotency_key, status)
  values (p_order_id, p_provider, 'print-order:' || p_order_id::text, 'queued')
  on conflict (idempotency_key) do nothing;
end;
$$;

-- Revoke old 3-param signature (superseded)
revoke execute on function public.mark_order_paid(uuid, text, text)
  from public, anon, authenticated, service_role;

-- Grant 4-param to service_role only
revoke execute on function public.mark_order_paid(uuid, text, text, text)
  from public, anon, authenticated;
grant  execute on function public.mark_order_paid(uuid, text, text, text)
  to service_role;

-- ── print-files bucket ────────────────────────────────────────────────────────
-- Private PDF storage for generated print files.
-- Accessible only via service_role (bypasses RLS) — no user-facing access.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'print-files',
  'print-files',
  false,
  52428800,                      -- 50 MB per file
  array['application/pdf']
)
on conflict (id) do nothing;

-- No storage.objects policies — service_role needs no policy to access private buckets.
-- Authenticated / anon users get no access (no policy = no access when RLS enabled on storage).

commit;
