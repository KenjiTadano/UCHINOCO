-- Task058: AI album draft persistence.
-- AI columns stay put. User edits land in user_* columns.
-- Does not rewrite orders, order_photos, print_jobs, or album_photos.

begin;

create table public.album_draft_versions (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  generation_version text not null,
  status text not null default 'ready' check (status in ('ready', 'editing', 'locked')),
  is_active boolean not null default false,
  revision integer not null default 1 check (revision >= 1),
  generation_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index album_draft_versions_one_active_idx
  on public.album_draft_versions (album_id)
  where is_active;

create index album_draft_versions_album_idx
  on public.album_draft_versions (album_id, created_at desc);

create table public.album_draft_spreads (
  id uuid primary key default gen_random_uuid(),
  draft_version_id uuid not null references public.album_draft_versions(id) on delete cascade,
  story_spread_id text not null,
  position integer not null check (position >= 0),
  story_type text not null,
  recommended_density text not null,
  importance numeric not null,
  coherence numeric not null,
  ai_layout_id text not null,
  user_layout_id text,
  warnings jsonb not null default '[]'::jsonb,
  revision integer not null default 1 check (revision >= 1),
  client_seq bigint not null default 0 check (client_seq >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (draft_version_id, story_spread_id),
  unique (draft_version_id, position)
);

create index album_draft_spreads_version_idx
  on public.album_draft_spreads (draft_version_id, position);

create table public.album_draft_frames (
  id uuid primary key default gen_random_uuid(),
  draft_spread_id uuid not null references public.album_draft_spreads(id) on delete cascade,
  frame_id text not null,
  role text not null,
  position integer not null check (position >= 0),
  ai_photo_id uuid not null references public.photos(id) on delete restrict,
  ai_crop_x numeric not null,
  ai_crop_y numeric not null,
  ai_crop_scale numeric not null check (ai_crop_scale > 0),
  user_photo_id uuid references public.photos(id) on delete set null,
  user_crop_x numeric,
  user_crop_y numeric,
  user_crop_scale numeric check (user_crop_scale is null or user_crop_scale > 0),
  match_tier text,
  crop_quality numeric,
  warnings jsonb not null default '[]'::jsonb,
  revision integer not null default 1 check (revision >= 1),
  client_seq bigint not null default 0 check (client_seq >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (draft_spread_id, frame_id),
  unique (draft_spread_id, position)
);

create index album_draft_frames_spread_idx
  on public.album_draft_frames (draft_spread_id, position);

create trigger album_draft_versions_updated_at
  before update on public.album_draft_versions
  for each row execute function public.set_updated_at();

create trigger album_draft_spreads_updated_at
  before update on public.album_draft_spreads
  for each row execute function public.set_updated_at();

create trigger album_draft_frames_updated_at
  before update on public.album_draft_frames
  for each row execute function public.set_updated_at();

-- ── Guards ───────────────────────────────────────────────────────────────────

create or replace function public.album_draft_mutation_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_album_id uuid;
  v_album_status text;
  v_version_id uuid;
  v_version_status text;
  v_spread_id uuid;
begin
  if tg_table_name = 'album_draft_versions' then
    v_album_id := case when tg_op = 'DELETE' then old.album_id else new.album_id end;
    if tg_op = 'UPDATE' and new.album_id is distinct from old.album_id then
      raise exception 'draftを別のアルバムへ移せません' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'album_draft_spreads' then
    v_version_id := case when tg_op = 'DELETE' then old.draft_version_id else new.draft_version_id end;
    if tg_op = 'UPDATE' and new.draft_version_id is distinct from old.draft_version_id then
      raise exception 'spreadを別のdraftへ移せません' using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' and (
      new.ai_layout_id is distinct from old.ai_layout_id
      or new.story_spread_id is distinct from old.story_spread_id
    ) then
      raise exception 'AI Stateは変更できません' using errcode = 'P0001';
    end if;
    select album_id into v_album_id from public.album_draft_versions where id = v_version_id;
  else
    v_spread_id := case when tg_op = 'DELETE' then old.draft_spread_id else new.draft_spread_id end;
    if tg_op = 'UPDATE' and new.draft_spread_id is distinct from old.draft_spread_id then
      raise exception 'frameを別のspreadへ移せません' using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' and (
      new.ai_photo_id is distinct from old.ai_photo_id
      or new.ai_crop_x is distinct from old.ai_crop_x
      or new.ai_crop_y is distinct from old.ai_crop_y
      or new.ai_crop_scale is distinct from old.ai_crop_scale
      or new.frame_id is distinct from old.frame_id
    ) then
      raise exception 'AI Stateは変更できません' using errcode = 'P0001';
    end if;
    select v.album_id into v_album_id
      from public.album_draft_spreads s
      join public.album_draft_versions v on v.id = s.draft_version_id
     where s.id = v_spread_id;
  end if;

  select status into v_album_status from public.albums where id = v_album_id;

  if tg_table_name = 'album_draft_versions'
     and tg_op = 'UPDATE'
     and v_album_status = 'ordered'
     and new.status = 'locked'
     and old.generation_metadata = new.generation_metadata
     and old.is_active = new.is_active
     and old.album_id = new.album_id
     and old.generation_version = new.generation_version
     and old.revision = new.revision
  then
    return new;
  end if;

  if v_album_status = 'ordered' then
    raise exception 'このアルバムは注文済みのため変更できません' using errcode = 'P0001';
  end if;

  if tg_table_name = 'album_draft_spreads' then
    select status into v_version_status from public.album_draft_versions where id = v_version_id;
  elsif tg_table_name = 'album_draft_frames' then
    select v.status into v_version_status
      from public.album_draft_spreads s
      join public.album_draft_versions v on v.id = s.draft_version_id
     where s.id = v_spread_id;
  end if;

  if v_version_status = 'locked' then
    raise exception 'このアルバムは注文済みのため変更できません' using errcode = 'P0001';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger album_draft_versions_guard
  before insert or update or delete on public.album_draft_versions
  for each row execute function public.album_draft_mutation_guard();

create trigger album_draft_spreads_guard
  before insert or update or delete on public.album_draft_spreads
  for each row execute function public.album_draft_mutation_guard();

create trigger album_draft_frames_guard
  before insert or update or delete on public.album_draft_frames
  for each row execute function public.album_draft_mutation_guard();

create or replace function public.check_draft_frame_photo_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pet uuid;
  v_owner uuid;
begin
  select a.pet_id, a.owner_user_id into v_pet, v_owner
    from public.album_draft_spreads s
    join public.album_draft_versions v on v.id = s.draft_version_id
    join public.albums a on a.id = v.album_id
   where s.id = new.draft_spread_id;

  if not exists (
    select 1 from public.photos p
     where p.id = new.ai_photo_id
       and p.pet_id = v_pet
       and p.uploader_user_id = v_owner
  ) then
    raise exception 'この写真はこのアルバムに使えません' using errcode = 'P0001';
  end if;

  if new.user_photo_id is not null and not exists (
    select 1 from public.photos p
     where p.id = new.user_photo_id
       and p.pet_id = v_pet
       and p.uploader_user_id = v_owner
  ) then
    raise exception 'この写真はこのアルバムに使えません' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger album_draft_frames_photo_owner
  before insert or update on public.album_draft_frames
  for each row execute function public.check_draft_frame_photo_owner();

create or replace function public.lock_album_drafts_when_ordered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'ordered' and old.status is distinct from 'ordered' then
    update public.album_draft_versions
       set status = 'locked'
     where album_id = new.id
       and status is distinct from 'locked';
  end if;
  return new;
end;
$$;

create trigger albums_lock_drafts_when_ordered
  after update of status on public.albums
  for each row execute function public.lock_album_drafts_when_ordered();

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.album_draft_versions enable row level security;
alter table public.album_draft_spreads enable row level security;
alter table public.album_draft_frames enable row level security;

create policy "album_draft_versions: owner select"
  on public.album_draft_versions for select
  using (
    exists (
      select 1 from public.albums a
       where a.id = album_draft_versions.album_id
         and a.owner_user_id = (select auth.uid())
    )
  );

create policy "album_draft_versions: owner insert"
  on public.album_draft_versions for insert
  with check (
    exists (
      select 1 from public.albums a
       where a.id = album_draft_versions.album_id
         and a.owner_user_id = (select auth.uid())
    )
  );

create policy "album_draft_versions: owner update"
  on public.album_draft_versions for update
  using (
    exists (
      select 1 from public.albums a
       where a.id = album_draft_versions.album_id
         and a.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.albums a
       where a.id = album_draft_versions.album_id
         and a.owner_user_id = (select auth.uid())
    )
  );

create policy "album_draft_spreads: owner select"
  on public.album_draft_spreads for select
  using (
    exists (
      select 1
        from public.album_draft_versions v
        join public.albums a on a.id = v.album_id
       where v.id = album_draft_spreads.draft_version_id
         and a.owner_user_id = (select auth.uid())
    )
  );

create policy "album_draft_spreads: owner insert"
  on public.album_draft_spreads for insert
  with check (
    exists (
      select 1
        from public.album_draft_versions v
        join public.albums a on a.id = v.album_id
       where v.id = album_draft_spreads.draft_version_id
         and a.owner_user_id = (select auth.uid())
    )
  );

create policy "album_draft_spreads: owner update"
  on public.album_draft_spreads for update
  using (
    exists (
      select 1
        from public.album_draft_versions v
        join public.albums a on a.id = v.album_id
       where v.id = album_draft_spreads.draft_version_id
         and a.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
        from public.album_draft_versions v
        join public.albums a on a.id = v.album_id
       where v.id = album_draft_spreads.draft_version_id
         and a.owner_user_id = (select auth.uid())
    )
  );

create policy "album_draft_frames: owner select"
  on public.album_draft_frames for select
  using (
    exists (
      select 1
        from public.album_draft_spreads s
        join public.album_draft_versions v on v.id = s.draft_version_id
        join public.albums a on a.id = v.album_id
       where s.id = album_draft_frames.draft_spread_id
         and a.owner_user_id = (select auth.uid())
    )
  );

create policy "album_draft_frames: owner insert"
  on public.album_draft_frames for insert
  with check (
    exists (
      select 1
        from public.album_draft_spreads s
        join public.album_draft_versions v on v.id = s.draft_version_id
        join public.albums a on a.id = v.album_id
       where s.id = album_draft_frames.draft_spread_id
         and a.owner_user_id = (select auth.uid())
    )
  );

create policy "album_draft_frames: owner update"
  on public.album_draft_frames for update
  using (
    exists (
      select 1
        from public.album_draft_spreads s
        join public.album_draft_versions v on v.id = s.draft_version_id
        join public.albums a on a.id = v.album_id
       where s.id = album_draft_frames.draft_spread_id
         and a.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
        from public.album_draft_spreads s
        join public.album_draft_versions v on v.id = s.draft_version_id
        join public.albums a on a.id = v.album_id
       where s.id = album_draft_frames.draft_spread_id
         and a.owner_user_id = (select auth.uid())
    )
  );

revoke all on public.album_draft_versions from anon;
revoke all on public.album_draft_spreads from anon;
revoke all on public.album_draft_frames from anon;
revoke delete on public.album_draft_versions from authenticated;
revoke delete on public.album_draft_spreads from authenticated;
revoke delete on public.album_draft_frames from authenticated;
grant select, insert, update on public.album_draft_versions to authenticated;
grant select, insert, update on public.album_draft_spreads to authenticated;
grant select, insert, update on public.album_draft_frames to authenticated;

-- ── Save + partial override ──────────────────────────────────────────────────

create or replace function public.save_album_draft_version(
  p_album_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_status text;
  v_sig text;
  v_existing uuid;
  v_version_id uuid;
  v_spread jsonb;
  v_spread_id uuid;
  v_frame jsonb;
begin
  select owner_user_id, status into v_owner, v_status
    from public.albums
   where id = p_album_id
     and owner_user_id = (select auth.uid());

  if v_owner is null then
    raise exception 'not found' using errcode = 'P0001';
  end if;

  if v_status = 'ordered' then
    raise exception 'このアルバムは注文済みのため変更できません' using errcode = 'P0001';
  end if;

  v_sig := p_payload->'metadata'->>'signature';
  select id into v_existing
    from public.album_draft_versions
   where album_id = p_album_id
     and is_active
     and generation_metadata->>'signature' = v_sig;

  if v_existing is not null then
    return v_existing;
  end if;

  update public.album_draft_versions
     set is_active = false
   where album_id = p_album_id
     and is_active;

  insert into public.album_draft_versions (
    album_id, generation_version, status, is_active, generation_metadata
  ) values (
    p_album_id,
    p_payload->>'generationVersion',
    'ready',
    true,
    p_payload->'metadata'
  )
  returning id into v_version_id;

  for v_spread in select value from jsonb_array_elements(p_payload->'spreads')
  loop
    insert into public.album_draft_spreads (
      draft_version_id, story_spread_id, position, story_type, recommended_density,
      importance, coherence, ai_layout_id, user_layout_id, warnings
    ) values (
      v_version_id,
      v_spread->>'storySpreadId',
      (v_spread->>'position')::integer,
      v_spread->>'storyType',
      v_spread->>'recommendedDensity',
      (v_spread->>'importance')::numeric,
      (v_spread->>'coherence')::numeric,
      v_spread->>'aiLayoutId',
      null,
      coalesce(v_spread->'warnings', '[]'::jsonb)
    )
    returning id into v_spread_id;

    for v_frame in select value from jsonb_array_elements(v_spread->'frames')
    loop
      insert into public.album_draft_frames (
        draft_spread_id, frame_id, role, position,
        ai_photo_id, ai_crop_x, ai_crop_y, ai_crop_scale,
        user_photo_id, user_crop_x, user_crop_y, user_crop_scale,
        match_tier, crop_quality, warnings
      ) values (
        v_spread_id,
        v_frame->>'frameId',
        v_frame->>'role',
        (v_frame->>'position')::integer,
        (v_frame->>'aiPhotoId')::uuid,
        (v_frame->>'aiCropX')::numeric,
        (v_frame->>'aiCropY')::numeric,
        (v_frame->>'aiCropScale')::numeric,
        null, null, null, null,
        v_frame->>'matchTier',
        (v_frame->>'cropQuality')::numeric,
        coalesce(v_frame->'warnings', '[]'::jsonb)
      );
    end loop;
  end loop;

  return v_version_id;
end;
$$;

create or replace function public.apply_draft_spread_layout(
  p_spread_id uuid,
  p_expected_revision integer,
  p_client_seq bigint,
  p_user_layout_id text,
  p_reset boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.album_draft_spreads%rowtype;
  v_updated public.album_draft_spreads%rowtype;
begin
  update public.album_draft_spreads
     set user_layout_id = case when p_reset then null else p_user_layout_id end,
         client_seq = p_client_seq,
         revision = revision + 1
   where id = p_spread_id
     and (
       client_seq < p_client_seq
       or (client_seq = p_client_seq and revision = p_expected_revision)
     )
  returning * into v_updated;

  if found then
    update public.album_draft_versions
       set status = case when status = 'ready' then 'editing' else status end,
           revision = revision + 1
     where id = v_updated.draft_version_id;
    return jsonb_build_object(
      'status', 'applied',
      'revision', v_updated.revision,
      'clientSeq', v_updated.client_seq
    );
  end if;

  select * into v_row from public.album_draft_spreads where id = p_spread_id;
  if not found then
    return jsonb_build_object('status', 'missing');
  end if;
  if v_row.client_seq > p_client_seq then
    return jsonb_build_object('status', 'stale', 'revision', v_row.revision, 'clientSeq', v_row.client_seq);
  end if;
  return jsonb_build_object('status', 'conflict', 'revision', v_row.revision, 'clientSeq', v_row.client_seq);
end;
$$;

create or replace function public.apply_draft_frame_override(
  p_frame_id uuid,
  p_expected_revision integer,
  p_client_seq bigint,
  p_user_photo_id uuid,
  p_clear_photo boolean,
  p_crop_x numeric,
  p_crop_y numeric,
  p_crop_scale numeric,
  p_clear_crop boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.album_draft_frames%rowtype;
  v_updated public.album_draft_frames%rowtype;
  v_version_id uuid;
begin
  update public.album_draft_frames
     set user_photo_id = case
           when p_clear_photo then null
           when p_user_photo_id is not null then p_user_photo_id
           else user_photo_id
         end,
         user_crop_x = case when p_clear_crop then null else coalesce(p_crop_x, user_crop_x) end,
         user_crop_y = case when p_clear_crop then null else coalesce(p_crop_y, user_crop_y) end,
         user_crop_scale = case when p_clear_crop then null else coalesce(p_crop_scale, user_crop_scale) end,
         client_seq = p_client_seq,
         revision = revision + 1
   where id = p_frame_id
     and (
       client_seq < p_client_seq
       or (client_seq = p_client_seq and revision = p_expected_revision)
     )
  returning * into v_updated;

  if found then
    select draft_version_id into v_version_id
      from public.album_draft_spreads
     where id = v_updated.draft_spread_id;
    update public.album_draft_versions
       set status = case when status = 'ready' then 'editing' else status end,
           revision = revision + 1
     where id = v_version_id;
    return jsonb_build_object(
      'status', 'applied',
      'revision', v_updated.revision,
      'clientSeq', v_updated.client_seq
    );
  end if;

  select * into v_row from public.album_draft_frames where id = p_frame_id;
  if not found then
    return jsonb_build_object('status', 'missing');
  end if;
  if v_row.client_seq > p_client_seq then
    return jsonb_build_object('status', 'stale', 'revision', v_row.revision, 'clientSeq', v_row.client_seq);
  end if;
  return jsonb_build_object('status', 'conflict', 'revision', v_row.revision, 'clientSeq', v_row.client_seq);
end;
$$;

revoke all on function public.save_album_draft_version(uuid, jsonb) from public, anon, service_role;
revoke all on function public.apply_draft_spread_layout(uuid, integer, bigint, text, boolean) from public, anon, service_role;
revoke all on function public.apply_draft_frame_override(uuid, integer, bigint, uuid, boolean, numeric, numeric, numeric, boolean) from public, anon, service_role;
grant execute on function public.save_album_draft_version(uuid, jsonb) to authenticated;
grant execute on function public.apply_draft_spread_layout(uuid, integer, bigint, text, boolean) to authenticated;
grant execute on function public.apply_draft_frame_override(uuid, integer, bigint, uuid, boolean, numeric, numeric, numeric, boolean) to authenticated;

commit;
