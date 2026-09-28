-- Task065: bind a finalized print snapshot to an order.
-- Does not edit earlier order, print job, or print snapshot migrations.

begin;

alter table public.orders
  add column draft_version_id uuid references public.album_draft_versions(id),
  add column print_snapshot_id uuid references public.album_print_snapshots(id),
  add column print_fingerprint text;

alter table public.album_print_snapshots
  add column finalized_at timestamptz;

create index orders_print_snapshot_idx
  on public.orders (print_snapshot_id)
  where print_snapshot_id is not null;

-- Content columns never change. PDF path can be attached only before finalize.
create or replace function public.guard_print_snapshot_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.snapshot is distinct from old.snapshot
     or new.fingerprint is distinct from old.fingerprint
     or new.draft_version_id is distinct from old.draft_version_id
     or new.album_id is distinct from old.album_id
     or new.schema_version is distinct from old.schema_version
     or new.source_revision is distinct from old.source_revision
     or new.revision_digest is distinct from old.revision_digest
  then
    raise exception '印刷スナップショットは変更できません' using errcode = 'P0001';
  end if;
  if old.finalized_at is not null and (
       new.pdf_path is distinct from old.pdf_path
    or new.content_hash is distinct from old.content_hash
    or new.finalized_at is distinct from old.finalized_at
  ) then
    raise exception '確定済みの印刷スナップショットは変更できません' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger album_print_snapshots_immutable
  before update on public.album_print_snapshots
  for each row execute function public.guard_print_snapshot_update();

create or replace function public.guard_print_snapshot_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.orders o
     where o.print_snapshot_id = old.id
       and o.status in ('pending', 'paid')
  ) then
    raise exception '注文に結び付いた印刷スナップショットは削除できません' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create trigger album_print_snapshots_no_delete_when_ordered
  before delete on public.album_print_snapshots
  for each row execute function public.guard_print_snapshot_delete();

create or replace function public.guard_order_print_binding()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_album uuid;
  v_draft uuid;
  v_fingerprint text;
  v_finalized timestamptz;
begin
  if tg_op = 'UPDATE'
     and old.print_snapshot_id is not null
     and new.print_snapshot_id is distinct from old.print_snapshot_id
  then
    raise exception '注文の印刷スナップショットは変更できません' using errcode = 'P0001';
  end if;

  if new.print_snapshot_id is null then
    return new;
  end if;

  select album_id, draft_version_id, fingerprint, finalized_at
    into v_album, v_draft, v_fingerprint, v_finalized
    from public.album_print_snapshots
   where id = new.print_snapshot_id;

  if v_album is null
     or v_album is distinct from new.album_id
     or v_draft is distinct from new.draft_version_id
     or v_fingerprint is distinct from new.print_fingerprint
     or v_finalized is null
  then
    raise exception '印刷スナップショットをこの注文に結び付けられません' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger orders_print_snapshot_binding
  before insert or update on public.orders
  for each row execute function public.guard_order_print_binding();

create or replace function public.finalize_album_print_snapshot(p_snapshot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_status text;
  v_row public.album_print_snapshots;
begin
  select a.owner_user_id, a.status
    into v_owner, v_status
    from public.album_print_snapshots s
    join public.albums a on a.id = s.album_id
   where s.id = p_snapshot_id;

  select * into v_row from public.album_print_snapshots where id = p_snapshot_id;

  if v_owner is null or v_owner is distinct from (select auth.uid()) then
    raise exception 'このアルバムは変更できません' using errcode = 'P0001';
  end if;
  if v_status = 'ordered' then
    raise exception 'このアルバムは注文済みのため変更できません' using errcode = 'P0001';
  end if;
  if v_row.pdf_path is null then
    raise exception '印刷プレビューがまだありません' using errcode = 'P0001';
  end if;

  update public.album_print_snapshots
     set finalized_at = coalesce(finalized_at, now())
   where id = p_snapshot_id;

  select * into v_row from public.album_print_snapshots where id = p_snapshot_id;
  return jsonb_build_object(
    'id', v_row.id,
    'album_id', v_row.album_id,
    'draft_version_id', v_row.draft_version_id,
    'fingerprint', v_row.fingerprint,
    'finalized_at', v_row.finalized_at
  );
end;
$$;

revoke all on function public.finalize_album_print_snapshot(uuid) from public, anon;
grant execute on function public.finalize_album_print_snapshot(uuid) to authenticated;

-- Paid transition keeps the existing album_photos snapshot for orders that
-- have no print snapshot. Orders bound to a print snapshot copy photo paths
-- from that snapshot, not from the live album.
create or replace function public.mark_order_paid(
  p_order_id          uuid,
  p_stripe_session_id text,
  p_payment_intent_id text,
  p_provider          text default 'mock'
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_album_id      uuid;
  v_status        text;
  v_session_id    text;
  v_album_title   text;
  v_cover_id      uuid;
  v_cover_path    text;
  v_snapshot_id   uuid;
begin
  select album_id, status, stripe_checkout_session_id, print_snapshot_id
    into v_album_id, v_status, v_session_id, v_snapshot_id
    from public.orders
   where id = p_order_id
     for update;

  if not found then return; end if;
  if v_status = 'paid' then return; end if;
  if v_status <> 'pending' then return; end if;
  if v_session_id is null or v_session_id <> p_stripe_session_id then return; end if;

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

  if v_snapshot_id is null then
    insert into public.order_photos
      (order_id, photo_id, position, original_path, thumbnail_path, taken_at, caption)
    select p_order_id, ap.photo_id, ap.position,
           ph.storage_path, ph.thumbnail_path, ph.taken_at, ph.caption
      from public.album_photos ap
      join public.photos ph on ph.id = ap.photo_id
     where ap.album_id = v_album_id
     order by ap.position;
  else
    insert into public.order_photos
      (order_id, photo_id, position, original_path)
    select p_order_id,
           (fr.elem->>'photoId')::uuid,
           (row_number() over (order by sp.ord, fr.ord))::integer - 1,
           fr.elem->>'storagePath'
      from public.album_print_snapshots s
      cross join lateral jsonb_array_elements(s.snapshot->'spreads') with ordinality as sp(elem, ord)
      cross join lateral jsonb_array_elements(sp.elem->'frames') with ordinality as fr(elem, ord)
     where s.id = v_snapshot_id
       and coalesce(fr.elem->>'storagePath', '') <> ''
       and fr.elem->>'photoId' is not null;

    insert into public.order_photos
      (order_id, photo_id, position, original_path)
    select p_order_id,
           (s.snapshot->'cover'->>'photoId')::uuid,
           coalesce((select max(position) + 1 from public.order_photos where order_id = p_order_id), 0),
           s.snapshot->'cover'->>'storagePath'
      from public.album_print_snapshots s
     where s.id = v_snapshot_id
       and coalesce(s.snapshot->'cover'->>'storagePath', '') <> ''
       and s.snapshot->'cover'->>'photoId' is not null
       and not exists (
         select 1 from public.order_photos op
          where op.order_id = p_order_id
            and op.original_path = s.snapshot->'cover'->>'storagePath'
       );
  end if;

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

  update public.albums
     set status     = 'ordered',
         updated_at = now()
   where id = v_album_id;

  insert into public.print_jobs (order_id, provider, idempotency_key, status)
  values (p_order_id, p_provider, 'print-order:' || p_order_id::text, 'queued')
  on conflict (idempotency_key) do nothing;
end;
$$;

revoke execute on function public.mark_order_paid(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.mark_order_paid(uuid, text, text, text)
  to service_role;

commit;
