-- Task071: FREE / PLUS subscription source of truth and DB mutation boundaries.
begin;

create table public.user_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'FREE' check (plan in ('FREE', 'PLUS')),
  status text not null default 'none' check (status in (
    'none', 'trialing', 'active', 'past_due', 'canceled', 'unpaid',
    'incomplete', 'incomplete_expired', 'paused'
  )),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  stripe_event_created_at bigint not null default 0,
  last_stripe_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_subscriptions_plus_status check (
    plan = 'FREE' or status in ('trialing', 'active')
  )
);

create trigger set_user_subscriptions_updated_at
  before update on public.user_subscriptions
  for each row execute function public.set_updated_at();

alter table public.user_subscriptions enable row level security;
revoke all on public.user_subscriptions from public, anon, authenticated;
grant select on public.user_subscriptions to authenticated;
create policy "subscriptions: own select"
  on public.user_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

create function public.user_has_plus(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_subscriptions subscription
    where subscription.user_id = p_user_id
      and subscription.plan = 'PLUS'
      and subscription.status in ('active', 'trialing')
  );
$$;

create function public.pet_owner_has_plus(p_pet_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.pets pet
    where pet.id = p_pet_id and public.user_has_plus(pet.owner_user_id)
  );
$$;

create function public.can_contribute_to_pet(p_pet_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_pet_owner(p_pet_id)
    or (public.can_access_pet(p_pet_id) and public.pet_owner_has_plus(p_pet_id));
$$;

create function public.can_create_pet_for_user(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user_id = (select auth.uid()) and (
    public.user_has_plus(p_user_id)
    or not exists (select 1 from public.pets pet where pet.owner_user_id = p_user_id)
  );
$$;

revoke all on function public.user_has_plus(uuid) from public, anon;
revoke all on function public.pet_owner_has_plus(uuid) from public, anon;
revoke all on function public.can_contribute_to_pet(uuid) from public, anon;
revoke all on function public.can_create_pet_for_user(uuid) from public, anon;
grant execute on function public.user_has_plus(uuid) to authenticated;
grant execute on function public.pet_owner_has_plus(uuid) to authenticated;
grant execute on function public.can_contribute_to_pet(uuid) to authenticated;
grant execute on function public.can_create_pet_for_user(uuid) to authenticated;

drop policy if exists "Users can create their own pets" on public.pets;
create policy "pets: entitled owner insert"
  on public.pets for insert to authenticated
  with check (public.can_create_pet_for_user(owner_user_id));

drop policy if exists "photos: family insert" on public.photos;
drop policy if exists "photos: uploader update" on public.photos;
drop policy if exists "photos: uploader or owner delete" on public.photos;
create policy "photos: entitled family insert" on public.photos for insert to authenticated
  with check (
    uploader_user_id = (select auth.uid())
    and public.can_contribute_to_pet(pet_id)
  );
create policy "photos: entitled uploader update" on public.photos for update to authenticated
  using (
    uploader_user_id = (select auth.uid())
    and public.can_contribute_to_pet(pet_id)
  )
  with check (
    uploader_user_id = (select auth.uid())
    and public.can_contribute_to_pet(pet_id)
  );
create policy "photos: entitled uploader or owner delete" on public.photos for delete to authenticated
  using (
    public.is_pet_owner(pet_id)
    or (
      uploader_user_id = (select auth.uid())
      and public.can_contribute_to_pet(pet_id)
    )
  );

drop policy if exists "photo analyses: uploader insert" on public.photo_ai_analyses;
drop policy if exists "photo analyses: uploader update" on public.photo_ai_analyses;
create policy "photo analyses: entitled uploader insert"
  on public.photo_ai_analyses for insert to authenticated
  with check (exists (
    select 1 from public.photos photo
    where photo.id = photo_ai_analyses.photo_id
      and photo.uploader_user_id = (select auth.uid())
      and public.can_contribute_to_pet(photo.pet_id)
  ));
create policy "photo analyses: entitled uploader update"
  on public.photo_ai_analyses for update to authenticated
  using (exists (
    select 1 from public.photos photo
    where photo.id = photo_ai_analyses.photo_id
      and photo.uploader_user_id = (select auth.uid())
      and public.can_contribute_to_pet(photo.pet_id)
  ))
  with check (exists (
    select 1 from public.photos photo
    where photo.id = photo_ai_analyses.photo_id
      and photo.uploader_user_id = (select auth.uid())
      and public.can_contribute_to_pet(photo.pet_id)
  ));

create or replace function public.save_photo_analysis_result(
  p_photo_id uuid, p_analysis_type text, p_analysis_version text,
  p_source_fingerprint text, p_result_status text, p_result jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_pet uuid; v_uploader uuid; v_owner uuid; v_id uuid; v_status text;
begin
  if auth.uid() is null then raise exception 'ログインが必要です' using errcode='42501'; end if;
  if p_analysis_type not in ('photo_intelligence_semantic','subject_geometry')
    or p_result_status not in ('success','fallback','failed')
    or p_analysis_version is null or char_length(p_analysis_version) not between 3 and 80
    or p_source_fingerprint is null or char_length(p_source_fingerprint) not between 8 and 500
    or jsonb_typeof(p_result) is distinct from 'object'
  then raise exception '解析結果の形式が不正です' using errcode='P0001'; end if;
  select photo.pet_id, photo.uploader_user_id, pet.owner_user_id
    into v_pet, v_uploader, v_owner
  from public.photos photo
  join public.pets pet on pet.id = photo.pet_id
  where photo.id = p_photo_id;
  if v_pet is null
     or not (
       v_owner = (select auth.uid())
       or (
         v_uploader = (select auth.uid())
         and public.can_contribute_to_pet(v_pet)
       )
     ) then
    raise exception '写真を読み込めませんでした' using errcode='42501';
  end if;
  insert into public.photo_analysis_results(
    photo_id,analysis_type,analysis_version,source_fingerprint,result_status,result
  ) values (
    p_photo_id,p_analysis_type,p_analysis_version,p_source_fingerprint,p_result_status,p_result
  )
  on conflict(photo_id,analysis_type,analysis_version,source_fingerprint) do nothing
  returning id into v_id;
  if v_id is not null then
    return jsonb_build_object('stored',true,'reason','inserted','id',v_id);
  end if;
  select id,result_status into v_id,v_status
  from public.photo_analysis_results
  where photo_id=p_photo_id and analysis_type=p_analysis_type
    and analysis_version=p_analysis_version
    and source_fingerprint=p_source_fingerprint;
  if v_status='success' or p_result_status<>'success' then
    return jsonb_build_object(
      'stored',false,
      'reason',case when v_status='success' then 'success_immutable' else 'non_success_kept' end,
      'id',v_id,'result_status',v_status
    );
  end if;
  update public.photo_analysis_results set result_status='success',result=p_result
  where id=v_id and result_status<>'success';
  return jsonb_build_object('stored',true,'reason','replaced_non_success','id',v_id);
end;
$$;

create or replace function public.create_pet_family_invite(
  p_pet_id uuid, p_email text, p_token_hash text
) returns table(invite_id uuid, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(btrim(p_email));
  v_self_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_user is null or not public.is_pet_owner(p_pet_id)
     or not public.user_has_plus(v_user) then
    raise exception 'PLUSプランで家族を招待できます' using errcode = '42501';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or char_length(v_email) > 254 or v_email = v_self_email
     or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception '招待内容を確認してください' using errcode = 'P0001';
  end if;

  update public.pet_family_invites as invite
     set status = 'EXPIRED'
   where invite.pet_id = p_pet_id
     and invite.invitee_email = v_email
     and invite.status = 'PENDING'
     and invite.expires_at <= now();

  if exists (
    select 1 from public.pet_family_members member
    join auth.users invited_user on invited_user.id = member.user_id
    where member.pet_id = p_pet_id and lower(invited_user.email) = v_email
  ) or exists (
    select 1 from public.pet_family_invites invite
    where invite.pet_id = p_pet_id
      and invite.invitee_email = v_email
      and invite.status = 'PENDING'
      and invite.expires_at > now()
  ) then
    raise exception 'このメールアドレスには招待済みです' using errcode = '23505';
  end if;

  return query
    insert into public.pet_family_invites(
      pet_id, inviter_user_id, invitee_email, token_hash, expires_at
    ) values (p_pet_id, v_user, v_email, p_token_hash, now() + interval '7 days')
    returning pet_family_invites.id, pet_family_invites.expires_at;
end;
$$;

create or replace function public.accept_pet_family_invite(p_token_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_invite public.pet_family_invites%rowtype;
begin
  if v_user is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception '招待を確認できませんでした' using errcode = '42501';
  end if;
  select * into v_invite from public.pet_family_invites invite
   where invite.token_hash = p_token_hash for update;
  if not found or v_invite.status <> 'PENDING'
     or v_invite.expires_at <= now()
     or v_invite.invitee_email <> v_email
     or not public.pet_owner_has_plus(v_invite.pet_id) then
    if found and v_invite.status = 'PENDING' and v_invite.expires_at <= now() then
      update public.pet_family_invites set status = 'EXPIRED' where id = v_invite.id;
    end if;
    raise exception '招待を確認できませんでした' using errcode = 'P0001';
  end if;
  if v_invite.inviter_user_id = v_user then
    raise exception '招待を確認できませんでした' using errcode = 'P0001';
  end if;
  insert into public.pet_family_members(pet_id, user_id, role, invited_by)
  values(v_invite.pet_id, v_user, 'MEMBER', v_invite.inviter_user_id)
  on conflict (pet_id, user_id) do nothing;
  update public.pet_family_invites
     set status = 'ACCEPTED', accepted_by = v_user, accepted_at = now()
   where id = v_invite.id;
  return v_invite.pet_id;
end;
$$;

drop policy if exists "Users can upload photos for accessible pets" on storage.objects;
drop policy if exists "Users can delete photos for accessible pets" on storage.objects;
create policy "Users can upload photos for entitled pets" on storage.objects
for insert to authenticated with check (
  bucket_id = 'pet-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and public.can_contribute_to_pet((storage.foldername(name))[2]::uuid)
  and lower(storage.extension(name)) in ('jpg','png','webp')
);
create policy "Users can delete photos for entitled pets" on storage.objects
for delete to authenticated using (
  bucket_id = 'pet-photos'
  and (
    public.is_pet_owner((storage.foldername(name))[2]::uuid)
    or (
      (storage.foldername(name))[1] = (select auth.uid()::text)
      and public.can_contribute_to_pet((storage.foldername(name))[2]::uuid)
    )
  )
);

drop policy if exists "Users can upload thumbnails for accessible pets" on storage.objects;
drop policy if exists "Users can delete thumbnails for accessible pets" on storage.objects;
create policy "Users can upload thumbnails for entitled pets" on storage.objects
for insert to authenticated with check (
  bucket_id = 'pet-photo-thumbnails'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and public.can_contribute_to_pet((storage.foldername(name))[2]::uuid)
  and lower(storage.extension(name)) = 'webp'
);
create policy "Users can delete thumbnails for entitled pets" on storage.objects
for delete to authenticated using (
  bucket_id = 'pet-photo-thumbnails'
  and (
    public.is_pet_owner((storage.foldername(name))[2]::uuid)
    or (
      (storage.foldername(name))[1] = (select auth.uid()::text)
      and public.can_contribute_to_pet((storage.foldername(name))[2]::uuid)
    )
  )
);

create function public.sync_user_subscription_from_stripe(
  p_user_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_status text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_event_id text,
  p_event_created bigint
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_plan text;
begin
  if p_user_id is null
     or p_customer_id is null or char_length(p_customer_id) not between 3 and 255
     or p_subscription_id is null or char_length(p_subscription_id) not between 3 and 255
     or p_status not in (
       'trialing', 'active', 'past_due', 'canceled', 'unpaid',
       'incomplete', 'incomplete_expired', 'paused'
     )
     or p_event_id is null or char_length(p_event_id) not between 3 and 255
     or p_event_created < 1 then
    raise exception 'Invalid subscription event' using errcode = 'P0001';
  end if;

  v_plan := case when p_status in ('trialing', 'active') then 'PLUS' else 'FREE' end;

  insert into public.user_subscriptions(
    user_id, plan, status, stripe_customer_id, stripe_subscription_id,
    current_period_end, cancel_at_period_end, stripe_event_created_at,
    last_stripe_event_id
  ) values (
    p_user_id, v_plan, p_status, p_customer_id, p_subscription_id,
    p_current_period_end, coalesce(p_cancel_at_period_end, false),
    p_event_created, p_event_id
  )
  on conflict (user_id) do update set
    plan = excluded.plan,
    status = excluded.status,
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    stripe_event_created_at = excluded.stripe_event_created_at,
    last_stripe_event_id = excluded.last_stripe_event_id
  where public.user_subscriptions.stripe_event_created_at <= excluded.stripe_event_created_at;
end;
$$;

revoke all on function public.sync_user_subscription_from_stripe(
  uuid,text,text,text,timestamptz,boolean,text,bigint
) from public, anon, authenticated;
grant execute on function public.sync_user_subscription_from_stripe(
  uuid,text,text,text,timestamptz,boolean,text,bigint
) to service_role;

commit;
