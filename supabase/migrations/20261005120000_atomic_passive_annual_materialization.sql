-- Task067: materialize a passive annual candidate without touching monthly albums.
begin;

create or replace function public.materialize_passive_annual_candidate(
  p_album_id uuid, p_pet_id uuid, p_candidate_fingerprint text, p_year integer,
  p_title text, p_period_from timestamptz, p_period_to timestamptz,
  p_source_photo_ids uuid[], p_selected_photo_ids uuid[], p_cover_photo_id uuid,
  p_payload jsonb, p_cover_title text, p_cover_subtitle text
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
  v_expected_start timestamptz;
  v_expected_end timestamptz;
  v_current_ids uuid[];
  v_payload_ids uuid[];
  v_draft_id uuid;
  v_photo_id uuid;
  v_position integer := 0;
  v_existing public.albums%rowtype;
  v_active public.album_draft_versions%rowtype;
begin
  if v_user_id is null then raise exception 'not authenticated' using errcode = 'P0001'; end if;
  if p_year < 2000 or p_year > 2200 or p_candidate_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid annual candidate' using errcode = 'P0001';
  end if;
  v_expected_start := make_timestamptz(p_year, 1, 1, 0, 0, 0, 'Asia/Tokyo');
  v_expected_end := make_timestamptz(p_year + 1, 1, 1, 0, 0, 0, 'Asia/Tokyo');
  if p_period_from <> v_expected_start or p_period_to <> v_expected_end
     or cardinality(p_source_photo_ids) < 48 or cardinality(p_selected_photo_ids) = 0 then
    raise exception 'invalid annual period' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.pets p where p.id = p_pet_id and p.owner_user_id = v_user_id) then
    raise exception 'not found' using errcode = 'P0001';
  end if;

  v_hash := encode(extensions.digest(convert_to('uchinoco-passive-annual:' || p_candidate_fingerprint, 'UTF8'), 'sha256'), 'hex');
  v_expected_album_id := (substr(v_hash, 1, 8) || '-' || substr(v_hash, 9, 4) || '-5' || substr(v_hash, 14, 3) || '-b' || substr(v_hash, 18, 3) || '-' || substr(v_hash, 21, 12))::uuid;
  if p_album_id <> v_expected_album_id then raise exception 'invalid annual identity' using errcode = 'P0001'; end if;
  if p_payload->'metadata'->>'annual_candidate_version' <> 'annual-album-candidate-v1'
     or p_payload->'metadata'->>'annual_candidate_fingerprint' <> p_candidate_fingerprint
     or (p_payload->'metadata'->>'annual_candidate_year')::integer <> p_year
     or coalesce((p_payload->'metadata'->>'materialized_on_open')::boolean, false) is not true
     or p_payload->'metadata'->'composition'->>'version' <> 'album-rhythm-v2' then
    raise exception 'annual metadata mismatch' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('passive-annual:' || p_pet_id::text || ':' || p_year::text, 0));
  select * into v_existing from public.albums where id = p_album_id;
  if found then
    if v_existing.owner_user_id <> v_user_id or v_existing.pet_id <> p_pet_id then raise exception 'not found' using errcode = 'P0001'; end if;
    select * into v_active from public.album_draft_versions where album_id = p_album_id and is_active;
    if found and v_active.generation_metadata->>'annual_candidate_fingerprint' = p_candidate_fingerprint then
      return jsonb_build_object('album_id', p_album_id, 'draft_version_id', v_active.id, 'reused', true);
    end if;
    raise exception 'existing annual album is protected' using errcode = 'P0001';
  end if;

  -- Protect a previously materialized annual album for this pet/year. Monthly albums are deliberately ignored.
  if exists (
    select 1 from public.albums a
    join public.album_draft_versions d on d.album_id = a.id and d.is_active
    where a.owner_user_id = v_user_id and a.pet_id = p_pet_id
      and a.period_from = p_period_from and a.period_to = p_period_to
      and d.generation_metadata->>'annual_candidate_version' = 'annual-album-candidate-v1'
  ) then raise exception 'existing annual album is protected' using errcode = 'P0001'; end if;

  select coalesce(array_agg(p.id order by p.id), '{}'::uuid[]) into v_current_ids
  from public.photos p where p.pet_id = p_pet_id and p.uploader_user_id = v_user_id
    and p.timeline_at >= p_period_from and p.timeline_at < p_period_to;
  if v_current_ids <> (select array_agg(id order by id) from unnest(p_source_photo_ids) u(id))
     or cardinality(p_source_photo_ids) <> (select count(distinct id) from unnest(p_source_photo_ids) u(id)) then
    raise exception 'stale annual candidate' using errcode = 'P0001';
  end if;
  if cardinality(p_selected_photo_ids) <> (select count(distinct id) from unnest(p_selected_photo_ids) u(id))
     or not (p_selected_photo_ids <@ p_source_photo_ids)
     or p_cover_photo_id is null or not p_cover_photo_id = any(p_selected_photo_ids) then
    raise exception 'invalid annual selection' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(distinct (frame->>'aiPhotoId')::uuid order by (frame->>'aiPhotoId')::uuid), '{}'::uuid[])
    into v_payload_ids from jsonb_array_elements(p_payload->'spreads') spread, jsonb_array_elements(spread->'frames') frame;
  if v_payload_ids <> (select array_agg(id order by id) from unnest(p_selected_photo_ids) u(id)) then
    raise exception 'annual draft photo mismatch' using errcode = 'P0001';
  end if;

  insert into public.albums (id, owner_user_id, pet_id, title, status, period_from, period_to, cover_photo_id)
  values (p_album_id, v_user_id, p_pet_id, left(trim(p_title), 120), 'draft', p_period_from, p_period_to, p_cover_photo_id);
  foreach v_photo_id in array p_selected_photo_ids loop
    insert into public.album_photos (album_id, photo_id, position, selected_by) values (p_album_id, v_photo_id, v_position, 'ai');
    v_position := v_position + 1;
  end loop;
  v_draft_id := public.save_album_draft_version(p_album_id, p_payload);
  if v_draft_id is null then raise exception 'annual draft save failed' using errcode = 'P0001'; end if;
  insert into public.album_draft_covers (draft_version_id, cover_type, ai_photo_id, ai_title, ai_subtitle, ai_template_id, ai_color_id)
  values (v_draft_id, 'front', p_cover_photo_id, left(trim(p_cover_title), 120), left(trim(p_cover_subtitle), 120), 'simple', 'white');
  insert into public.album_analytics_events (user_id, album_id, draft_version_id, event_type, event_key, event_data)
  values (v_user_id, p_album_id, v_draft_id, 'album_generated', p_candidate_fingerprint,
    jsonb_build_object('photo_count', cardinality(p_selected_photo_ids), 'pet_count', 1, 'spread_count', jsonb_array_length(p_payload->'spreads')))
  on conflict do nothing;
  return jsonb_build_object('album_id', p_album_id, 'draft_version_id', v_draft_id, 'reused', false);
end;
$$;

revoke all on function public.materialize_passive_annual_candidate(uuid, uuid, text, integer, text, timestamptz, timestamptz, uuid[], uuid[], uuid, jsonb, text, text) from public, anon, service_role;
grant execute on function public.materialize_passive_annual_candidate(uuid, uuid, text, integer, text, timestamptz, timestamptz, uuid[], uuid[], uuid, jsonb, text, text) to authenticated;

commit;
