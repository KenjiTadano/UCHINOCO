create table public.album_analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  album_id uuid not null references public.albums(id) on delete cascade,
  draft_version_id uuid references public.album_draft_versions(id) on delete cascade,
  event_type text not null check (event_type in (
    'album_generated', 'album_viewed', 'album_accepted', 'album_edit_started',
    'album_layout_changed', 'album_crop_changed', 'album_photo_swapped',
    'album_text_changed', 'album_decoration_changed', 'album_background_changed',
    'album_regenerated', 'print_preview_opened', 'checkout_started',
    'decoration_recommendation_shown', 'decoration_previewed',
    'decoration_applied', 'decoration_rejected', 'decoration_reset'
  )),
  event_key text,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint album_analytics_event_data_object check (jsonb_typeof(event_data) = 'object'),
  constraint album_analytics_event_key_length check (event_key is null or char_length(event_key) <= 160)
);

create unique index album_analytics_events_dedupe_idx
  on public.album_analytics_events (user_id, album_id, event_type, event_key)
  where event_key is not null;

create index album_analytics_events_album_created_idx
  on public.album_analytics_events (album_id, created_at desc);

create index album_analytics_events_user_type_created_idx
  on public.album_analytics_events (user_id, event_type, created_at desc);

alter table public.album_analytics_events enable row level security;

create policy "album analytics select own"
  on public.album_analytics_events for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.albums
      where albums.id = album_analytics_events.album_id
        and albums.owner_user_id = (select auth.uid())
    )
  );

create policy "album analytics insert own"
  on public.album_analytics_events for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.albums
      where albums.id = album_analytics_events.album_id
        and albums.owner_user_id = (select auth.uid())
    )
    and (
      draft_version_id is null
      or exists (
        select 1 from public.album_draft_versions
        where album_draft_versions.id = album_analytics_events.draft_version_id
          and album_draft_versions.album_id = album_analytics_events.album_id
      )
    )
  );

revoke update, delete on public.album_analytics_events from authenticated;
grant select, insert on public.album_analytics_events to authenticated;

create or replace function public.get_album_analytics_summary()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with own_events as (
    select event_type, event_data
    from public.album_analytics_events
    where user_id = (select auth.uid())
  ), counts as (
    select
      count(*) filter (where event_type = 'album_generated') as generated,
      count(*) filter (where event_type = 'album_accepted') as accepted,
      count(*) filter (where event_type = 'album_accepted' and event_data->>'category' = 'DIRECT_ACCEPT') as direct_accepted,
      avg((event_data->>'edit_distance')::numeric) filter (where event_type = 'album_accepted') as avg_edit_distance,
      avg((event_data->>'time_to_accept_seconds')::numeric) filter (where event_type = 'album_accepted' and event_data->>'time_to_accept_seconds' is not null) as avg_time_to_accept,
      sum(coalesce((event_data->>'ai_layout_kept_count')::int, 0)) filter (where event_type = 'album_accepted') as layout_kept,
      sum(coalesce((event_data->>'ai_layout_total')::int, 0)) filter (where event_type = 'album_accepted') as layout_total,
      sum(coalesce((event_data->>'ai_crop_kept_count')::int, 0)) filter (where event_type = 'album_accepted') as crop_kept,
      sum(coalesce((event_data->>'ai_crop_total')::int, 0)) filter (where event_type = 'album_accepted') as crop_total,
      count(*) filter (where event_type = 'decoration_applied') as decoration_applied,
      count(*) filter (where event_type = 'decoration_recommendation_shown') as decoration_shown,
      count(*) filter (where event_type = 'print_preview_opened') as print_previews,
      count(*) filter (where event_type = 'checkout_started') as checkout_starts,
      count(*) filter (where event_type = 'album_regenerated') as regenerations
    from own_events
  )
  select jsonb_build_object(
    'generated_albums', generated,
    'direct_accept_rate', case when generated = 0 then 0 else direct_accepted::numeric / generated end,
    'any_accept_rate', case when generated = 0 then 0 else accepted::numeric / generated end,
    'average_edit_distance', coalesce(avg_edit_distance, 0),
    'average_time_to_accept_seconds', coalesce(avg_time_to_accept, 0),
    'ai_layout_rank_one_keep_rate', case when coalesce(layout_total, 0) = 0 then 0 else layout_kept::numeric / layout_total end,
    'crop_keep_rate', case when coalesce(crop_total, 0) = 0 then 0 else crop_kept::numeric / crop_total end,
    'decoration_accept_rate', case when decoration_shown = 0 then 0 else decoration_applied::numeric / decoration_shown end,
    'print_preview_rate', case when generated = 0 then 0 else print_previews::numeric / generated end,
    'checkout_start_rate', case when generated = 0 then 0 else checkout_starts::numeric / generated end,
    'regenerate_rate', case when generated = 0 then 0 else regenerations::numeric / generated end
  ) from counts;
$$;

grant execute on function public.get_album_analytics_summary() to authenticated;
