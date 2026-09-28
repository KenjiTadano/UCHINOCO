-- Task058: the shared guard must not read NEW.status on spreads or frames.
-- Those tables have no status column.

begin;

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

  if tg_table_name = 'album_draft_versions' and tg_op = 'UPDATE' and v_album_status = 'ordered' then
    if new.status = 'locked'
       and old.generation_metadata = new.generation_metadata
       and old.is_active = new.is_active
       and old.album_id = new.album_id
       and old.generation_version = new.generation_version
       and old.revision = new.revision
    then
      return new;
    end if;
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

commit;
