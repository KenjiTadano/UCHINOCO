-- Task063: cached caption suggestions for a draft spread.
-- Separate from photo_analysis_results. Does not store spread prose on a photo.
-- ai_text may be filled once, while it is still null. A later change is still rejected.

begin;

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
    (new.ai_text is distinct from old.ai_text and old.ai_text is not null)
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

create table public.album_text_suggestions (
  id uuid primary key default gen_random_uuid(),
  draft_spread_id uuid not null references public.album_draft_spreads(id) on delete cascade,
  kind text not null check (kind in ('title', 'caption')),
  analysis_version text not null,
  input_fingerprint text not null,
  suggestions jsonb not null,
  created_at timestamptz not null default now(),
  constraint album_text_suggestions_uniq unique (draft_spread_id, kind, analysis_version, input_fingerprint)
);

alter table public.album_text_suggestions enable row level security;

create policy "album_text_suggestions: owner select"
  on public.album_text_suggestions for select
  using (
    exists (
      select 1
        from public.album_draft_spreads s
        join public.album_draft_versions v on v.id = s.draft_version_id
        join public.albums a on a.id = v.album_id
       where s.id = album_text_suggestions.draft_spread_id
         and a.owner_user_id = (select auth.uid())
    )
  );

revoke all on public.album_text_suggestions from public, anon;
grant select on public.album_text_suggestions to authenticated;

create or replace function public.save_album_text_suggestion(
  p_spread_id uuid,
  p_kind text,
  p_analysis_version text,
  p_input_fingerprint text,
  p_suggestions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_album_status text;
  v_version_status text;
  v_id uuid;
begin
  if p_kind not in ('title', 'caption') then
    raise exception '未対応の文字です' using errcode = 'P0001';
  end if;
  if p_analysis_version is null or length(p_analysis_version) = 0 or length(p_analysis_version) > 80 then
    raise exception '未対応の文字です' using errcode = 'P0001';
  end if;
  if p_input_fingerprint is null or length(p_input_fingerprint) = 0 or length(p_input_fingerprint) > 800 then
    raise exception '未対応の文字です' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_suggestions) <> 'array'
    or jsonb_array_length(p_suggestions) < 1
    or jsonb_array_length(p_suggestions) > 3 then
    raise exception '候補の数が不正です' using errcode = 'P0001';
  end if;

  select a.owner_user_id, a.status, v.status
    into v_owner, v_album_status, v_version_status
    from public.album_draft_spreads s
    join public.album_draft_versions v on v.id = s.draft_version_id
    join public.albums a on a.id = v.album_id
   where s.id = p_spread_id;

  if v_owner is null or v_owner is distinct from (select auth.uid()) then
    raise exception 'このアルバムは変更できません' using errcode = 'P0001';
  end if;
  if v_album_status = 'ordered' or v_version_status = 'locked' then
    raise exception 'このアルバムは注文済みのため変更できません' using errcode = 'P0001';
  end if;

  insert into public.album_text_suggestions (
    draft_spread_id, kind, analysis_version, input_fingerprint, suggestions
  ) values (
    p_spread_id, p_kind, p_analysis_version, p_input_fingerprint, p_suggestions
  )
  on conflict (draft_spread_id, kind, analysis_version, input_fingerprint) do nothing
  returning id into v_id;

  return jsonb_build_object('id', v_id);
end;
$$;

create or replace function public.seed_draft_text_ai(
  p_spread_id uuid,
  p_slot_id text,
  p_kind text,
  p_ai_text text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_row public.album_draft_text_elements%rowtype;
begin
  if (p_slot_id in ('top-left', 'top-center') and p_kind <> 'title')
    or (p_slot_id in ('bottom-left', 'bottom-center', 'gutter-note') and p_kind <> 'caption')
    or (p_slot_id = 'margin-note' and p_kind <> 'date')
    or p_slot_id not in ('top-left', 'top-center', 'bottom-left', 'bottom-center', 'margin-note', 'gutter-note') then
    raise exception 'このレイアウトには使えない位置です' using errcode = 'P0001';
  end if;
  if p_ai_text is null or char_length(p_ai_text) = 0 or p_ai_text ~ '[<>]' or p_ai_text ~ E'[\n\r]' then
    raise exception 'テキストはプレーンテキストのみです' using errcode = 'P0001';
  end if;
  if (p_kind = 'title' and char_length(p_ai_text) > 24)
    or (p_kind = 'caption' and char_length(p_ai_text) > 60)
    or (p_kind = 'date' and char_length(p_ai_text) > 24) then
    raise exception '文字数が上限を超えています' using errcode = 'P0001';
  end if;

  select a.owner_user_id into v_owner
    from public.album_draft_spreads s
    join public.album_draft_versions v on v.id = s.draft_version_id
    join public.albums a on a.id = v.album_id
   where s.id = p_spread_id;

  if v_owner is null or v_owner is distinct from (select auth.uid()) then
    raise exception 'このアルバムは変更できません' using errcode = 'P0001';
  end if;

  select * into v_row
    from public.album_draft_text_elements
   where draft_spread_id = p_spread_id
     and slot_id = p_slot_id;

  if found and v_row.ai_text is not null then
    return jsonb_build_object('status', 'kept');
  end if;

  if not found then
    insert into public.album_draft_text_elements (
      draft_spread_id, slot_id, kind, ai_text, ai_style_id, user_text, user_style_id, override_mode, client_seq
    ) values (
      p_spread_id, p_slot_id, p_kind, p_ai_text, 'editorial', null, null, 'inherit', 0
    );
    return jsonb_build_object('status', 'seeded');
  end if;

  update public.album_draft_text_elements
     set ai_text = p_ai_text
   where id = v_row.id
     and ai_text is null;
  return jsonb_build_object('status', 'seeded');
end;
$$;

revoke all on function public.save_album_text_suggestion(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.save_album_text_suggestion(uuid, text, text, text, jsonb) to authenticated;

revoke all on function public.seed_draft_text_ai(uuid, text, text, text) from public, anon;
grant execute on function public.seed_draft_text_ai(uuid, text, text, text) to authenticated;

commit;
