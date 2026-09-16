-- Task042-3. photos.pet_id in every response ALWAYS means registration/primary.
-- Keep get_pet_photos_page (Album) and dashboard/Home functions unchanged.
create function public.get_pet_memories_page(p_pet_id uuid, p_limit integer default 30,
  p_cursor_at timestamptz default null, p_cursor_id uuid default null, p_favorite_only boolean default false)
returns table (id uuid, pet_id uuid, storage_path text, thumbnail_path text,
  taken_at timestamptz, created_at timestamptz, caption text, favorite boolean, timeline_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.pet_id, p.storage_path, p.thumbnail_path, p.taken_at,
    p.created_at, p.caption, p.favorite, p.timeline_at
  from public.photos p join public.pets primary_pet on primary_pet.id = p.pet_id
  where p.uploader_user_id = (select auth.uid())
    and primary_pet.owner_user_id = (select auth.uid())
    and exists (select 1 from public.pets target where target.id = p_pet_id and target.owner_user_id = (select auth.uid()))
    and (p.pet_id = p_pet_id or exists (
        select 1 from public.photo_pets r where r.photo_id = p.id
          and r.pet_id = p_pet_id and r.confirmed_by_user and r.source <> 'primary'
      ))
    and (not coalesce(p_favorite_only, false) or p.favorite)
    and (p_cursor_at is null or (p.timeline_at, p.id) < (p_cursor_at, p_cursor_id))
  order by p.timeline_at desc, p.id desc limit least(greatest(coalesce(p_limit,30),1),61);
$$;
revoke all on function public.get_pet_memories_page(uuid,integer,timestamptz,uuid,boolean) from public, anon, service_role;
grant execute on function public.get_pet_memories_page(uuid,integer,timestamptz,uuid,boolean) to authenticated;

-- Every photo set remains one row per photo. Pet counts overlap by design;
-- each pet's count is computed with EXISTS, never a multiplying relation JOIN.
create or replace function public.get_search_facets(p_pet_id uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with owned as materialized (
    select p.id, p.pet_id, pet.name as pet_name, p.favorite,
      a.id as analysis_id, a.tags, a.activity, a.scene, a.emotion
    from public.photos p join public.pets pet on pet.id = p.pet_id
    left join public.photo_ai_analyses a on a.photo_id = p.id and a.status = 'completed'
    where pet.owner_user_id = (select auth.uid())
      and p.uploader_user_id = (select auth.uid())
  ), scoped as materialized (
    select * from owned where p_pet_id is null or pet_id = p_pet_id or exists (
        select 1 from public.photo_pets r where r.photo_id = owned.id
          and r.pet_id = p_pet_id and r.confirmed_by_user and r.source <> 'primary'
      )
  ), word_counts as (
    select w.kind, w.value, count(*) as count
    from scoped s cross join lateral public.photo_search_words(s.tags, s.activity, s.scene, s.emotion) w
    where s.analysis_id is not null group by w.kind, w.value
  ), ranked as (
    select *, row_number() over (partition by kind order by count desc, value) as rank
    from word_counts
  ), pet_counts as (
    select target.id, target.name, counts.count
    from public.pets target cross join lateral (
      select count(*) as count from owned o
      where o.pet_id = target.id or exists (
        select 1 from public.photo_pets r where r.photo_id = o.id
          and r.pet_id = target.id and r.confirmed_by_user and r.source <> 'primary'
      )
    ) counts
    where target.owner_user_id = (select auth.uid()) and counts.count > 0
  )
  select jsonb_build_object(
    'words', coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'value',value,'count',count)
      order by kind, count desc, value) from ranked where rank <= case when kind = 'tag' then 20 else 8 end), '[]'::jsonb),
    'pets', coalesce((select jsonb_agg(to_jsonb(x) order by count desc, name, id)
      from (select * from pet_counts order by count desc, name, id limit 30) x), '[]'::jsonb),
    'total', (select count(*) from scoped),
    'completed', (select count(*) from scoped where analysis_id is not null),
    'favorites', (select count(*) from scoped where favorite)
  );
$$;

create or replace function public.search_photos_page(
  p_pet_id uuid default null, p_query text default null,
  p_kind text default null, p_value text default null,
  p_favorite_only boolean default false, p_from timestamptz default null, p_to timestamptz default null,
  p_limit integer default 36, p_cursor_at timestamptz default null, p_cursor_id uuid default null
)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with matching as materialized (
    select p.id, p.pet_id, pet.name as pet_name, p.storage_path, p.thumbnail_path,
      p.taken_at, p.created_at, p.caption, p.favorite, p.timeline_at,
      a.description
    from public.photos p join public.pets pet on pet.id = p.pet_id
    left join public.photo_ai_analyses a on a.photo_id = p.id and a.status = 'completed'
    where pet.owner_user_id = (select auth.uid()) and p.uploader_user_id = (select auth.uid())
      and (p_pet_id is null or p.pet_id = p_pet_id or exists (
        select 1 from public.photo_pets r where r.photo_id = p.id
          and r.pet_id = p_pet_id and r.confirmed_by_user and r.source <> 'primary'
      ))
      and (not coalesce(p_favorite_only, false) or p.favorite)
      and (p_from is null or p.timeline_at >= p_from) and (p_to is null or p.timeline_at < p_to)
      -- strpos treats %, _ and backslashes literally; no dynamic SQL or wildcard injection.
      and (nullif(btrim(p_query), '') is null or (
        char_length(p_query) <= 100 and (
          strpos(lower(coalesce(p.caption,'')), lower(btrim(p_query))) > 0
          or strpos(lower(coalesce(a.description,'')), lower(btrim(p_query))) > 0
          or strpos(lower(coalesce(a.activity,'')), lower(btrim(p_query))) > 0
          or strpos(lower(coalesce(a.scene,'')), lower(btrim(p_query))) > 0
          or strpos(lower(coalesce(a.emotion,'')), lower(btrim(p_query))) > 0
          or exists (select 1 from unnest(coalesce(a.tags,'{}'::text[])) t
            where strpos(lower(t), lower(btrim(p_query))) > 0)
        )))
      and ((p_kind is null and p_value is null) or (
        p_kind in ('tag','activity','scene','emotion') and char_length(p_value) between 1 and 24
        and a.id is not null and exists (
          select 1 from public.photo_search_words(a.tags,a.activity,a.scene,a.emotion) w
          where w.kind = p_kind and w.value = public.normalize_search_word(p_value,p_kind)
        )))
  ), page as (
    select * from matching
    where p_cursor_at is null or (timeline_at,id) < (p_cursor_at,p_cursor_id)
    order by timeline_at desc, id desc limit least(greatest(coalesce(p_limit,36),1),50) + 1
  )
  select jsonb_build_object(
    'total', (select count(*) from matching),
    'photos', coalesce((select jsonb_agg(to_jsonb(page) order by timeline_at desc,id desc) from page),'[]'::jsonb)
  );
$$;

