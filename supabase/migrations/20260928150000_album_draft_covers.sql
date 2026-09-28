-- Task060: cover persistence on the same draft version as page spreads.
-- Does not alter Task058 tables or order snapshots.

begin;

create table public.album_draft_covers (
  id uuid primary key default gen_random_uuid(),
  draft_version_id uuid not null unique references public.album_draft_versions(id) on delete cascade,
  cover_type text not null default 'front' check (cover_type = 'front'),
  ai_photo_id uuid references public.photos(id) on delete restrict,
  user_photo_id uuid references public.photos(id) on delete set null,
  ai_title text not null default '',
  user_title text,
  ai_subtitle text not null default '',
  user_subtitle text,
  ai_template_id text not null default 'simple',
  user_template_id text,
  ai_color_id text not null default 'white',
  user_color_id text,
  revision integer not null default 1 check (revision >= 1),
  client_seq bigint not null default 0 check (client_seq >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint album_draft_covers_ai_template_chk check (
    ai_template_id in ('simple', 'natural', 'polaroid', 'seasonal', 'handwritten', 'custom')
  ),
  constraint album_draft_covers_user_template_chk check (
    user_template_id is null
    or user_template_id in ('simple', 'natural', 'polaroid', 'seasonal', 'handwritten', 'custom')
  ),
  constraint album_draft_covers_ai_color_chk check (
    ai_color_id in ('white', 'pink', 'blue', 'sage', 'beige', 'charcoal')
  ),
  constraint album_draft_covers_user_color_chk check (
    user_color_id is null
    or user_color_id in ('white', 'pink', 'blue', 'sage', 'beige', 'charcoal')
  )
);

create trigger album_draft_covers_updated_at
  before update on public.album_draft_covers
  for each row execute function public.set_updated_at();

create or replace function public.album_draft_cover_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_album_id uuid;
  v_album_status text;
  v_version_status text;
begin
  if tg_op = 'UPDATE' and new.draft_version_id is distinct from old.draft_version_id then
    raise exception 'coverを別のdraftへ移せません' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and (
    new.cover_type is distinct from old.cover_type
    or new.ai_photo_id is distinct from old.ai_photo_id
    or new.ai_title is distinct from old.ai_title
    or new.ai_subtitle is distinct from old.ai_subtitle
    or new.ai_template_id is distinct from old.ai_template_id
    or new.ai_color_id is distinct from old.ai_color_id
  ) then
    raise exception 'AI Stateは変更できません' using errcode = 'P0001';
  end if;

  select v.album_id, v.status into v_album_id, v_version_status
    from public.album_draft_versions v
   where v.id = case when tg_op = 'DELETE' then old.draft_version_id else new.draft_version_id end;

  select status into v_album_status from public.albums where id = v_album_id;

  if v_album_status = 'ordered' or v_version_status = 'locked' then
    raise exception 'このアルバムは注文済みのため変更できません' using errcode = 'P0001';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger album_draft_covers_guard
  before insert or update or delete on public.album_draft_covers
  for each row execute function public.album_draft_cover_guard();

create or replace function public.check_draft_cover_photo_owner()
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
    from public.album_draft_versions v
    join public.albums a on a.id = v.album_id
   where v.id = new.draft_version_id;

  if new.ai_photo_id is not null and not exists (
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

create trigger album_draft_covers_photo_owner
  before insert or update on public.album_draft_covers
  for each row execute function public.check_draft_cover_photo_owner();

create or replace function public.apply_draft_cover_override(
  p_cover_id uuid,
  p_expected_revision integer,
  p_client_seq bigint,
  p_field text,
  p_reset boolean,
  p_text text,
  p_photo_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.album_draft_covers%rowtype;
  v_updated public.album_draft_covers%rowtype;
begin
  if p_field not in ('photo', 'title', 'subtitle', 'template', 'color') then
    raise exception '未対応の表紙項目です' using errcode = 'P0001';
  end if;

  update public.album_draft_covers
     set user_photo_id = case
           when p_field <> 'photo' then user_photo_id
           when p_reset then null
           else p_photo_id
         end,
         user_title = case
           when p_field <> 'title' then user_title
           when p_reset then null
           else p_text
         end,
         user_subtitle = case
           when p_field <> 'subtitle' then user_subtitle
           when p_reset then null
           else p_text
         end,
         user_template_id = case
           when p_field <> 'template' then user_template_id
           when p_reset then null
           else p_text
         end,
         user_color_id = case
           when p_field <> 'color' then user_color_id
           when p_reset then null
           else p_text
         end,
         client_seq = p_client_seq,
         revision = revision + 1
   where id = p_cover_id
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

  select * into v_row from public.album_draft_covers where id = p_cover_id;
  if not found then
    return jsonb_build_object('status', 'missing');
  end if;
  if v_row.client_seq > p_client_seq then
    return jsonb_build_object('status', 'stale', 'revision', v_row.revision, 'clientSeq', v_row.client_seq);
  end if;
  return jsonb_build_object('status', 'conflict', 'revision', v_row.revision, 'clientSeq', v_row.client_seq);
end;
$$;

alter table public.album_draft_covers enable row level security;

create policy "album_draft_covers: owner select"
  on public.album_draft_covers for select
  using (
    exists (
      select 1
        from public.album_draft_versions v
        join public.albums a on a.id = v.album_id
       where v.id = album_draft_covers.draft_version_id
         and a.owner_user_id = (select auth.uid())
    )
  );

create policy "album_draft_covers: owner insert"
  on public.album_draft_covers for insert
  with check (
    exists (
      select 1
        from public.album_draft_versions v
        join public.albums a on a.id = v.album_id
       where v.id = album_draft_covers.draft_version_id
         and a.owner_user_id = (select auth.uid())
    )
  );

create policy "album_draft_covers: owner update"
  on public.album_draft_covers for update
  using (
    exists (
      select 1
        from public.album_draft_versions v
        join public.albums a on a.id = v.album_id
       where v.id = album_draft_covers.draft_version_id
         and a.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
        from public.album_draft_versions v
        join public.albums a on a.id = v.album_id
       where v.id = album_draft_covers.draft_version_id
         and a.owner_user_id = (select auth.uid())
    )
  );

grant select, insert, update on public.album_draft_covers to authenticated;

revoke all on function public.apply_draft_cover_override(uuid, integer, bigint, text, boolean, text, uuid) from public, anon, service_role;
grant execute on function public.apply_draft_cover_override(uuid, integer, bigint, text, boolean, text, uuid) to authenticated;

commit;
