-- Task064.1: atomically validate and add suggested photos.
-- Existing draft spreads, frames, covers, and user overrides are never touched.

begin;

create or replace function public.add_suggested_album_photos(
  p_album_id uuid,
  p_route_pet_id uuid,
  p_expected_draft_version_id uuid,
  p_expected_fingerprint text,
  p_selected_photo_ids uuid[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_album public.albums%rowtype;
  v_version public.album_draft_versions%rowtype;
  v_pet_ids uuid[];
  v_generation_ids uuid[];
  v_candidate_ids uuid[];
  v_expected text;
  v_photo_id uuid;
  v_inserted_ids uuid[] := '{}'::uuid[];
  v_position integer;
  v_event_key text;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = 'P0001';
  end if;
  if p_expected_fingerprint !~ '^[0-9a-f]{64}$'
     or cardinality(p_selected_photo_ids) = 0
     or cardinality(p_selected_photo_ids) <> (select count(distinct id) from unnest(p_selected_photo_ids) u(id)) then
    raise exception 'invalid suggestion request' using errcode = 'P0001';
  end if;

  -- Serialize every suggestion mutation for this album before reading mutable state.
  perform pg_advisory_xact_lock(hashtextextended('album-suggestion:' || p_album_id::text, 0));

  select * into v_album
    from public.albums
   where id = p_album_id
     and owner_user_id = v_user_id
     and pet_id = p_route_pet_id
   for update;
  if not found then raise exception 'not found' using errcode = 'P0001'; end if;
  if v_album.status <> 'draft' then raise exception 'album is protected' using errcode = 'P0001'; end if;

  select * into v_version
    from public.album_draft_versions
   where id = p_expected_draft_version_id
     and album_id = p_album_id
     and is_active
   for update;
  if not found then raise exception 'stale draft version' using errcode = 'P0001'; end if;
  if v_version.status = 'locked' then raise exception 'draft is locked' using errcode = 'P0001'; end if;

  if exists (select 1 from public.album_analytics_events where album_id = p_album_id and event_type = 'album_accepted')
     or exists (select 1 from public.orders where album_id = p_album_id and status in ('pending', 'paid'))
     or exists (select 1 from public.album_print_snapshots where album_id = p_album_id and finalized_at is not null) then
    raise exception 'album is protected' using errcode = 'P0001';
  end if;

  select array_agg(pet_id order by pet_id) into v_pet_ids
  from (
    select v_album.pet_id as pet_id
    union
    select ap.pet_id from public.album_pets ap where ap.album_id = p_album_id
  ) scoped;
  if exists (
    select 1 from unnest(v_pet_ids) scoped_pet(id)
    where not exists (select 1 from public.pets p where p.id = scoped_pet.id and p.owner_user_id = v_user_id)
  ) then
    raise exception 'not found' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(value::uuid order by value::uuid), '{}'::uuid[])
    into v_generation_ids
    from jsonb_array_elements_text(
      case
        when jsonb_typeof(v_version.generation_metadata->'passive_candidate_photo_ids') = 'array'
          then v_version.generation_metadata->'passive_candidate_photo_ids'
        when jsonb_typeof(v_version.generation_metadata->'generation_photo_ids') = 'array'
          then v_version.generation_metadata->'generation_photo_ids'
        else '[]'::jsonb
      end
    );
  if cardinality(v_generation_ids) = 0 then
    select coalesce(array_agg(distinct f.ai_photo_id order by f.ai_photo_id), '{}'::uuid[])
      into v_generation_ids
      from public.album_draft_spreads s
      join public.album_draft_frames f on f.draft_spread_id = s.id
     where s.draft_version_id = v_version.id;
  end if;

  select coalesce(array_agg(p.id order by p.id), '{}'::uuid[])
    into v_candidate_ids
    from public.photos p
   where p.pet_id = any(v_pet_ids)
     and p.uploader_user_id = v_user_id
     and p.timeline_at >= v_album.period_from
     and p.timeline_at < v_album.period_to
     and not (p.id = any(v_generation_ids))
     and (
       jsonb_typeof(v_version.generation_metadata->'passive_candidate_photo_ids') = 'array'
       or jsonb_typeof(v_version.generation_metadata->'generation_photo_ids') = 'array'
       or p.created_at > v_version.created_at
     );

  v_expected := encode(extensions.digest(convert_to(
    p_album_id::text || '|' || v_version.id::text || '|' || array_to_string(v_candidate_ids, '|'),
    'UTF8'
  ), 'sha256'), 'hex');
  if v_expected <> p_expected_fingerprint then
    raise exception 'stale suggestion' using errcode = 'P0001';
  end if;
  if not (p_selected_photo_ids <@ v_candidate_ids) then
    raise exception 'invalid selected photos' using errcode = 'P0001';
  end if;

  select coalesce(max(position), -1) + 1 into v_position
    from public.album_photos where album_id = p_album_id;

  foreach v_photo_id in array p_selected_photo_ids loop
    if not exists (select 1 from public.album_photos where album_id = p_album_id and photo_id = v_photo_id) then
      insert into public.album_photos (album_id, photo_id, position, selected_by)
      values (p_album_id, v_photo_id, v_position, 'user');
      v_inserted_ids := array_append(v_inserted_ids, v_photo_id);
      v_position := v_position + 1;
    end if;
  end loop;

  if cardinality(v_inserted_ids) > 0 then
    select encode(extensions.digest(convert_to(
      p_album_id::text || '|' || v_version.id::text || '|' || array_to_string((select array_agg(id order by id) from unnest(v_inserted_ids) u(id)), '|'),
      'UTF8'
    ), 'sha256'), 'hex') into v_event_key;
    insert into public.album_analytics_events (
      user_id, album_id, draft_version_id, event_type, event_key, event_data
    ) values (
      v_user_id, p_album_id, v_version.id, 'new_photos_added', v_event_key,
      jsonb_build_object('photo_count', cardinality(v_inserted_ids))
    ) on conflict do nothing;
  end if;

  return jsonb_build_object(
    'album_id', p_album_id,
    'draft_version_id', v_version.id,
    'inserted_count', cardinality(v_inserted_ids),
    'inserted_photo_ids', to_jsonb(v_inserted_ids),
    'event_key', v_event_key
  );
end;
$$;

create or replace function public.dismiss_suggested_album_photos(
  p_album_id uuid,
  p_route_pet_id uuid,
  p_expected_draft_version_id uuid,
  p_expected_fingerprint text,
  p_photo_count integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_album public.albums%rowtype;
  v_version public.album_draft_versions%rowtype;
  v_pet_ids uuid[];
  v_generation_ids uuid[];
  v_candidate_ids uuid[];
  v_expected text;
begin
  if v_user_id is null or p_expected_fingerprint !~ '^[0-9a-f]{64}$' or p_photo_count < 1 then
    raise exception 'invalid suggestion request' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('album-suggestion:' || p_album_id::text, 0));
  select * into v_album from public.albums
   where id = p_album_id and pet_id = p_route_pet_id and owner_user_id = v_user_id
   for update;
  if not found or v_album.status <> 'draft' then raise exception 'album is protected' using errcode = 'P0001'; end if;
  select * into v_version from public.album_draft_versions
   where id = p_expected_draft_version_id and album_id = p_album_id and is_active
   for update;
  if not found or v_version.status = 'locked' then raise exception 'stale suggestion' using errcode = 'P0001'; end if;
  if exists (select 1 from public.album_analytics_events where album_id = p_album_id and event_type = 'album_accepted')
     or exists (select 1 from public.orders where album_id = p_album_id and status in ('pending', 'paid'))
     or exists (select 1 from public.album_print_snapshots where album_id = p_album_id and finalized_at is not null) then
    raise exception 'album is protected' using errcode = 'P0001';
  end if;
  select array_agg(pet_id order by pet_id) into v_pet_ids from (
    select v_album.pet_id as pet_id union select pet_id from public.album_pets where album_id = p_album_id
  ) scoped;
  if exists (select 1 from unnest(v_pet_ids) q(id) where not exists (
    select 1 from public.pets p where p.id = q.id and p.owner_user_id = v_user_id
  )) then raise exception 'not found' using errcode = 'P0001'; end if;
  select coalesce(array_agg(value::uuid order by value::uuid), '{}'::uuid[]) into v_generation_ids
  from jsonb_array_elements_text(case
    when jsonb_typeof(v_version.generation_metadata->'passive_candidate_photo_ids') = 'array' then v_version.generation_metadata->'passive_candidate_photo_ids'
    when jsonb_typeof(v_version.generation_metadata->'generation_photo_ids') = 'array' then v_version.generation_metadata->'generation_photo_ids'
    else '[]'::jsonb end);
  if cardinality(v_generation_ids) = 0 then
    select coalesce(array_agg(distinct f.ai_photo_id order by f.ai_photo_id), '{}'::uuid[]) into v_generation_ids
    from public.album_draft_spreads s join public.album_draft_frames f on f.draft_spread_id = s.id
    where s.draft_version_id = v_version.id;
  end if;
  select coalesce(array_agg(p.id order by p.id), '{}'::uuid[]) into v_candidate_ids
  from public.photos p where p.pet_id = any(v_pet_ids) and p.uploader_user_id = v_user_id
    and p.timeline_at >= v_album.period_from and p.timeline_at < v_album.period_to
    and not (p.id = any(v_generation_ids))
    and (jsonb_typeof(v_version.generation_metadata->'passive_candidate_photo_ids') = 'array'
      or jsonb_typeof(v_version.generation_metadata->'generation_photo_ids') = 'array'
      or p.created_at > v_version.created_at);
  v_expected := encode(extensions.digest(convert_to(
    p_album_id::text || '|' || v_version.id::text || '|' || array_to_string(v_candidate_ids, '|'), 'UTF8'
  ), 'sha256'), 'hex');
  if v_expected <> p_expected_fingerprint or p_photo_count > cardinality(v_candidate_ids) then
    raise exception 'stale suggestion' using errcode = 'P0001';
  end if;
  insert into public.album_analytics_events (
    user_id, album_id, draft_version_id, event_type, event_key, event_data
  ) values (
    v_user_id, p_album_id, p_expected_draft_version_id, 'new_photos_dismissed',
    p_expected_fingerprint, jsonb_build_object('photo_count', p_photo_count)
  ) on conflict do nothing;
  return true;
end;
$$;

revoke all on function public.add_suggested_album_photos(uuid, uuid, uuid, text, uuid[]) from public, anon, service_role;
grant execute on function public.add_suggested_album_photos(uuid, uuid, uuid, text, uuid[]) to authenticated;
revoke all on function public.dismiss_suggested_album_photos(uuid, uuid, uuid, text, integer) from public, anon, service_role;
grant execute on function public.dismiss_suggested_album_photos(uuid, uuid, uuid, text, integer) to authenticated;

commit;
