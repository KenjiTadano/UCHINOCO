-- Task062: page text and decoration on the same draft spreads.
-- Does not alter Task058 tables, covers, or order snapshots.
-- Removal is override_mode = hidden. Rows are not deleted, so null stays "use AI".

begin;

create table public.album_draft_text_elements (
  id uuid primary key default gen_random_uuid(),
  draft_spread_id uuid not null references public.album_draft_spreads(id) on delete cascade,
  slot_id text not null,
  kind text not null check (kind in ('title', 'caption', 'date')),
  ai_text text,
  user_text text,
  ai_style_id text not null default 'editorial',
  user_style_id text,
  override_mode text not null default 'inherit' check (override_mode in ('inherit', 'replace', 'hidden')),
  position integer not null default 0,
  revision integer not null default 1 check (revision >= 1),
  client_seq bigint not null default 0 check (client_seq >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint album_draft_text_slot_uniq unique (draft_spread_id, slot_id),
  constraint album_draft_text_slot_chk check (
    slot_id in ('top-left', 'top-center', 'bottom-left', 'bottom-center', 'margin-note', 'gutter-note')
  ),
  constraint album_draft_text_style_chk check (
    ai_style_id in ('editorial', 'warm', 'handwritten', 'minimal')
    and (user_style_id is null or user_style_id in ('editorial', 'warm', 'handwritten', 'minimal'))
  ),
  constraint album_draft_text_plain_chk check (
    (ai_text is null or ai_text !~ '[<>]')
    and (user_text is null or user_text !~ '[<>]')
  ),
  constraint album_draft_text_len_chk check (
    (
      kind = 'title'
      and char_length(coalesce(ai_text, '')) <= 40
      and char_length(coalesce(user_text, '')) <= 40
    )
    or (
      kind = 'caption'
      and char_length(coalesce(ai_text, '')) <= 80
      and char_length(coalesce(user_text, '')) <= 80
    )
    or (
      kind = 'date'
      and char_length(coalesce(ai_text, '')) <= 24
      and char_length(coalesce(user_text, '')) <= 24
    )
  )
);

create table public.album_draft_decorations (
  id uuid primary key default gen_random_uuid(),
  draft_spread_id uuid not null references public.album_draft_spreads(id) on delete cascade,
  slot_id text not null,
  ai_decoration_id text,
  user_decoration_id text,
  ai_scale_preset text not null default 'small',
  user_scale_preset text,
  override_mode text not null default 'inherit' check (override_mode in ('inherit', 'replace', 'hidden')),
  position integer not null default 0,
  revision integer not null default 1 check (revision >= 1),
  client_seq bigint not null default 0 check (client_seq >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint album_draft_decorations_slot_uniq unique (draft_spread_id, slot_id),
  constraint album_draft_decorations_slot_chk check (
    slot_id in ('deco-top-left', 'deco-top-right', 'deco-bottom-left', 'deco-bottom-right')
  ),
  constraint album_draft_decorations_id_chk check (
    (ai_decoration_id is null or ai_decoration_id in ('paw', 'heart', 'star', 'tape', 'leaf', 'flower', 'spark'))
    and (user_decoration_id is null or user_decoration_id in ('paw', 'heart', 'star', 'tape', 'leaf', 'flower', 'spark'))
  ),
  constraint album_draft_decorations_scale_chk check (
    ai_scale_preset in ('small', 'medium')
    and (user_scale_preset is null or user_scale_preset in ('small', 'medium'))
  )
);

create index album_draft_text_elements_spread_idx
  on public.album_draft_text_elements (draft_spread_id, position);

create index album_draft_decorations_spread_idx
  on public.album_draft_decorations (draft_spread_id, position);

create trigger album_draft_text_elements_updated_at
  before update on public.album_draft_text_elements
  for each row execute function public.set_updated_at();

create trigger album_draft_decorations_updated_at
  before update on public.album_draft_decorations
  for each row execute function public.set_updated_at();

create or replace function public.album_draft_text_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_spread uuid;
  v_album_status text;
  v_version_status text;
begin
  v_spread := case when tg_op = 'DELETE' then old.draft_spread_id else new.draft_spread_id end;
  if tg_op = 'UPDATE' and (
    new.draft_spread_id is distinct from old.draft_spread_id
    or new.slot_id is distinct from old.slot_id
    or new.kind is distinct from old.kind
  ) then
    raise exception 'この項目は変更できません' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and (
    new.ai_text is distinct from old.ai_text
    or new.ai_style_id is distinct from old.ai_style_id
  ) then
    raise exception 'AI Stateは変更できません' using errcode = 'P0001';
  end if;

  select a.status, v.status into v_album_status, v_version_status
    from public.album_draft_spreads s
    join public.album_draft_versions v on v.id = s.draft_version_id
    join public.albums a on a.id = v.album_id
   where s.id = v_spread;

  if v_album_status = 'ordered' or v_version_status = 'locked' then
    raise exception 'このアルバムは注文済みのため変更できません' using errcode = 'P0001';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger album_draft_text_elements_guard
  before insert or update or delete on public.album_draft_text_elements
  for each row execute function public.album_draft_text_guard();

create or replace function public.album_draft_decoration_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_spread uuid;
  v_album_status text;
  v_version_status text;
begin
  v_spread := case when tg_op = 'DELETE' then old.draft_spread_id else new.draft_spread_id end;
  if tg_op = 'UPDATE' and (
    new.draft_spread_id is distinct from old.draft_spread_id
    or new.slot_id is distinct from old.slot_id
  ) then
    raise exception 'この項目は変更できません' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and (
    new.ai_decoration_id is distinct from old.ai_decoration_id
    or new.ai_scale_preset is distinct from old.ai_scale_preset
  ) then
    raise exception 'AI Stateは変更できません' using errcode = 'P0001';
  end if;

  select a.status, v.status into v_album_status, v_version_status
    from public.album_draft_spreads s
    join public.album_draft_versions v on v.id = s.draft_version_id
    join public.albums a on a.id = v.album_id
   where s.id = v_spread;

  if v_album_status = 'ordered' or v_version_status = 'locked' then
    raise exception 'このアルバムは注文済みのため変更できません' using errcode = 'P0001';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger album_draft_decorations_guard
  before insert or update or delete on public.album_draft_decorations
  for each row execute function public.album_draft_decoration_guard();

create or replace function public.apply_draft_text_override(
  p_spread_id uuid,
  p_slot_id text,
  p_kind text,
  p_expected_revision integer,
  p_client_seq bigint,
  p_mode text,
  p_user_text text,
  p_user_style_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.album_draft_text_elements%rowtype;
  v_updated public.album_draft_text_elements%rowtype;
  v_limit integer;
begin
  if p_slot_id not in ('top-left', 'top-center', 'bottom-left', 'bottom-center', 'margin-note', 'gutter-note') then
    raise exception 'このレイアウトには使えない位置です' using errcode = 'P0001';
  end if;
  if p_kind not in ('title', 'caption', 'date') then
    raise exception 'このレイアウトには使えない位置です' using errcode = 'P0001';
  end if;
  if (p_slot_id in ('top-left', 'top-center') and p_kind <> 'title')
    or (p_slot_id in ('bottom-left', 'bottom-center', 'gutter-note') and p_kind <> 'caption')
    or (p_slot_id = 'margin-note' and p_kind <> 'date') then
    raise exception 'このレイアウトには使えない位置です' using errcode = 'P0001';
  end if;
  if p_mode not in ('inherit', 'replace', 'hidden') then
    raise exception '未対応の表示です' using errcode = 'P0001';
  end if;
  if p_user_style_id is not null and p_user_style_id not in ('editorial', 'warm', 'handwritten', 'minimal') then
    raise exception '未対応の文字スタイルです' using errcode = 'P0001';
  end if;
  if p_user_text is not null and p_user_text ~ '[<>]' then
    raise exception 'テキストはプレーンテキストのみです' using errcode = 'P0001';
  end if;
  v_limit := case p_kind when 'title' then 40 when 'caption' then 80 else 24 end;
  if p_user_text is not null and char_length(p_user_text) > v_limit then
    raise exception '文字数が上限を超えています' using errcode = 'P0001';
  end if;

  select * into v_row
    from public.album_draft_text_elements
   where draft_spread_id = p_spread_id
     and slot_id = p_slot_id;

  if not found then
    insert into public.album_draft_text_elements (
      draft_spread_id, slot_id, kind, ai_text, user_text, ai_style_id, user_style_id, override_mode, client_seq
    ) values (
      p_spread_id, p_slot_id, p_kind, null, p_user_text, 'editorial', p_user_style_id, p_mode, p_client_seq
    )
    returning * into v_updated;
  else
    update public.album_draft_text_elements
       set user_text = p_user_text,
           user_style_id = p_user_style_id,
           override_mode = p_mode,
           client_seq = p_client_seq,
           revision = revision + 1
     where id = v_row.id
       and (
         client_seq < p_client_seq
         or (client_seq = p_client_seq and revision = p_expected_revision)
       )
    returning * into v_updated;
    if not found then
      if v_row.client_seq > p_client_seq then
        return jsonb_build_object('status', 'stale', 'revision', v_row.revision, 'clientSeq', v_row.client_seq);
      end if;
      return jsonb_build_object('status', 'conflict', 'revision', v_row.revision, 'clientSeq', v_row.client_seq);
    end if;
  end if;

  update public.album_draft_versions
     set status = case when status = 'ready' then 'editing' else status end,
         revision = revision + 1
   where id = (
     select s.draft_version_id from public.album_draft_spreads s where s.id = p_spread_id
   );

  return jsonb_build_object('status', 'applied', 'revision', v_updated.revision, 'clientSeq', v_updated.client_seq);
end;
$$;

create or replace function public.apply_draft_decoration_override(
  p_spread_id uuid,
  p_slot_id text,
  p_expected_revision integer,
  p_client_seq bigint,
  p_mode text,
  p_user_decoration_id text,
  p_user_scale_preset text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.album_draft_decorations%rowtype;
  v_updated public.album_draft_decorations%rowtype;
  v_visible integer;
  v_exists boolean;
begin
  if p_slot_id not in ('deco-top-left', 'deco-top-right', 'deco-bottom-left', 'deco-bottom-right') then
    raise exception 'このレイアウトには使えない位置です' using errcode = 'P0001';
  end if;
  if p_mode not in ('inherit', 'replace', 'hidden') then
    raise exception '未対応の表示です' using errcode = 'P0001';
  end if;
  if p_user_decoration_id is not null
    and p_user_decoration_id not in ('paw', 'heart', 'star', 'tape', 'leaf', 'flower', 'spark') then
    raise exception '未対応の装飾です' using errcode = 'P0001';
  end if;
  if p_user_scale_preset is not null and p_user_scale_preset not in ('small', 'medium') then
    raise exception '未対応の装飾です' using errcode = 'P0001';
  end if;

  select * into v_row
    from public.album_draft_decorations
   where draft_spread_id = p_spread_id
     and slot_id = p_slot_id;
  v_exists := found;

  if p_mode <> 'hidden' and (
    (p_mode = 'replace' and p_user_decoration_id is not null)
    or (p_mode = 'inherit' and v_exists and v_row.ai_decoration_id is not null)
  ) then
    select count(*) into v_visible
      from public.album_draft_decorations d
     where d.draft_spread_id = p_spread_id
       and d.slot_id is distinct from p_slot_id
       and d.override_mode <> 'hidden'
       and (
         (d.override_mode = 'replace' and d.user_decoration_id is not null)
         or (d.override_mode = 'inherit' and d.ai_decoration_id is not null)
       );
    if v_visible >= 3 then
      raise exception '装飾は見開きあたり3つまでです' using errcode = 'P0001';
    end if;
  end if;

  if not v_exists then
    insert into public.album_draft_decorations (
      draft_spread_id, slot_id, ai_decoration_id, user_decoration_id, ai_scale_preset, user_scale_preset, override_mode, client_seq
    ) values (
      p_spread_id, p_slot_id, null, p_user_decoration_id, 'small', p_user_scale_preset, p_mode, p_client_seq
    )
    returning * into v_updated;
  else
    update public.album_draft_decorations
       set user_decoration_id = p_user_decoration_id,
           user_scale_preset = p_user_scale_preset,
           override_mode = p_mode,
           client_seq = p_client_seq,
           revision = revision + 1
     where id = v_row.id
       and (
         client_seq < p_client_seq
         or (client_seq = p_client_seq and revision = p_expected_revision)
       )
    returning * into v_updated;
    if not found then
      if v_row.client_seq > p_client_seq then
        return jsonb_build_object('status', 'stale', 'revision', v_row.revision, 'clientSeq', v_row.client_seq);
      end if;
      return jsonb_build_object('status', 'conflict', 'revision', v_row.revision, 'clientSeq', v_row.client_seq);
    end if;
  end if;

  update public.album_draft_versions
     set status = case when status = 'ready' then 'editing' else status end,
         revision = revision + 1
   where id = (
     select s.draft_version_id from public.album_draft_spreads s where s.id = p_spread_id
   );

  return jsonb_build_object('status', 'applied', 'revision', v_updated.revision, 'clientSeq', v_updated.client_seq);
end;
$$;

alter table public.album_draft_text_elements enable row level security;
alter table public.album_draft_decorations enable row level security;

create policy "album_draft_text_elements: owner select"
  on public.album_draft_text_elements for select
  using (
    exists (
      select 1
        from public.album_draft_spreads s
        join public.album_draft_versions v on v.id = s.draft_version_id
        join public.albums a on a.id = v.album_id
       where s.id = album_draft_text_elements.draft_spread_id
         and a.owner_user_id = (select auth.uid())
    )
  );

create policy "album_draft_text_elements: owner insert"
  on public.album_draft_text_elements for insert
  with check (
    exists (
      select 1
        from public.album_draft_spreads s
        join public.album_draft_versions v on v.id = s.draft_version_id
        join public.albums a on a.id = v.album_id
       where s.id = album_draft_text_elements.draft_spread_id
         and a.owner_user_id = (select auth.uid())
    )
  );

create policy "album_draft_text_elements: owner update"
  on public.album_draft_text_elements for update
  using (
    exists (
      select 1
        from public.album_draft_spreads s
        join public.album_draft_versions v on v.id = s.draft_version_id
        join public.albums a on a.id = v.album_id
       where s.id = album_draft_text_elements.draft_spread_id
         and a.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
        from public.album_draft_spreads s
        join public.album_draft_versions v on v.id = s.draft_version_id
        join public.albums a on a.id = v.album_id
       where s.id = album_draft_text_elements.draft_spread_id
         and a.owner_user_id = (select auth.uid())
    )
  );

create policy "album_draft_decorations: owner select"
  on public.album_draft_decorations for select
  using (
    exists (
      select 1
        from public.album_draft_spreads s
        join public.album_draft_versions v on v.id = s.draft_version_id
        join public.albums a on a.id = v.album_id
       where s.id = album_draft_decorations.draft_spread_id
         and a.owner_user_id = (select auth.uid())
    )
  );

create policy "album_draft_decorations: owner insert"
  on public.album_draft_decorations for insert
  with check (
    exists (
      select 1
        from public.album_draft_spreads s
        join public.album_draft_versions v on v.id = s.draft_version_id
        join public.albums a on a.id = v.album_id
       where s.id = album_draft_decorations.draft_spread_id
         and a.owner_user_id = (select auth.uid())
    )
  );

create policy "album_draft_decorations: owner update"
  on public.album_draft_decorations for update
  using (
    exists (
      select 1
        from public.album_draft_spreads s
        join public.album_draft_versions v on v.id = s.draft_version_id
        join public.albums a on a.id = v.album_id
       where s.id = album_draft_decorations.draft_spread_id
         and a.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
        from public.album_draft_spreads s
        join public.album_draft_versions v on v.id = s.draft_version_id
        join public.albums a on a.id = v.album_id
       where s.id = album_draft_decorations.draft_spread_id
         and a.owner_user_id = (select auth.uid())
    )
  );

grant select, insert, update on public.album_draft_text_elements to authenticated;
grant select, insert, update on public.album_draft_decorations to authenticated;

revoke all on function public.apply_draft_text_override(uuid, text, text, integer, bigint, text, text, text) from public, anon, service_role;
grant execute on function public.apply_draft_text_override(uuid, text, text, integer, bigint, text, text, text) to authenticated;

revoke all on function public.apply_draft_decoration_override(uuid, text, integer, bigint, text, text, text) from public, anon, service_role;
grant execute on function public.apply_draft_decoration_override(uuid, text, integer, bigint, text, text, text) to authenticated;

commit;
