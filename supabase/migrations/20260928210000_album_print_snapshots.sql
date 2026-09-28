-- Task064: immutable print snapshots for a draft.
-- Does not change print_jobs, order_photos, or paid order snapshots.

begin;

create table public.album_print_snapshots (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  draft_version_id uuid not null references public.album_draft_versions(id) on delete cascade,
  schema_version text not null,
  source_revision integer not null,
  fingerprint text not null,
  revision_digest text not null,
  snapshot jsonb not null,
  pdf_path text,
  content_hash text,
  created_at timestamptz not null default now(),
  constraint album_print_snapshots_uniq unique (draft_version_id, schema_version, fingerprint)
);

create index album_print_snapshots_album_idx on public.album_print_snapshots (album_id, created_at desc);

alter table public.album_print_snapshots enable row level security;

create policy "album_print_snapshots: owner select"
  on public.album_print_snapshots for select
  using (
    exists (
      select 1
        from public.albums a
       where a.id = album_print_snapshots.album_id
         and a.owner_user_id = (select auth.uid())
    )
  );

revoke all on public.album_print_snapshots from public, anon;
grant select on public.album_print_snapshots to authenticated;

create or replace function public.save_album_print_snapshot(
  p_album_id uuid,
  p_draft_version_id uuid,
  p_schema_version text,
  p_source_revision integer,
  p_fingerprint text,
  p_revision_digest text,
  p_snapshot jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_album_status text;
  v_row public.album_print_snapshots;
begin
  select a.owner_user_id, a.status into v_owner, v_album_status
    from public.albums a
    join public.album_draft_versions v on v.album_id = a.id
   where a.id = p_album_id
     and v.id = p_draft_version_id
     and v.is_active = true;

  if v_owner is null or v_owner is distinct from (select auth.uid()) then
    raise exception 'このアルバムは変更できません' using errcode = 'P0001';
  end if;
  if v_album_status = 'ordered' then
    raise exception 'このアルバムは注文済みのため変更できません' using errcode = 'P0001';
  end if;

  insert into public.album_print_snapshots (
    album_id, draft_version_id, schema_version, source_revision, fingerprint, revision_digest, snapshot
  ) values (
    p_album_id, p_draft_version_id, p_schema_version, p_source_revision, p_fingerprint, p_revision_digest, p_snapshot
  )
  on conflict (draft_version_id, schema_version, fingerprint) do nothing;

  select * into v_row
    from public.album_print_snapshots
   where draft_version_id = p_draft_version_id
     and schema_version = p_schema_version
     and fingerprint = p_fingerprint;

  return jsonb_build_object(
    'id', v_row.id,
    'pdf_path', v_row.pdf_path,
    'content_hash', v_row.content_hash
  );
end;
$$;

create or replace function public.attach_album_print_pdf(
  p_snapshot_id uuid,
  p_pdf_path text,
  p_content_hash text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_row public.album_print_snapshots;
begin
  select a.owner_user_id into v_owner
    from public.album_print_snapshots s
    join public.albums a on a.id = s.album_id
   where s.id = p_snapshot_id;

  if v_owner is null or v_owner is distinct from (select auth.uid()) then
    raise exception 'このアルバムは変更できません' using errcode = 'P0001';
  end if;

  update public.album_print_snapshots
     set pdf_path = p_pdf_path,
         content_hash = p_content_hash
   where id = p_snapshot_id
     and (pdf_path is null or content_hash is not distinct from p_content_hash);

  select * into v_row from public.album_print_snapshots where id = p_snapshot_id;
  return jsonb_build_object('id', v_row.id, 'pdf_path', v_row.pdf_path, 'content_hash', v_row.content_hash);
end;
$$;

revoke all on function public.save_album_print_snapshot(uuid, uuid, text, integer, text, text, jsonb) from public, anon;
grant execute on function public.save_album_print_snapshot(uuid, uuid, text, integer, text, text, jsonb) to authenticated;

revoke all on function public.attach_album_print_pdf(uuid, text, text) from public, anon;
grant execute on function public.attach_album_print_pdf(uuid, text, text) to authenticated;

commit;
