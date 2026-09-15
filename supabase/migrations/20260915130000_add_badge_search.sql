-- Task041: bounded search/facet responses. Existing search_pet_photos_page remains intact.
create function public.normalize_search_word(p_value text, p_kind text default 'tag')
returns text language sql immutable parallel safe security invoker set search_path = '' as $$
  with cleaned as (
    select lower(btrim(regexp_replace(coalesce(p_value, ''), '[[:space:]　]+', ' ', 'g'))) as v
  )
  select case
    when p_kind = 'emotion' then case v
      when 'happy' then '楽しそう' when 'calm' then 'リラックス'
      when 'relaxed' then 'リラックス' when 'sleepy' then '眠そう'
      when 'unknown' then '不明' else v end
    when p_kind = 'activity' then case v
      when 'walking' then '散歩' when 'walk' then '散歩'
      when 'sleeping' then '睡眠' when 'sleep' then '睡眠'
      when 'playing' then '遊び' when 'play' then '遊び'
      when 'eating' then '食事' when 'eat' then '食事'
      when 'outing' then 'お出かけ' when 'holding' then '抱っこ'
      when 'other' then 'その他' else v end
    when p_kind = 'scene' then case v
      when 'indoor' then '室内' when 'indoors' then '室内'
      when 'park' then '公園' when 'road' then '道路'
      when 'sea' then '海' when 'beach' then '海'
      when 'mountain' then '山' when 'cafe' then 'カフェ'
      when 'car' then '車内' when 'other' then 'その他' else v end
    else v end from cleaned;
$$;

create function public.photo_search_words(p_tags text[], p_activity text, p_scene text, p_emotion text)
returns table (kind text, value text)
language sql immutable parallel safe security invoker set search_path = '' as $$
  with raw_words as (
    select 'tag'::text as kind, unnest(coalesce(p_tags, '{}'::text[])) as value
    union all select 'activity', p_activity
    union all select 'scene', p_scene
    union all select 'emotion', p_emotion
  ), normalized as (
    select kind, public.normalize_search_word(value, kind) as value from raw_words
  )
  select distinct kind, value from normalized
  where char_length(value) between 1 and 24
    and (kind = 'tag'
      or (kind = 'activity' and value in ('散歩','睡眠','食事','遊び','お出かけ','抱っこ','その他'))
      or (kind = 'scene' and value in ('室内','公園','道路','海','山','カフェ','車内','その他'))
      or (kind = 'emotion' and value in ('リラックス','楽しそう','眠そう','不明')));
$$;

create function public.get_search_facets(p_pet_id uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with owned as materialized (
    select p.id, p.pet_id, pet.name as pet_name, p.favorite,
      a.id as analysis_id, a.tags, a.activity, a.scene, a.emotion
    from public.photos p join public.pets pet on pet.id = p.pet_id
    left join public.photo_ai_analyses a on a.photo_id = p.id and a.status = 'completed'
    where pet.owner_user_id = (select auth.uid())
      and p.uploader_user_id = (select auth.uid())
  ), scoped as materialized (
    select * from owned where p_pet_id is null or pet_id = p_pet_id
  ), word_counts as (
    select w.kind, w.value, count(*) as count
    from scoped s cross join lateral public.photo_search_words(s.tags, s.activity, s.scene, s.emotion) w
    where s.analysis_id is not null group by w.kind, w.value
  ), ranked as (
    select *, row_number() over (partition by kind order by count desc, value) as rank
    from word_counts
  ), pet_counts as (
    select pet_id as id, pet_name as name, count(*) as count
    from owned group by pet_id, pet_name
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

create function public.search_photos_page(
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
      and (p_pet_id is null or p.pet_id = p_pet_id)
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

create index photos_owner_timeline_cursor_idx on public.photos (uploader_user_id, timeline_at desc, id desc);

revoke all on function public.normalize_search_word(text,text) from public, anon;
revoke all on function public.photo_search_words(text[],text,text,text) from public, anon;
revoke all on function public.get_search_facets(uuid) from public, anon;
revoke all on function public.search_photos_page(uuid,text,text,text,boolean,timestamptz,timestamptz,integer,timestamptz,uuid) from public, anon;
grant execute on function public.normalize_search_word(text,text) to authenticated;
grant execute on function public.photo_search_words(text[],text,text,text) to authenticated;
grant execute on function public.get_search_facets(uuid) to authenticated;
grant execute on function public.search_photos_page(uuid,text,text,text,boolean,timestamptz,timestamptz,integer,timestamptz,uuid) to authenticated;
