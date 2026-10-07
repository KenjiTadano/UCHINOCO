-- Task065.1: clone the active draft and apply one local placement atomically.
-- This migration is intentionally replaceable while it remains unapplied remotely.

begin;

alter table public.album_analytics_events drop constraint if exists album_analytics_events_event_type_check;
alter table public.album_analytics_events add constraint album_analytics_events_event_type_check check (event_type in (
  'album_generated', 'album_viewed', 'album_accepted', 'album_edit_started',
  'album_layout_changed', 'album_crop_changed', 'album_photo_swapped',
  'album_text_changed', 'album_decoration_changed', 'album_background_changed',
  'album_regenerated', 'print_preview_opened', 'checkout_started',
  'decoration_recommendation_shown', 'decoration_previewed', 'decoration_applied',
  'decoration_rejected', 'decoration_reset', 'new_photos_suggested',
  'new_photos_reviewed', 'new_photos_added', 'new_photos_dismissed',
  'new_photo_placement_previewed', 'new_photo_placement_applied',
  'new_photo_placement_alternative', 'new_photo_placement_skipped'
));

create or replace function public.apply_added_photo_placement(
  p_album_id uuid,
  p_route_pet_id uuid,
  p_expected_draft_version_id uuid,
  p_expected_fingerprint text,
  p_photo_id uuid,
  p_mode text,
  p_anchor_spread_id uuid,
  p_layout_id text,
  p_frame_id text,
  p_crop_x numeric,
  p_crop_y numeric,
  p_crop_scale numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_album public.albums%rowtype;
  v_old public.album_draft_versions%rowtype;
  v_current public.album_draft_versions%rowtype;
  v_new_version_id uuid;
  v_spread record;
  v_frame record;
  v_element record;
  v_new_spread_id uuid;
  v_anchor_position integer;
  v_new_position integer;
  v_frame_index integer;
  v_expected text;
  v_story_id text := 'task065:' || p_photo_id::text;
  v_new_element_id uuid;
  v_event_key text;
begin
  if v_user is null
     or p_mode not in ('EXISTING_SPREAD','INSERT_AFTER','APPEND')
     or p_expected_fingerprint !~ '^[0-9a-f]{64}$'
     or p_layout_id not in ('L01','L01b','L06','L07')
     or p_crop_x < 0 or p_crop_x > 1 or p_crop_y < 0 or p_crop_y > 1
     or p_crop_scale < 1 or p_crop_scale > 4 then
    raise exception 'invalid placement' using errcode = 'P0001';
  end if;
  if (p_mode = 'EXISTING_SPREAD' and (p_anchor_spread_id is null or p_layout_id not in ('L06','L07')))
     or (p_mode = 'INSERT_AFTER' and p_anchor_spread_id is null)
     or (p_mode = 'APPEND' and p_anchor_spread_id is not null)
     or (p_layout_id = 'L01' and p_frame_id <> 'L01-hero')
     or (p_layout_id = 'L01b' and p_frame_id <> 'L01b-hero')
     or (p_layout_id = 'L06' and p_frame_id <> 'L06-c')
     or (p_layout_id = 'L07' and p_frame_id <> 'L07-d') then
    raise exception 'invalid placement mode' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('album-placement:' || p_album_id::text, 0));

  select * into v_album from public.albums
   where id = p_album_id and pet_id = p_route_pet_id and owner_user_id = v_user for update;
  if not found or v_album.status <> 'draft' then
    raise exception 'album is protected' using errcode = 'P0001';
  end if;

  select * into v_current from public.album_draft_versions
   where album_id = p_album_id and is_active for update;
  if not found then raise exception 'draft not found' using errcode = 'P0001'; end if;

  -- A repeated request after a successful commit returns the already-created version.
  if v_current.generation_metadata->>'placement_fingerprint' = p_expected_fingerprint
     and v_current.generation_metadata->>'placement_parent_version_id' = p_expected_draft_version_id::text then
    return jsonb_build_object('applied',false,'reused',true,'version_id',v_current.id,
      'parent_version_id',p_expected_draft_version_id,'mode',v_current.generation_metadata->>'placement_mode');
  end if;

  if v_current.id <> p_expected_draft_version_id or v_current.status = 'locked' then
    raise exception 'stale draft version' using errcode = 'P0001';
  end if;
  v_old := v_current;

  if exists(select 1 from public.album_analytics_events where album_id=p_album_id and event_type='album_accepted')
     or exists(select 1 from public.orders where album_id=p_album_id and status in ('pending','paid'))
     or exists(select 1 from public.album_print_snapshots where album_id=p_album_id and finalized_at is not null) then
    raise exception 'album is protected' using errcode='P0001';
  end if;

  if not exists (
    select 1 from public.album_photos ap join public.photos p on p.id=ap.photo_id
    where ap.album_id=p_album_id and ap.photo_id=p_photo_id and p.uploader_user_id=v_user
      and (p.pet_id=v_album.pet_id or exists(select 1 from public.album_pets x where x.album_id=p_album_id and x.pet_id=p.pet_id))
  ) then raise exception 'photo out of scope' using errcode='P0001'; end if;
  if exists(select 1 from public.album_draft_frames f join public.album_draft_spreads s on s.id=f.draft_spread_id
    where s.draft_version_id=v_old.id and coalesce(f.user_photo_id,f.ai_photo_id)=p_photo_id) then
    raise exception 'photo already placed' using errcode='P0001';
  end if;

  v_expected := encode(extensions.digest(convert_to(
    p_album_id::text || '|' || v_old.id::text || '|' || p_photo_id::text || '|' || p_mode || '|' ||
    coalesce(p_anchor_spread_id::text,'') || '|' || p_layout_id, 'UTF8'), 'sha256'), 'hex');
  if v_expected <> p_expected_fingerprint then
    raise exception 'stale placement candidate' using errcode='P0001';
  end if;

  if p_anchor_spread_id is not null then
    select position into v_anchor_position from public.album_draft_spreads
     where id=p_anchor_spread_id and draft_version_id=v_old.id;
    if not found then raise exception 'placement anchor not found' using errcode='P0001'; end if;
  end if;

  if p_mode = 'EXISTING_SPREAD' then
    if not exists (
      select 1 from public.album_draft_spreads s
       where s.id=p_anchor_spread_id and s.draft_version_id=v_old.id
         and s.user_layout_id is null and s.revision=1
         and (select count(*) from public.album_draft_frames f where f.draft_spread_id=s.id)=3
         and not exists(select 1 from public.album_draft_frames f where f.draft_spread_id=s.id and
           (f.user_photo_id is not null or f.user_crop_x is not null or f.user_crop_y is not null or f.user_crop_scale is not null or f.revision<>1))
         and not exists(select 1 from public.album_draft_text_elements t where t.draft_spread_id=s.id and t.override_mode<>'inherit')
         and not exists(select 1 from public.album_draft_decorations d where d.draft_spread_id=s.id and d.override_mode<>'inherit')
         and not exists(select 1 from public.album_draft_page_elements e where e.draft_spread_id=s.id and not e.is_deleted)
         and not exists(select 1 from public.album_draft_spread_backgrounds b where b.draft_spread_id=s.id and b.background_id is not null)
    ) then raise exception 'spread is edited or incompatible' using errcode='P0001'; end if;
  end if;

  update public.album_draft_versions set is_active=false where id=v_old.id;
  insert into public.album_draft_versions(album_id,generation_version,status,is_active,revision,generation_metadata)
  values(p_album_id,v_old.generation_version,'editing',true,v_old.revision+1,
    v_old.generation_metadata || jsonb_build_object(
      'placement_parent_version_id',v_old.id,
      'placement_fingerprint',p_expected_fingerprint,
      'placement_photo_id',p_photo_id,
      'placement_mode',p_mode,
      'placement_anchor_spread_id',p_anchor_spread_id,
      'placement_layout_id',p_layout_id,
      'materialized_local_placement',true
    )) returning id into v_new_version_id;

  for v_spread in select * from public.album_draft_spreads where draft_version_id=v_old.id order by position loop
    v_new_position := v_spread.position + case when p_mode='INSERT_AFTER' and v_spread.position>v_anchor_position then 1 else 0 end;
    insert into public.album_draft_spreads(draft_version_id,story_spread_id,position,story_type,recommended_density,
      importance,coherence,ai_layout_id,user_layout_id,warnings,revision,client_seq)
    values(v_new_version_id,v_spread.story_spread_id,v_new_position,v_spread.story_type,v_spread.recommended_density,
      v_spread.importance,v_spread.coherence,
      case when p_mode='EXISTING_SPREAD' and v_spread.id=p_anchor_spread_id then p_layout_id else v_spread.ai_layout_id end,
      v_spread.user_layout_id,v_spread.warnings,v_spread.revision,v_spread.client_seq)
    returning id into v_new_spread_id;

    v_frame_index := 0;
    for v_frame in select * from public.album_draft_frames where draft_spread_id=v_spread.id order by position loop
      insert into public.album_draft_frames(draft_spread_id,frame_id,role,position,ai_photo_id,ai_crop_x,ai_crop_y,ai_crop_scale,
        user_photo_id,user_crop_x,user_crop_y,user_crop_scale,match_tier,crop_quality,warnings,revision,client_seq)
      values(v_new_spread_id,
        case when p_mode='EXISTING_SPREAD' and v_spread.id=p_anchor_spread_id then
          case when p_layout_id='L06' then (array['L06-hero','L06-a','L06-b'])[v_frame_index+1]
               else (array['L07-a','L07-b','L07-c'])[v_frame_index+1] end
          else v_frame.frame_id end,
        v_frame.role,v_frame_index,v_frame.ai_photo_id,v_frame.ai_crop_x,v_frame.ai_crop_y,v_frame.ai_crop_scale,
        v_frame.user_photo_id,v_frame.user_crop_x,v_frame.user_crop_y,v_frame.user_crop_scale,v_frame.match_tier,
        v_frame.crop_quality,v_frame.warnings,v_frame.revision,v_frame.client_seq);
      v_frame_index := v_frame_index + 1;
    end loop;

    if p_mode='EXISTING_SPREAD' and v_spread.id=p_anchor_spread_id then
      insert into public.album_draft_frames(draft_spread_id,frame_id,role,position,ai_photo_id,ai_crop_x,ai_crop_y,ai_crop_scale,match_tier,warnings)
      values(v_new_spread_id,p_frame_id,case when p_layout_id='L06' then 'detail' else 'primary' end,3,p_photo_id,
        p_crop_x,p_crop_y,p_crop_scale,'fallback','["STORED_ANALYSIS_ONLY"]'::jsonb);
    end if;

    insert into public.album_draft_text_elements(draft_spread_id,slot_id,kind,ai_text,user_text,ai_style_id,user_style_id,override_mode,position,revision,client_seq)
      select v_new_spread_id,slot_id,kind,ai_text,user_text,ai_style_id,user_style_id,override_mode,position,revision,client_seq
      from public.album_draft_text_elements where draft_spread_id=v_spread.id;
    insert into public.album_draft_decorations(draft_spread_id,slot_id,ai_decoration_id,user_decoration_id,ai_scale_preset,user_scale_preset,override_mode,position,revision,client_seq)
      select v_new_spread_id,slot_id,ai_decoration_id,user_decoration_id,ai_scale_preset,user_scale_preset,override_mode,position,revision,client_seq
      from public.album_draft_decorations where draft_spread_id=v_spread.id;
    insert into public.album_draft_spread_backgrounds(draft_spread_id,page_side,background_id,revision,client_seq)
      select v_new_spread_id,page_side,background_id,revision,client_seq from public.album_draft_spread_backgrounds where draft_spread_id=v_spread.id;
    for v_element in select * from public.album_draft_page_elements where draft_spread_id=v_spread.id loop
      v_new_element_id := gen_random_uuid();
      insert into public.album_draft_page_elements(id,draft_spread_id,element_type,element_data,is_deleted,revision,client_seq)
      values(v_new_element_id,v_new_spread_id,v_element.element_type,
        jsonb_set(v_element.element_data,'{id}',to_jsonb(v_new_element_id::text),true),v_element.is_deleted,v_element.revision,v_element.client_seq);
    end loop;
  end loop;

  if p_mode in ('INSERT_AFTER','APPEND') then
    if p_mode='APPEND' then
      select coalesce(max(position),-1)+1 into v_new_position from public.album_draft_spreads where draft_version_id=v_new_version_id;
    else v_new_position := v_anchor_position+1; end if;
    insert into public.album_draft_spreads(draft_version_id,story_spread_id,position,story_type,recommended_density,importance,coherence,ai_layout_id,warnings)
    values(v_new_version_id,v_story_id,v_new_position,'everyday','quiet',50,1,p_layout_id,
      jsonb_build_array('TASK065_LOCAL_PLACEMENT',case when p_mode='INSERT_AFTER' then 'INSERT_AFTER' else 'APPEND' end))
    returning id into v_new_spread_id;
    insert into public.album_draft_frames(draft_spread_id,frame_id,role,position,ai_photo_id,ai_crop_x,ai_crop_y,ai_crop_scale,match_tier,warnings)
    values(v_new_spread_id,p_frame_id,'hero',0,p_photo_id,p_crop_x,p_crop_y,p_crop_scale,'fallback','["STORED_ANALYSIS_ONLY"]'::jsonb);
  end if;

  insert into public.album_draft_covers(draft_version_id,cover_type,ai_photo_id,user_photo_id,ai_title,user_title,ai_subtitle,user_subtitle,
    ai_template_id,user_template_id,ai_color_id,user_color_id,revision,client_seq)
  select v_new_version_id,cover_type,ai_photo_id,user_photo_id,ai_title,user_title,ai_subtitle,user_subtitle,
    ai_template_id,user_template_id,ai_color_id,user_color_id,revision,client_seq
  from public.album_draft_covers where draft_version_id=v_old.id;

  v_event_key := encode(extensions.digest(convert_to(p_album_id::text||'|'||p_expected_fingerprint,'UTF8'),'sha256'),'hex');
  insert into public.album_analytics_events(user_id,album_id,draft_version_id,event_type,event_key,event_data)
  values(v_user,p_album_id,v_new_version_id,'new_photo_placement_applied',v_event_key,
    jsonb_build_object('photo_count',1,'spread_count',case when p_mode='EXISTING_SPREAD' then 0 else 1 end))
  on conflict do nothing;
  return jsonb_build_object('applied',true,'reused',false,'version_id',v_new_version_id,
    'parent_version_id',v_old.id,'mode',p_mode,'spread_id',v_new_spread_id);
end;
$$;

create or replace function public.undo_added_photo_placement(
  p_album_id uuid, p_route_pet_id uuid, p_placement_version_id uuid, p_parent_version_id uuid
)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_current public.album_draft_versions%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('album-placement:'||p_album_id::text,0));
  if not exists(select 1 from public.albums where id=p_album_id and pet_id=p_route_pet_id and owner_user_id=v_user and status='draft')
    or exists(select 1 from public.album_analytics_events where album_id=p_album_id and event_type='album_accepted')
    or exists(select 1 from public.orders where album_id=p_album_id and status in ('pending','paid'))
    or exists(select 1 from public.album_print_snapshots where album_id=p_album_id and finalized_at is not null) then
    raise exception 'album is protected' using errcode='P0001'; end if;
  select * into v_current from public.album_draft_versions where id=p_placement_version_id and album_id=p_album_id and is_active for update;
  if not found or v_current.status='locked' or v_current.generation_metadata->>'placement_parent_version_id'<>p_parent_version_id::text then
    raise exception 'stale placement version' using errcode='P0001'; end if;
  if not exists(select 1 from public.album_draft_versions where id=p_parent_version_id and album_id=p_album_id and status<>'locked') then
    raise exception 'parent draft missing' using errcode='P0001'; end if;
  update public.album_draft_versions set is_active=false where id=p_placement_version_id;
  update public.album_draft_versions set is_active=true where id=p_parent_version_id;
  return true;
end; $$;

create or replace function public.redo_added_photo_placement(
  p_album_id uuid, p_route_pet_id uuid, p_placement_version_id uuid, p_parent_version_id uuid
)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_user uuid := (select auth.uid()); v_current public.album_draft_versions%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('album-placement:'||p_album_id::text,0));
  if not exists(select 1 from public.albums where id=p_album_id and pet_id=p_route_pet_id and owner_user_id=v_user and status='draft')
    or exists(select 1 from public.album_analytics_events where album_id=p_album_id and event_type='album_accepted')
    or exists(select 1 from public.orders where album_id=p_album_id and status in ('pending','paid'))
    or exists(select 1 from public.album_print_snapshots where album_id=p_album_id and finalized_at is not null) then
    raise exception 'album is protected' using errcode='P0001'; end if;
  select * into v_current from public.album_draft_versions where id=p_parent_version_id and album_id=p_album_id and is_active for update;
  if not found or v_current.status='locked' then raise exception 'stale parent version' using errcode='P0001'; end if;
  if not exists(select 1 from public.album_draft_versions where id=p_placement_version_id and album_id=p_album_id and status<>'locked'
    and generation_metadata->>'placement_parent_version_id'=p_parent_version_id::text) then
    raise exception 'placement version missing' using errcode='P0001'; end if;
  update public.album_draft_versions set is_active=false where id=p_parent_version_id;
  update public.album_draft_versions set is_active=true where id=p_placement_version_id;
  return true;
end; $$;

revoke all on function public.apply_added_photo_placement(uuid,uuid,uuid,text,uuid,text,uuid,text,text,numeric,numeric,numeric) from public,anon,service_role;
grant execute on function public.apply_added_photo_placement(uuid,uuid,uuid,text,uuid,text,uuid,text,text,numeric,numeric,numeric) to authenticated;
revoke all on function public.undo_added_photo_placement(uuid,uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.undo_added_photo_placement(uuid,uuid,uuid,uuid) to authenticated;
revoke all on function public.redo_added_photo_placement(uuid,uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.redo_added_photo_placement(uuid,uuid,uuid,uuid) to authenticated;

commit;
