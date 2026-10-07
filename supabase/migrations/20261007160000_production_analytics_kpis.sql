-- Task074: privacy-bounded cross-product analytics and server-side KPI aggregation.
begin;

create table public.product_analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'upgrade_viewed', 'upgrade_started', 'subscription_activated', 'subscription_canceled',
    'payment_success', 'print_order_created',
    'search_opened', 'search_result_opened', 'search_empty',
    'family_invite_sent', 'family_invite_accepted', 'family_photo_added', 'family_activity_viewed'
  )),
  event_source text not null default 'server' check (event_source in ('server', 'webhook')),
  event_key text,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint product_analytics_event_data_object check (jsonb_typeof(event_data) = 'object'),
  constraint product_analytics_event_data_allowlist check (
    event_data - 'photo_count' = '{}'::jsonb
    and (not event_data ? 'photo_count' or jsonb_typeof(event_data->'photo_count') = 'number')
  ),
  constraint product_analytics_event_key_length check (event_key is null or char_length(event_key) <= 160),
  constraint product_analytics_event_privacy check (not event_data ?| array[
    'email','pet_name','member_name','caption','query','search_query','signed_url','storage_path',
    'payment_method','shipping_address','invite_token','provider_credentials','photo_id'
  ])
);

create unique index product_analytics_events_dedupe_idx
  on public.product_analytics_events(user_id, event_type, event_key)
  where event_key is not null;
create index product_analytics_events_type_created_idx
  on public.product_analytics_events(event_type, created_at desc);
create index product_analytics_events_user_created_idx
  on public.product_analytics_events(user_id, created_at desc);

alter table public.product_analytics_events enable row level security;
create policy "product analytics: own insert"
  on public.product_analytics_events for insert to authenticated
  with check (user_id = (select auth.uid()));
revoke all on public.product_analytics_events from public, anon, authenticated;
grant insert on public.product_analytics_events to authenticated;

create function public.get_production_kpis(p_since timestamptz default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with album_events as (
    select event_type, event_data, album_id, draft_version_id
    from public.album_analytics_events
    where p_since is null or created_at >= p_since
  ), product_events as (
    select event_type
    from public.product_analytics_events
    where p_since is null or created_at >= p_since
  ), album_counts as (
    select
      count(distinct coalesce(draft_version_id, album_id)) filter (where event_type='album_generated') as generated,
      count(distinct coalesce(draft_version_id, album_id)) filter (where event_type='album_viewed') as viewed,
      count(distinct coalesce(draft_version_id, album_id)) filter (where event_type='album_accepted') as accepted,
      count(distinct coalesce(draft_version_id, album_id)) filter (where event_type='album_accepted' and event_data->>'category'='DIRECT_ACCEPT') as direct_accepted,
      avg((event_data->>'edit_distance')::numeric) filter (where event_type='album_accepted' and jsonb_typeof(event_data->'edit_distance')='number') as avg_edit_distance,
      sum(coalesce((event_data->>'ai_layout_kept_count')::int,0)) filter (where event_type='album_accepted') as layout_kept,
      sum(coalesce((event_data->>'ai_layout_total')::int,0)) filter (where event_type='album_accepted') as layout_total,
      sum(coalesce((event_data->>'ai_crop_kept_count')::int,0)) filter (where event_type='album_accepted') as crop_kept,
      sum(coalesce((event_data->>'ai_crop_total')::int,0)) filter (where event_type='album_accepted') as crop_total,
      count(*) filter (where event_type='album_accepted' and coalesce((event_data->>'photo_swap_count')::int,0)>0) as photo_swap_accepted,
      count(*) filter (where event_type='album_accepted' and coalesce((event_data->>'text_change_count')::int,0)>0) as text_edited_accepted,
      count(*) filter (where event_type='album_accepted' and coalesce((event_data->>'decoration_change_count')::int,0)>0) as decoration_applied_accepted,
      count(distinct coalesce(draft_version_id, album_id)) filter (where event_type='print_preview_opened') as print_preview,
      count(distinct coalesce(draft_version_id, album_id)) filter (where event_type='checkout_started') as checkout_started
    from album_events
  ), product_counts as (
    select event_type, count(*) as amount from product_events group by event_type
  ), active_users as (
    select id from auth.users
    where last_sign_in_at is not null and (p_since is null or last_sign_in_at >= p_since)
  ), subscriptions as (
    select count(*) filter (where subscription.plan='PLUS' and subscription.status in ('active','trialing')) as plus_active
    from active_users active_user
    left join public.user_subscriptions subscription on subscription.user_id=active_user.id
  ), users as (
    select count(*) as active from active_users
  ), fulfillment as (
    select count(*) as ready from public.print_jobs
    where fulfillment_status in ('ready','submitting','submitted','accepted','in_production','shipped','delivered')
      and (p_since is null or created_at >= p_since)
  )
  select jsonb_build_object(
    'active_users', users.active,
    'free_active_users', greatest(users.active-subscriptions.plus_active,0),
    'plus_active_users', subscriptions.plus_active,
    'album_generated', album_counts.generated,
    'album_viewed', album_counts.viewed,
    'album_accepted', album_counts.accepted,
    'direct_accepted', album_counts.direct_accepted,
    'average_edit_distance', album_counts.avg_edit_distance,
    'layout_kept', album_counts.layout_kept,
    'layout_total', album_counts.layout_total,
    'crop_kept', album_counts.crop_kept,
    'crop_total', album_counts.crop_total,
    'photo_swap_accepted', album_counts.photo_swap_accepted,
    'text_edited_accepted', album_counts.text_edited_accepted,
    'decoration_applied_accepted', album_counts.decoration_applied_accepted,
    'print_preview', album_counts.print_preview,
    'checkout_started', album_counts.checkout_started,
    'payment_success', coalesce((select amount from product_counts where event_type='payment_success'),0),
    'print_order_created', coalesce((select amount from product_counts where event_type='print_order_created'),0),
    'fulfillment_ready', fulfillment.ready,
    'upgrade_viewed', coalesce((select amount from product_counts where event_type='upgrade_viewed'),0),
    'upgrade_started', coalesce((select amount from product_counts where event_type='upgrade_started'),0),
    'subscription_activated', coalesce((select amount from product_counts where event_type='subscription_activated'),0),
    'subscription_canceled', coalesce((select amount from product_counts where event_type='subscription_canceled'),0),
    'search_opened', coalesce((select amount from product_counts where event_type='search_opened'),0),
    'search_result_opened', coalesce((select amount from product_counts where event_type='search_result_opened'),0),
    'search_empty', coalesce((select amount from product_counts where event_type='search_empty'),0),
    'family_invite_sent', coalesce((select amount from product_counts where event_type='family_invite_sent'),0),
    'family_invite_accepted', coalesce((select amount from product_counts where event_type='family_invite_accepted'),0),
    'family_photo_added', coalesce((select amount from product_counts where event_type='family_photo_added'),0),
    'family_activity_viewed', coalesce((select amount from product_counts where event_type='family_activity_viewed'),0)
  )
  from album_counts, subscriptions, users, fulfillment;
$$;

revoke all on function public.get_production_kpis(timestamptz) from public, anon, authenticated;
grant execute on function public.get_production_kpis(timestamptz) to service_role;

commit;
