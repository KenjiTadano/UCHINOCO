alter table public.photos
add column timeline_at timestamptz generated always as (coalesce(taken_at, created_at)) stored;

create index photos_pet_timeline_cursor_idx
on public.photos (pet_id, timeline_at desc, id desc);

create index photos_pet_favorite_timeline_cursor_idx
on public.photos (pet_id, timeline_at desc, id desc)
where favorite = true;

create function public.get_pet_photos_page(
  p_pet_id uuid,
  p_limit integer default 30,
  p_cursor_at timestamptz default null,
  p_cursor_id uuid default null,
  p_favorite_only boolean default false
)
returns table (
  id uuid,
  pet_id uuid,
  storage_path text,
  taken_at timestamptz,
  created_at timestamptz,
  caption text,
  favorite boolean,
  timeline_at timestamptz
)
language sql stable security invoker set search_path = ''
as $$
  select p.id, p.pet_id, p.storage_path, p.taken_at, p.created_at,
         p.caption, p.favorite, p.timeline_at
  from public.photos p
  where p.pet_id = p_pet_id
    and (not p_favorite_only or p.favorite)
    and (p_cursor_at is null or (p.timeline_at, p.id) < (p_cursor_at, p_cursor_id))
  order by p.timeline_at desc, p.id desc
  limit least(greatest(p_limit, 1), 61);
$$;

create function public.search_pet_photos_page(
  p_pet_id uuid,
  p_query text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_favorite_only boolean default false,
  p_limit integer default 50,
  p_cursor_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  pet_id uuid,
  storage_path text,
  taken_at timestamptz,
  created_at timestamptz,
  caption text,
  favorite boolean,
  timeline_at timestamptz,
  description text,
  tags text[]
)
language sql stable security invoker set search_path = ''
as $$
  select p.id, p.pet_id, p.storage_path, p.taken_at, p.created_at,
         p.caption, p.favorite, p.timeline_at, a.description, coalesce(a.tags, '{}')
  from public.photos p
  left join public.photo_ai_analyses a
    on a.photo_id = p.id and a.status = 'completed'
  where p.pet_id = p_pet_id
    and (not p_favorite_only or p.favorite)
    and (p_from is null or p.timeline_at >= p_from)
    and (p_to is null or p.timeline_at < p_to)
    and (p_cursor_at is null or (p.timeline_at, p.id) < (p_cursor_at, p_cursor_id))
    and (
      nullif(btrim(p_query), '') is null
      or p.caption ilike '%' || replace(replace(replace(p_query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\\'
      or a.description ilike '%' || replace(replace(replace(p_query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\\'
      or a.activity ilike '%' || replace(replace(replace(p_query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\\'
      or a.scene ilike '%' || replace(replace(replace(p_query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\\'
      or a.emotion ilike '%' || replace(replace(replace(p_query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\\'
      or exists (
        select 1 from unnest(coalesce(a.tags, '{}')) tag
        where tag ilike '%' || replace(replace(replace(p_query, '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%' escape '\\'
      )
    )
  order by p.timeline_at desc, p.id desc
  limit least(greatest(p_limit, 1), 50);
$$;

create function public.get_dashboard_photos(p_favorite_only boolean default false, p_limit integer default 6)
returns table (
  id uuid, pet_id uuid, storage_path text, taken_at timestamptz,
  created_at timestamptz, favorite boolean, timeline_at timestamptz
)
language sql stable security invoker set search_path = ''
as $$
  select p.id, p.pet_id, p.storage_path, p.taken_at, p.created_at, p.favorite, p.timeline_at
  from public.photos p
  join public.pets pet on pet.id = p.pet_id
  where pet.owner_user_id = auth.uid()
    and (not p_favorite_only or p.favorite)
  order by p.timeline_at desc, p.id desc
  limit least(greatest(p_limit, 1), 6);
$$;

revoke all on function public.get_pet_photos_page(uuid, integer, timestamptz, uuid, boolean) from public, anon;
grant execute on function public.get_pet_photos_page(uuid, integer, timestamptz, uuid, boolean) to authenticated;
revoke all on function public.search_pet_photos_page(uuid, text, timestamptz, timestamptz, boolean, integer, timestamptz, uuid) from public, anon;
grant execute on function public.search_pet_photos_page(uuid, text, timestamptz, timestamptz, boolean, integer, timestamptz, uuid) to authenticated;
revoke all on function public.get_dashboard_photos(boolean, integer) from public, anon;
grant execute on function public.get_dashboard_photos(boolean, integer) to authenticated;
