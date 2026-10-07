-- Task063.1: atomically materialize a passive album candidate.
-- Candidate preparation stays row-free; the first explicit open creates all
-- album state in this single transaction. Any exception rolls everything back.

begin;

create or replace function public.materialize_passive_album_candidate(
  p_album_id uuid,
  p_pet_id uuid,
  p_candidate_fingerprint text,
  p_title text,
  p_period_from timestamptz,
  p_period_to timestamptz,
  p_candidate_photo_ids uuid[],
  p_selected_photo_ids uuid[],
  p_cover_photo_id uuid,
  p_payload jsonb,
  p_cover_title text,
  p_cover_subtitle text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_hash text;
  v_expected_album_id uuid;
  v_current_photo_ids uuid[];
  v_payload_photo_ids uuid[];
  v_metadata_photo_ids uuid[];
  v_existing public.albums%rowtype;
  v_active public.album_draft_versions%rowtype;
  v_draft_id uuid;
  v_photo_id uuid;
  v_position integer;
  v_fail_stage text := nullif(current_setting('uchinoco.test_materialize_failure_stage', true), '');
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = 'P0001';
  end if;
  if p_candidate_fingerprint !~ '^[0-9a-f]{64}$'
     or p_period_from is null
     or p_period_to is null
     or p_period_from >= p_period_to
     or cardinality(p_candidate_photo_ids) < 12
     or cardinality(p_selected_photo_ids) = 0 then
    raise exception 'invalid candidate' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.pets p
     where p.id = p_pet_id and p.owner_user_id = v_user_id
  ) then
    raise exception 'not found' using errcode = 'P0001';
  end if;

  -- Must stay byte-for-byte compatible with passiveCandidateAlbumId().
  v_hash := encode(extensions.digest(convert_to('uchinoco-passive-album:' || p_candidate_fingerprint, 'UTF8'), 'sha256'), 'hex');
  v_expected_album_id := (
    substr(v_hash, 1, 8) || '-' || substr(v_hash, 9, 4) || '-5' || substr(v_hash, 14, 3) || '-a' || substr(v_hash, 18, 3) || '-' || substr(v_hash, 21, 12)
  )::uuid;
  if p_album_id <> v_expected_album_id then
    raise exception 'invalid candidate identity' using errcode = 'P0001';
  end if;

  if p_payload->'metadata'->>'passive_candidate_version' <> 'passive-album-candidate-v1'
     or p_payload->'metadata'->>'passive_candidate_fingerprint' <> p_candidate_fingerprint
     or coalesce((p_payload->'metadata'->>'materialized_on_open')::boolean, false) is not true
     or (p_payload->'metadata'->'passive_candidate_period'->>'start')::timestamptz <> p_period_from
     or (p_payload->'metadata'->'passive_candidate_period'->>'end')::timestamptz <> p_period_to then
    raise exception 'candidate metadata mismatch' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(value::uuid order by value::uuid), '{}'::uuid[])
    into v_metadata_photo_ids
    from jsonb_array_elements_text(p_payload->'metadata'->'passive_candidate_photo_ids');
  if v_metadata_photo_ids <> (select array_agg(id order by id) from unnest(p_candidate_photo_ids) as u(id))
     or p_payload->'metadata'->'composition'->>'version' <> 'album-rhythm-v2'
     or nullif(p_payload->'metadata'->>'album_draft_version', '') is null then
    raise exception 'candidate metadata mismatch' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('passive-album:' || p_candidate_fingerprint, 0));

  select * into v_existing from public.albums where id = p_album_id;
  if found then
    if v_existing.owner_user_id <> v_user_id or v_existing.pet_id <> p_pet_id then
      raise exception 'not found' using errcode = 'P0001';
    end if;
    select * into v_active
      from public.album_draft_versions
     where album_id = p_album_id and is_active;
    if found and v_active.generation_metadata->>'passive_candidate_fingerprint' = p_candidate_fingerprint then
      return jsonb_build_object('album_id', p_album_id, 'draft_version_id', v_active.id, 'reused', true);
    end if;
    raise exception 'existing album is protected' using errcode = 'P0001';
  end if;

  -- Re-read the exact period in the transaction. A newly uploaded/deleted photo
  -- makes the browser Candidate stale and must not create a Draft.
  select coalesce(array_agg(p.id order by p.id), '{}'::uuid[])
    into v_current_photo_ids
    from public.photos p
   where p.pet_id = p_pet_id
     and p.uploader_user_id = v_user_id
     and p.timeline_at >= p_period_from
     and p.timeline_at < p_period_to;
  if v_current_photo_ids <> (select array_agg(id order by id) from unnest(p_candidate_photo_ids) as u(id))
     or cardinality(p_candidate_photo_ids) <> (select count(distinct id) from unnest(p_candidate_photo_ids) as u(id)) then
    raise exception 'stale candidate' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.albums a
     where a.owner_user_id = v_user_id
       and a.pet_id = p_pet_id
       and a.id <> p_album_id
       and a.period_from < p_period_to
       and a.period_to >= p_period_from
       and (
         a.status in ('ready', 'ordered')
         or exists (select 1 from public.album_draft_versions d where d.album_id = a.id and d.is_active and d.status = 'editing')
         or exists (select 1 from public.album_analytics_events e where e.album_id = a.id and e.event_type in ('album_accepted', 'album_edit_started', 'album_layout_changed', 'album_crop_changed', 'album_photo_swapped', 'album_text_changed', 'album_decoration_changed', 'album_background_changed'))
         or exists (select 1 from public.album_print_snapshots s where s.album_id = a.id and s.finalized_at is not null)
       )
  ) then
    raise exception 'existing album is protected' using errcode = 'P0001';
  end if;

  if cardinality(p_selected_photo_ids) <> (select count(distinct id) from unnest(p_selected_photo_ids) as u(id))
     or not (p_selected_photo_ids <@ p_candidate_photo_ids)
     or (p_cover_photo_id is not null and not p_cover_photo_id = any(p_selected_photo_ids)) then
    raise exception 'invalid selected photos' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(distinct (frame->>'aiPhotoId')::uuid order by (frame->>'aiPhotoId')::uuid), '{}'::uuid[])
    into v_payload_photo_ids
    from jsonb_array_elements(p_payload->'spreads') spread,
         jsonb_array_elements(spread->'frames') frame;
  if v_payload_photo_ids <> (select array_agg(id order by id) from unnest(p_selected_photo_ids) as u(id)) then
    raise exception 'draft photo mismatch' using errcode = 'P0001';
  end if;

  insert into public.albums (id, owner_user_id, pet_id, title, status, period_from, period_to, cover_photo_id)
  values (p_album_id, v_user_id, p_pet_id, left(trim(p_title), 120), 'draft', p_period_from, p_period_to, p_cover_photo_id);
  if v_fail_stage = 'after_album' then raise exception 'test failure after album' using errcode = 'P0001'; end if;

  v_position := 0;
  foreach v_photo_id in array p_selected_photo_ids loop
    insert into public.album_photos (album_id, photo_id, position, selected_by)
    values (p_album_id, v_photo_id, v_position, 'ai');
    v_position := v_position + 1;
  end loop;
  if v_fail_stage = 'after_photos' then raise exception 'test failure after photos' using errcode = 'P0001'; end if;

  v_draft_id := public.save_album_draft_version(p_album_id, p_payload);
  if v_draft_id is null then raise exception 'draft save failed' using errcode = 'P0001'; end if;
  if v_fail_stage = 'after_draft' then raise exception 'test failure after draft' using errcode = 'P0001'; end if;

  insert into public.album_draft_covers (
    draft_version_id, cover_type, ai_photo_id, ai_title, ai_subtitle, ai_template_id, ai_color_id
  ) values (
    v_draft_id, 'front', p_cover_photo_id, left(trim(p_cover_title), 120), left(trim(p_cover_subtitle), 120), 'simple', 'white'
  );
  if v_fail_stage = 'after_cover' then raise exception 'test failure after cover' using errcode = 'P0001'; end if;

  insert into public.album_analytics_events (
    user_id, album_id, draft_version_id, event_type, event_key, event_data
  ) values (
    v_user_id, p_album_id, v_draft_id, 'album_generated', p_candidate_fingerprint,
    jsonb_build_object('photo_count', cardinality(p_selected_photo_ids), 'pet_count', 1, 'spread_count', jsonb_array_length(p_payload->'spreads'))
  ) on conflict do nothing;

  return jsonb_build_object('album_id', p_album_id, 'draft_version_id', v_draft_id, 'reused', false);
end;
$$;

revoke all on function public.materialize_passive_album_candidate(uuid, uuid, text, text, timestamptz, timestamptz, uuid[], uuid[], uuid, jsonb, text, text) from public, anon, service_role;
grant execute on function public.materialize_passive_album_candidate(uuid, uuid, text, text, timestamptz, timestamptz, uuid[], uuid[], uuid, jsonb, text, text) to authenticated;

commit;
