begin;

create table public.album_draft_page_elements (
  id uuid primary key,
  draft_spread_id uuid not null references public.album_draft_spreads(id) on delete cascade,
  element_type text not null check (element_type in ('text', 'stamp', 'decoration')),
  element_data jsonb not null check (jsonb_typeof(element_data) = 'object'),
  is_deleted boolean not null default false,
  revision integer not null default 1 check (revision >= 1),
  client_seq bigint not null default 0 check (client_seq >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index album_draft_page_elements_spread_idx
  on public.album_draft_page_elements (draft_spread_id, updated_at)
  where not is_deleted;

create trigger album_draft_page_elements_updated_at
  before update on public.album_draft_page_elements
  for each row execute function public.set_updated_at();

alter table public.album_draft_page_elements enable row level security;

create policy "Users can view elements for their own draft spreads"
on public.album_draft_page_elements
for select
to authenticated
using (
  exists (
    select 1
      from public.album_draft_spreads s
      join public.album_draft_versions v on v.id = s.draft_version_id
      join public.albums a on a.id = v.album_id
     where s.id = album_draft_page_elements.draft_spread_id
       and a.owner_user_id = (select auth.uid())
  )
);

create table public.album_draft_spread_backgrounds (
  id uuid primary key default gen_random_uuid(),
  draft_spread_id uuid not null references public.album_draft_spreads(id) on delete cascade,
  page_side text not null check (page_side in ('left', 'right')),
  background_id text check (background_id is null or background_id in ('white', 'warm', 'gray', 'sage', 'sky', 'rose')),
  revision integer not null default 1 check (revision >= 1),
  client_seq bigint not null default 0 check (client_seq >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (draft_spread_id, page_side)
);

create index album_draft_spread_backgrounds_spread_idx
  on public.album_draft_spread_backgrounds (draft_spread_id);

create trigger album_draft_spread_backgrounds_updated_at
  before update on public.album_draft_spread_backgrounds
  for each row execute function public.set_updated_at();

alter table public.album_draft_spread_backgrounds enable row level security;

create policy "Users can view backgrounds for their own draft spreads"
on public.album_draft_spread_backgrounds
for select
to authenticated
using (
  exists (
    select 1
      from public.album_draft_spreads s
      join public.album_draft_versions v on v.id = s.draft_version_id
      join public.albums a on a.id = v.album_id
     where s.id = album_draft_spread_backgrounds.draft_spread_id
       and a.owner_user_id = (select auth.uid())
  )
);

revoke all on table public.album_draft_page_elements from public, anon, authenticated;
grant select on table public.album_draft_page_elements to authenticated;
revoke all on table public.album_draft_spread_backgrounds from public, anon, authenticated;
grant select on table public.album_draft_spread_backgrounds to authenticated;

create or replace function public.assert_editable_album_draft_spread(p_spread_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_album_status text;
  v_version_status text;
  v_version_id uuid;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;

  select a.owner_user_id, a.status, v.status, v.id
    into v_owner, v_album_status, v_version_status, v_version_id
    from public.album_draft_spreads s
    join public.album_draft_versions v on v.id = s.draft_version_id
    join public.albums a on a.id = v.album_id
   where s.id = p_spread_id;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception '見開きが見つかりません' using errcode = '42501';
  end if;
  if v_album_status = 'ordered' or v_version_status = 'locked' then
    raise exception 'このアルバムは注文済みのため変更できません' using errcode = 'P0001';
  end if;
  return v_version_id;
end;
$$;

create or replace function public.apply_draft_page_element_override(
  p_spread_id uuid,
  p_element_id uuid,
  p_expected_revision integer,
  p_client_seq bigint,
  p_element_type text,
  p_element_data jsonb,
  p_is_deleted boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version_id uuid;
  v_row public.album_draft_page_elements%rowtype;
  v_x numeric;
  v_y numeric;
  v_width numeric;
  v_height numeric;
  v_rotation numeric;
  v_z_index numeric;
  v_text text;
begin
  if p_spread_id is null or p_element_id is null or p_client_seq is null or p_client_seq < 1
    or p_expected_revision is null or p_expected_revision < 0 or p_is_deleted is null
  then
    raise exception '要素の更新値が不正です' using errcode = 'P0001';
  end if;
  v_version_id := public.assert_editable_album_draft_spread(p_spread_id);
  perform 1 from public.album_draft_spreads where id = p_spread_id for update;

  if not p_is_deleted then
    if p_element_type is null or p_element_type not in ('text', 'stamp', 'decoration')
      or p_element_data is null or jsonb_typeof(p_element_data) <> 'object'
      or p_element_data->>'id' is distinct from p_element_id::text
      or p_element_data->>'type' is distinct from p_element_type
    then
      raise exception '要素の種類が不正です' using errcode = 'P0001';
    end if;
    if jsonb_typeof(p_element_data->'x') is distinct from 'number'
      or jsonb_typeof(p_element_data->'y') is distinct from 'number'
      or jsonb_typeof(p_element_data->'width') is distinct from 'number'
      or jsonb_typeof(p_element_data->'height') is distinct from 'number'
      or jsonb_typeof(p_element_data->'rotation') is distinct from 'number'
      or jsonb_typeof(p_element_data->'zIndex') is distinct from 'number'
    then
      raise exception '要素の位置が不正です' using errcode = 'P0001';
    end if;
    v_x := (p_element_data->>'x')::numeric;
    v_y := (p_element_data->>'y')::numeric;
    v_width := (p_element_data->>'width')::numeric;
    v_height := (p_element_data->>'height')::numeric;
    v_rotation := (p_element_data->>'rotation')::numeric;
    v_z_index := (p_element_data->>'zIndex')::numeric;
    if v_width < (case when p_element_type = 'text' then 0.08 else 0.035 end) or v_width > 0.96
      or v_height < (case when p_element_type = 'text' then 0.025 else 0.035 end) or v_height > 0.96
      or v_x < -v_width + 0.08 or v_x > 0.92
      or v_y < -v_height + 0.08 or v_y > 0.92
      or v_rotation < -180 or v_rotation > 180
      or v_z_index < -100 or v_z_index > 100 or trunc(v_z_index) <> v_z_index
    then
      raise exception '要素の範囲が不正です' using errcode = 'P0001';
    end if;
    if p_element_data->>'printTarget' is null or p_element_data->>'printTarget' not in ('print', 'digital-only') then
      raise exception '出力先が不正です' using errcode = 'P0001';
    end if;

    if p_element_type = 'text' then
      v_text := p_element_data->>'text';
      if v_text is null or char_length(v_text) = 0 or char_length(v_text) > 120 or v_text ~ '[<>[:cntrl:]]'
        or p_element_data->>'fontId' is null or p_element_data->>'fontId' not in ('editorial', 'warm', 'handwritten', 'minimal')
        or jsonb_typeof(p_element_data->'fontSize') is distinct from 'number'
        or (p_element_data->>'fontSize')::numeric not between 10 and 48
        or jsonb_typeof(p_element_data->'bold') <> 'boolean'
        or p_element_data->>'align' is null or p_element_data->>'align' not in ('left', 'center', 'right')
        or p_element_data->>'colorId' is null or p_element_data->>'colorId' not in ('ink', 'terracotta', 'sage', 'sky', 'mustard', 'rose', 'white')
      then
        raise exception 'テキストの内容が不正です' using errcode = 'P0001';
      end if;
    elsif p_element_type = 'stamp' then
      if p_element_data->>'stampId' is null or p_element_data->>'stampId' not in ('paw', 'heart', 'star', 'sparkle', 'bone', 'fish', 'crown', 'birthday', 'first-time', 'outing', 'spring', 'summer', 'autumn', 'winter')
        or p_element_data->>'colorId' is null or p_element_data->>'colorId' not in ('ink', 'terracotta', 'sage', 'sky', 'mustard', 'rose', 'white')
      then
        raise exception 'スタンプが不正です' using errcode = 'P0001';
      end if;
    elsif p_element_data->>'decorationId' is null or p_element_data->>'decorationId' not in ('line', 'tape', 'corner', 'bubble', 'ribbon')
      or p_element_data->>'colorId' is null or p_element_data->>'colorId' not in ('ink', 'terracotta', 'sage', 'sky', 'mustard', 'rose', 'white')
    then
      raise exception '装飾が不正です' using errcode = 'P0001';
    end if;
  end if;

  select * into v_row
    from public.album_draft_page_elements
   where id = p_element_id and draft_spread_id = p_spread_id
   for update;

  if not found then
    if p_is_deleted then
      return jsonb_build_object('status', 'missing');
    end if;
    insert into public.album_draft_page_elements (
      id, draft_spread_id, element_type, element_data, client_seq
    ) values (
      p_element_id, p_spread_id, p_element_type, p_element_data, p_client_seq
    );
  else
    if v_row.client_seq > p_client_seq then
      return jsonb_build_object('status', 'stale', 'revision', v_row.revision, 'clientSeq', v_row.client_seq);
    end if;
    if v_row.client_seq = p_client_seq and v_row.revision <> p_expected_revision then
      return jsonb_build_object('status', 'conflict', 'revision', v_row.revision, 'clientSeq', v_row.client_seq);
    end if;
    update public.album_draft_page_elements
       set element_type = case when p_is_deleted then element_type else p_element_type end,
           element_data = case when p_is_deleted then element_data else p_element_data end,
           is_deleted = p_is_deleted,
           client_seq = p_client_seq,
           revision = revision + 1
     where id = p_element_id and draft_spread_id = p_spread_id;
  end if;

  update public.album_draft_versions set revision = revision + 1 where id = v_version_id;
  return jsonb_build_object('status', 'applied');
end;
$$;

create or replace function public.apply_draft_spread_background_override(
  p_spread_id uuid,
  p_page_side text,
  p_expected_revision integer,
  p_client_seq bigint,
  p_background_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version_id uuid;
  v_row public.album_draft_spread_backgrounds%rowtype;
begin
  if p_spread_id is null or p_page_side is null or p_page_side not in ('left', 'right')
    or p_client_seq is null or p_client_seq < 1 or p_expected_revision is null or p_expected_revision < 0
    or (p_background_id is not null and p_background_id not in ('white', 'warm', 'gray', 'sage', 'sky', 'rose'))
  then
    raise exception 'ページ背景の更新値が不正です' using errcode = 'P0001';
  end if;
  v_version_id := public.assert_editable_album_draft_spread(p_spread_id);
  perform 1 from public.album_draft_spreads where id = p_spread_id for update;

  select * into v_row
    from public.album_draft_spread_backgrounds
   where draft_spread_id = p_spread_id and page_side = p_page_side
   for update;

  if not found then
    if p_background_id is null then
      return jsonb_build_object('status', 'applied');
    end if;
    insert into public.album_draft_spread_backgrounds (
      draft_spread_id, page_side, background_id, client_seq
    ) values (
      p_spread_id, p_page_side, p_background_id, p_client_seq
    );
  else
    if v_row.client_seq > p_client_seq then
      return jsonb_build_object('status', 'stale', 'revision', v_row.revision, 'clientSeq', v_row.client_seq);
    end if;
    if v_row.client_seq = p_client_seq and v_row.revision <> p_expected_revision then
      return jsonb_build_object('status', 'conflict', 'revision', v_row.revision, 'clientSeq', v_row.client_seq);
    end if;
    update public.album_draft_spread_backgrounds
       set background_id = p_background_id,
           client_seq = p_client_seq,
           revision = revision + 1
     where id = v_row.id;
  end if;

  update public.album_draft_versions set revision = revision + 1 where id = v_version_id;
  return jsonb_build_object('status', 'applied');
end;
$$;

revoke all on function public.assert_editable_album_draft_spread(uuid) from public, anon, authenticated;
revoke all on function public.apply_draft_page_element_override(uuid, uuid, integer, bigint, text, jsonb, boolean) from public, anon;
grant execute on function public.apply_draft_page_element_override(uuid, uuid, integer, bigint, text, jsonb, boolean) to authenticated;
revoke all on function public.apply_draft_spread_background_override(uuid, text, integer, bigint, text) from public, anon;
grant execute on function public.apply_draft_spread_background_override(uuid, text, integer, bigint, text) to authenticated;

commit;