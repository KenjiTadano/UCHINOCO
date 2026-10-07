-- Task070: pet-scoped family sharing, invitation lifecycle, and family activity.
-- Product clients stay on the authenticated role; no service-role bypass is used.
begin;

create table public.pet_family_members (
  pet_id uuid not null references public.pets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('OWNER', 'MEMBER')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (pet_id, user_id)
);

create index pet_family_members_user_pet_idx
  on public.pet_family_members(user_id, pet_id);

insert into public.pet_family_members(pet_id, user_id, role)
select id, owner_user_id, 'OWNER' from public.pets
on conflict (pet_id, user_id) do update set role = 'OWNER';

create function public.sync_pet_owner_family_member()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.owner_user_id is distinct from new.owner_user_id then
    delete from public.pet_family_members
    where pet_id = new.id and user_id = old.owner_user_id and role = 'OWNER';
  end if;
  insert into public.pet_family_members(pet_id, user_id, role)
  values (new.id, new.owner_user_id, 'OWNER')
  on conflict (pet_id, user_id) do update set role = 'OWNER';
  return new;
end;
$$;
revoke all on function public.sync_pet_owner_family_member() from public, anon, authenticated;
create trigger pets_sync_family_owner
  after insert or update of owner_user_id on public.pets
  for each row execute function public.sync_pet_owner_family_member();

create function public.is_pet_owner(p_pet_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.pets p
    where p.id = p_pet_id and p.owner_user_id = (select auth.uid())
  );
$$;

create function public.can_access_pet(p_pet_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.pets p
    where p.id = p_pet_id and p.owner_user_id = (select auth.uid())
  ) or exists (
    select 1 from public.pet_family_members m
    where m.pet_id = p_pet_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_owned_pet(pet_id_text text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_pet_owner(pet_id_text::uuid)
  where pet_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
$$;

create function public.is_accessible_pet(pet_id_text text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_access_pet(pet_id_text::uuid)
  where pet_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
$$;

revoke all on function public.is_pet_owner(uuid) from public, anon;
revoke all on function public.can_access_pet(uuid) from public, anon;
revoke all on function public.is_accessible_pet(text) from public, anon;
grant execute on function public.is_pet_owner(uuid) to authenticated;
grant execute on function public.can_access_pet(uuid) to authenticated;
grant execute on function public.is_accessible_pet(text) to authenticated;

alter table public.pet_family_members enable row level security;
revoke all on public.pet_family_members from public, anon, authenticated;
grant select on public.pet_family_members to authenticated;
create policy "family members: participant select"
  on public.pet_family_members for select to authenticated
  using (public.can_access_pet(pet_id));

create table public.pet_family_invites (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  inviter_user_id uuid not null references auth.users(id) on delete cascade,
  invitee_email text not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
  expires_at timestamptz not null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index pet_family_invites_pending_email_idx
  on public.pet_family_invites(pet_id, invitee_email)
  where status = 'PENDING';
create index pet_family_invites_pet_created_idx
  on public.pet_family_invites(pet_id, created_at desc);
create trigger set_pet_family_invites_updated_at
  before update on public.pet_family_invites
  for each row execute function public.set_updated_at();
alter table public.pet_family_invites enable row level security;
revoke all on public.pet_family_invites from public, anon, authenticated;
grant select on public.pet_family_invites to authenticated;
create policy "family invites: owner select"
  on public.pet_family_invites for select to authenticated
  using (public.is_pet_owner(pet_id));

create table public.pet_family_activity_reads (
  pet_id uuid not null references public.pets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default 'epoch'::timestamptz,
  updated_at timestamptz not null default now(),
  primary key (pet_id, user_id)
);
alter table public.pet_family_activity_reads enable row level security;
revoke all on public.pet_family_activity_reads from public, anon, authenticated;
grant select on public.pet_family_activity_reads to authenticated;
create policy "family activity reads: own select"
  on public.pet_family_activity_reads for select to authenticated
  using (user_id = (select auth.uid()) and public.can_access_pet(pet_id));

create function public.create_pet_family_invite(
  p_pet_id uuid, p_email text, p_token_hash text
) returns table(invite_id uuid, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(btrim(p_email));
  v_self_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_user is null or not public.is_pet_owner(p_pet_id) then
    raise exception '招待を作成できません' using errcode = '42501';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or char_length(v_email) > 254 or v_email = v_self_email
     or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception '招待内容を確認してください' using errcode = 'P0001';
  end if;

  update public.pet_family_invites
     set status = 'EXPIRED'
   where pet_id = p_pet_id and invitee_email = v_email
     and status = 'PENDING' and expires_at <= now();

  if exists (
    select 1 from public.pet_family_members m
    join auth.users u on u.id = m.user_id
    where m.pet_id = p_pet_id and lower(u.email) = v_email
  ) or exists (
    select 1 from public.pet_family_invites i
    where i.pet_id = p_pet_id and i.invitee_email = v_email
      and i.status = 'PENDING' and i.expires_at > now()
  ) then
    raise exception 'このメールアドレスには招待済みです' using errcode = '23505';
  end if;

  return query
    insert into public.pet_family_invites(
      pet_id, inviter_user_id, invitee_email, token_hash, expires_at
    ) values (p_pet_id, v_user, v_email, p_token_hash, now() + interval '7 days')
    returning id, pet_family_invites.expires_at;
end;
$$;

create function public.accept_pet_family_invite(p_token_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_invite public.pet_family_invites%rowtype;
begin
  if v_user is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception '招待を確認できませんでした' using errcode = '42501';
  end if;
  select * into v_invite from public.pet_family_invites
   where token_hash = p_token_hash for update;
  if not found or v_invite.status <> 'PENDING'
     or v_invite.expires_at <= now()
     or v_invite.invitee_email <> v_email then
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

create function public.revoke_pet_family_invite(p_invite_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_pet uuid;
begin
  select pet_id into v_pet from public.pet_family_invites where id = p_invite_id for update;
  if v_pet is null or not public.is_pet_owner(v_pet) then
    raise exception '招待を変更できません' using errcode = '42501';
  end if;
  update public.pet_family_invites set status = 'REVOKED'
   where id = p_invite_id and status = 'PENDING';
  return found;
end;
$$;

create function public.remove_pet_family_member(p_pet_id uuid, p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_removed boolean;
begin
  if not public.is_pet_owner(p_pet_id) then
    raise exception 'メンバーを変更できません' using errcode = '42501';
  end if;
  delete from public.pet_family_members
   where pet_id = p_pet_id and user_id = p_user_id and role = 'MEMBER';
  v_removed := found;
  delete from public.pet_family_activity_reads
   where pet_id = p_pet_id and user_id = p_user_id;
  return v_removed;
end;
$$;

create function public.mark_pet_family_activity_seen(p_pet_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_access_pet(p_pet_id) then
    raise exception '思い出を確認できません' using errcode = '42501';
  end if;
  insert into public.pet_family_activity_reads(pet_id, user_id, last_seen_at)
  values(p_pet_id, auth.uid(), now())
  on conflict (pet_id, user_id) do update
    set last_seen_at = excluded.last_seen_at, updated_at = now();
end;
$$;

create function public.get_family_new_photo_activity(p_pet_ids uuid[] default null)
returns table(pet_id uuid, photo_count bigint, latest_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.pet_id, count(*)::bigint, max(p.created_at)
  from public.photos p
  left join public.pet_family_activity_reads r
    on r.pet_id = p.pet_id and r.user_id = (select auth.uid())
  where auth.uid() is not null
    and public.can_access_pet(p.pet_id)
    and (p_pet_ids is null or p.pet_id = any(p_pet_ids))
    and p.uploader_user_id <> (select auth.uid())
    and p.created_at > coalesce(r.last_seen_at, 'epoch'::timestamptz)
  group by p.pet_id;
$$;

revoke all on function public.create_pet_family_invite(uuid,text,text) from public, anon;
revoke all on function public.accept_pet_family_invite(text) from public, anon;
revoke all on function public.revoke_pet_family_invite(uuid) from public, anon;
revoke all on function public.remove_pet_family_member(uuid,uuid) from public, anon;
revoke all on function public.mark_pet_family_activity_seen(uuid) from public, anon;
revoke all on function public.get_family_new_photo_activity(uuid[]) from public, anon;
grant execute on function public.create_pet_family_invite(uuid,text,text) to authenticated;
grant execute on function public.accept_pet_family_invite(text) to authenticated;
grant execute on function public.revoke_pet_family_invite(uuid) to authenticated;
grant execute on function public.remove_pet_family_member(uuid,uuid) to authenticated;
grant execute on function public.mark_pet_family_activity_seen(uuid) to authenticated;
grant execute on function public.get_family_new_photo_activity(uuid[]) to authenticated;

-- Pet rows remain owner-mutable; accepted family members gain SELECT only.
create policy "pets: family member select"
  on public.pets for select to authenticated
  using (public.can_access_pet(id));

drop policy if exists "Users can view photos for their own pets" on public.photos;
drop policy if exists "Users can create photos for their own pets" on public.photos;
drop policy if exists "Users can update photos for their own pets" on public.photos;
drop policy if exists "Users can delete photos for their own pets" on public.photos;
create policy "photos: family select" on public.photos for select to authenticated
  using (public.can_access_pet(pet_id));
create policy "photos: family insert" on public.photos for insert to authenticated
  with check (uploader_user_id = (select auth.uid()) and public.can_access_pet(pet_id));
create policy "photos: uploader update" on public.photos for update to authenticated
  using (uploader_user_id = (select auth.uid()) and public.can_access_pet(pet_id))
  with check (uploader_user_id = (select auth.uid()) and public.can_access_pet(pet_id));
create policy "photos: uploader or owner delete" on public.photos for delete to authenticated
  using (public.can_access_pet(pet_id) and (
    uploader_user_id = (select auth.uid()) or public.is_pet_owner(pet_id)
  ));

create policy "photo_pets: family select" on public.photo_pets for select to authenticated
  using (public.can_access_pet(pet_id) and exists (
    select 1 from public.photos p where p.id = photo_pets.photo_id
      and public.can_access_pet(p.pet_id)
  ));

-- The primary photo relation is created by a trigger. Its original guard
-- assumed uploader == pet owner, which would reject every valid member upload.
create or replace function public.guard_photo_pet_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_primary uuid; v_uploader uuid;
begin
  if tg_op='UPDATE' then
    if new.photo_id is distinct from old.photo_id or new.pet_id is distinct from old.pet_id
       or new.source is distinct from old.source then
      raise exception 'Photo relation identity is immutable';
    end if;
    new.created_at := old.created_at;
  else
    new.created_at := now(); new.updated_at := now();
  end if;
  select p.pet_id,p.uploader_user_id into v_primary,v_uploader
  from public.photos p where p.id=new.photo_id for share;
  if not found then raise exception 'Invalid photo relation'; end if;
  perform pet.id from public.pets pet where pet.id in(v_primary,new.pet_id) order by pet.id for share;
  if not exists (
    select 1 from public.pets pet where pet.id=v_primary and (
      pet.owner_user_id=v_uploader or exists (
        select 1 from public.pet_family_members m where m.pet_id=pet.id and m.user_id=v_uploader
      )
    )
  ) or not exists (
    select 1 from public.pets pet where pet.id=new.pet_id and (
      pet.owner_user_id=v_uploader or exists (
        select 1 from public.pet_family_members m where m.pet_id=pet.id and m.user_id=v_uploader
      )
    )
  ) or ((new.source='primary') <> (new.pet_id=v_primary)) then
    raise exception 'Invalid photo relation';
  end if;
  return new;
end;
$$;

create policy "photo analyses: family select" on public.photo_ai_analyses for select to authenticated
  using (exists (select 1 from public.photos p
    where p.id = photo_ai_analyses.photo_id and public.can_access_pet(p.pet_id)));
create policy "photo analyses: uploader insert" on public.photo_ai_analyses for insert to authenticated
  with check (exists (select 1 from public.photos p
    where p.id = photo_ai_analyses.photo_id and p.uploader_user_id = (select auth.uid())
      and public.can_access_pet(p.pet_id)));
create policy "photo analyses: uploader update" on public.photo_ai_analyses for update to authenticated
  using (exists (select 1 from public.photos p
    where p.id = photo_ai_analyses.photo_id and p.uploader_user_id = (select auth.uid())
      and public.can_access_pet(p.pet_id)))
  with check (exists (select 1 from public.photos p
    where p.id = photo_ai_analyses.photo_id and p.uploader_user_id = (select auth.uid())
      and public.can_access_pet(p.pet_id)));
create policy "analysis results: family select" on public.photo_analysis_results for select to authenticated
  using (exists (select 1 from public.photos p
    where p.id = photo_analysis_results.photo_id and public.can_access_pet(p.pet_id)));

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
  select p.pet_id,p.uploader_user_id,pet.owner_user_id into v_pet,v_uploader,v_owner
  from public.photos p join public.pets pet on pet.id=p.pet_id where p.id=p_photo_id;
  if v_pet is null or (v_uploader<>(select auth.uid()) and v_owner<>(select auth.uid()))
     or not public.can_access_pet(v_pet) then
    raise exception '写真を読み込めませんでした' using errcode='42501';
  end if;
  insert into public.photo_analysis_results(photo_id,analysis_type,analysis_version,source_fingerprint,result_status,result)
  values(p_photo_id,p_analysis_type,p_analysis_version,p_source_fingerprint,p_result_status,p_result)
  on conflict(photo_id,analysis_type,analysis_version,source_fingerprint) do nothing returning id into v_id;
  if v_id is not null then return jsonb_build_object('stored',true,'reason','inserted','id',v_id); end if;
  select id,result_status into v_id,v_status from public.photo_analysis_results
  where photo_id=p_photo_id and analysis_type=p_analysis_type and analysis_version=p_analysis_version
    and source_fingerprint=p_source_fingerprint;
  if v_status='success' or p_result_status<>'success' then
    return jsonb_build_object('stored',false,'reason',case when v_status='success' then 'success_immutable' else 'non_success_kept' end,'id',v_id,'result_status',v_status);
  end if;
  update public.photo_analysis_results set result_status='success',result=p_result
  where id=v_id and result_status<>'success';
  return jsonb_build_object('stored',true,'reason','replaced_non_success','id',v_id);
end;
$$;

create function public.can_access_album(p_album_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.albums a where a.id = p_album_id
      and (a.owner_user_id = (select auth.uid()) or exists (
        select 1 from public.album_pets ap
        where ap.album_id = a.id and public.can_access_pet(ap.pet_id)
      ))
  );
$$;
revoke all on function public.can_access_album(uuid) from public, anon;
grant execute on function public.can_access_album(uuid) to authenticated;

create policy "albums: family select" on public.albums for select to authenticated
  using (public.can_access_album(id));
create policy "album_pets: family select" on public.album_pets for select to authenticated
  using (public.can_access_album(album_id));
create policy "album_photos: family select" on public.album_photos for select to authenticated
  using (public.can_access_album(album_id));
create policy "album draft versions: family select" on public.album_draft_versions for select to authenticated
  using (public.can_access_album(album_id));
create policy "album draft spreads: family select" on public.album_draft_spreads for select to authenticated
  using (exists (select 1 from public.album_draft_versions v
    where v.id = album_draft_spreads.draft_version_id and public.can_access_album(v.album_id)));
create policy "album draft frames: family select" on public.album_draft_frames for select to authenticated
  using (exists (select 1 from public.album_draft_spreads s
    join public.album_draft_versions v on v.id = s.draft_version_id
    where s.id = album_draft_frames.draft_spread_id and public.can_access_album(v.album_id)));
create policy "album draft covers: family select" on public.album_draft_covers for select to authenticated
  using (exists (select 1 from public.album_draft_versions v
    where v.id=album_draft_covers.draft_version_id and public.can_access_album(v.album_id)));
create policy "album draft text: family select" on public.album_draft_text_elements for select to authenticated
  using (exists (select 1 from public.album_draft_spreads s
    join public.album_draft_versions v on v.id=s.draft_version_id
    where s.id=album_draft_text_elements.draft_spread_id and public.can_access_album(v.album_id)));
create policy "album draft decorations: family select" on public.album_draft_decorations for select to authenticated
  using (exists (select 1 from public.album_draft_spreads s
    join public.album_draft_versions v on v.id=s.draft_version_id
    where s.id=album_draft_decorations.draft_spread_id and public.can_access_album(v.album_id)));
create policy "album page elements: family select" on public.album_draft_page_elements for select to authenticated
  using (exists (select 1 from public.album_draft_spreads s
    join public.album_draft_versions v on v.id=s.draft_version_id
    where s.id=album_draft_page_elements.draft_spread_id and public.can_access_album(v.album_id)));
create policy "album backgrounds: family select" on public.album_draft_spread_backgrounds for select to authenticated
  using (exists (select 1 from public.album_draft_spreads s
    join public.album_draft_versions v on v.id=s.draft_version_id
    where s.id=album_draft_spread_backgrounds.draft_spread_id and public.can_access_album(v.album_id)));
create policy "album text suggestions: family select" on public.album_text_suggestions for select to authenticated
  using (exists (select 1 from public.album_draft_spreads s
    join public.album_draft_versions v on v.id=s.draft_version_id
    where s.id=album_text_suggestions.draft_spread_id and public.can_access_album(v.album_id)));

-- Private Storage: upload paths are always caller-prefixed. Reads are pet scoped;
-- deletes are restricted to the uploader path or the pet owner.
drop policy if exists "Users can upload avatars for their own pets" on storage.objects;
drop policy if exists "Users can view avatars for their own pets" on storage.objects;
drop policy if exists "Users can delete avatars for their own pets" on storage.objects;
create policy "Users can upload avatars for their own pets" on storage.objects
for insert to authenticated with check (
  bucket_id = 'pet-avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and public.is_owned_pet((storage.foldername(name))[2])
  and lower(storage.extension(name)) in ('jpg','png','webp')
);
create policy "Users can view avatars for accessible pets" on storage.objects
for select to authenticated using (
  bucket_id = 'pet-avatars' and public.is_accessible_pet((storage.foldername(name))[2])
);
create policy "Users can delete avatars for their own pets" on storage.objects
for delete to authenticated using (
  bucket_id = 'pet-avatars' and public.is_owned_pet((storage.foldername(name))[2])
);

drop policy if exists "Users can upload photos for their own pets" on storage.objects;
drop policy if exists "Users can view photos for their own pets" on storage.objects;
drop policy if exists "Users can delete photos for their own pets" on storage.objects;
create policy "Users can upload photos for accessible pets" on storage.objects
for insert to authenticated with check (
  bucket_id = 'pet-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and public.is_accessible_pet((storage.foldername(name))[2])
  and lower(storage.extension(name)) in ('jpg','png','webp')
);
create policy "Users can view photos for accessible pets" on storage.objects
for select to authenticated using (
  bucket_id = 'pet-photos' and public.is_accessible_pet((storage.foldername(name))[2])
);
create policy "Users can delete photos for accessible pets" on storage.objects
for delete to authenticated using (
  bucket_id = 'pet-photos' and public.is_accessible_pet((storage.foldername(name))[2])
  and ((storage.foldername(name))[1] = (select auth.uid()::text)
       or public.is_pet_owner((storage.foldername(name))[2]::uuid))
);

drop policy if exists "Users can upload thumbnails for their own pets" on storage.objects;
drop policy if exists "Users can view thumbnails for their own pets" on storage.objects;
drop policy if exists "Users can delete thumbnails for their own pets" on storage.objects;
create policy "Users can upload thumbnails for accessible pets" on storage.objects
for insert to authenticated with check (
  bucket_id = 'pet-photo-thumbnails'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and public.is_accessible_pet((storage.foldername(name))[2])
  and lower(storage.extension(name)) = 'webp'
);
create policy "Users can view thumbnails for accessible pets" on storage.objects
for select to authenticated using (
  bucket_id = 'pet-photo-thumbnails' and public.is_accessible_pet((storage.foldername(name))[2])
);
create policy "Users can delete thumbnails for accessible pets" on storage.objects
for delete to authenticated using (
  bucket_id = 'pet-photo-thumbnails' and public.is_accessible_pet((storage.foldername(name))[2])
  and ((storage.foldername(name))[1] = (select auth.uid()::text)
       or public.is_pet_owner((storage.foldername(name))[2]::uuid))
);

-- Family-readable pagination/search. All functions remain SECURITY INVOKER so
-- the table RLS above is still the final boundary.
create or replace function public.get_pet_memories_page(p_pet_id uuid, p_limit integer default 30,
  p_cursor_at timestamptz default null, p_cursor_id uuid default null, p_favorite_only boolean default false)
returns table (id uuid, pet_id uuid, storage_path text, thumbnail_path text,
  taken_at timestamptz, created_at timestamptz, caption text, favorite boolean, timeline_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.pet_id, p.storage_path, p.thumbnail_path, p.taken_at,
    p.created_at, p.caption, p.favorite, p.timeline_at
  from public.photos p
  where public.can_access_pet(p_pet_id)
    and (p.pet_id = p_pet_id or exists (
      select 1 from public.photo_pets r where r.photo_id = p.id
        and r.pet_id = p_pet_id and r.confirmed_by_user and r.source <> 'primary'
    ))
    and (not coalesce(p_favorite_only, false) or p.favorite)
    and (p_cursor_at is null or (p.timeline_at, p.id) < (p_cursor_at, p_cursor_id))
  order by p.timeline_at desc, p.id desc
  limit least(greatest(coalesce(p_limit,30),1),61);
$$;

create or replace function public.get_dashboard_photos(p_favorite_only boolean default false, p_limit integer default 6)
returns table (id uuid, pet_id uuid, storage_path text, thumbnail_path text, taken_at timestamptz, created_at timestamptz, favorite boolean, timeline_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.pet_id, p.storage_path, p.thumbnail_path, p.taken_at, p.created_at, p.favorite, p.timeline_at
  from public.photos p
  where public.can_access_pet(p.pet_id) and (not p_favorite_only or p.favorite)
  order by p.timeline_at desc, p.id desc limit least(greatest(p_limit, 1), 6);
$$;

create or replace function public.get_search_facets(p_pet_id uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with accessible as materialized (
    select p.id, p.pet_id, pet.name as pet_name, p.favorite,
      a.id as analysis_id, a.tags, a.activity, a.scene, a.emotion
    from public.photos p join public.pets pet on pet.id = p.pet_id
    left join public.photo_ai_analyses a on a.photo_id = p.id and a.status = 'completed'
    where public.can_access_pet(p.pet_id)
  ), scoped as materialized (
    select * from accessible where p_pet_id is null or pet_id = p_pet_id or exists (
      select 1 from public.photo_pets r where r.photo_id = accessible.id
        and r.pet_id = p_pet_id and r.confirmed_by_user and r.source <> 'primary'
    )
  ), word_counts as (
    select w.kind, w.value, count(*) as count
    from scoped s cross join lateral public.photo_search_words(s.tags, s.activity, s.scene, s.emotion) w
    where s.analysis_id is not null group by w.kind, w.value
  ), ranked as (
    select *, row_number() over (partition by kind order by count desc, value) as rank from word_counts
  ), pet_counts as (
    select target.id, target.name, counts.count
    from public.pets target cross join lateral (
      select count(*) as count from accessible a where a.pet_id = target.id or exists (
        select 1 from public.photo_pets r where r.photo_id = a.id
          and r.pet_id = target.id and r.confirmed_by_user and r.source <> 'primary'
      )
    ) counts
    where public.can_access_pet(target.id) and counts.count > 0
  )
  select jsonb_build_object(
    'words', coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'value',value,'count',count)
      order by kind,count desc,value) from ranked where rank <= case when kind='tag' then 20 else 8 end),'[]'::jsonb),
    'pets', coalesce((select jsonb_agg(to_jsonb(x) order by count desc,name,id)
      from (select * from pet_counts order by count desc,name,id limit 30) x),'[]'::jsonb),
    'total',(select count(*) from scoped),
    'completed',(select count(*) from scoped where analysis_id is not null),
    'favorites',(select count(*) from scoped where favorite)
  );
$$;

create or replace function public.search_photos_page(
  p_pet_id uuid default null, p_query text default null,
  p_kind text default null, p_value text default null,
  p_favorite_only boolean default false, p_from timestamptz default null, p_to timestamptz default null,
  p_limit integer default 36, p_cursor_at timestamptz default null, p_cursor_id uuid default null
) returns jsonb language sql stable security invoker set search_path = '' as $$
  with matching as materialized (
    select p.id,p.pet_id,pet.name as pet_name,p.storage_path,p.thumbnail_path,
      p.taken_at,p.created_at,p.caption,p.favorite,p.timeline_at,a.description
    from public.photos p join public.pets pet on pet.id=p.pet_id
    left join public.photo_ai_analyses a on a.photo_id=p.id and a.status='completed'
    where public.can_access_pet(p.pet_id)
      and (p_pet_id is null or p.pet_id=p_pet_id or exists (
        select 1 from public.photo_pets r where r.photo_id=p.id and r.pet_id=p_pet_id
          and r.confirmed_by_user and r.source<>'primary'))
      and (not coalesce(p_favorite_only,false) or p.favorite)
      and (p_from is null or p.timeline_at>=p_from) and (p_to is null or p.timeline_at<p_to)
      and (nullif(btrim(p_query),'') is null or (char_length(p_query)<=100 and (
        strpos(lower(coalesce(p.caption,'')),lower(btrim(p_query)))>0
        or strpos(lower(coalesce(a.description,'')),lower(btrim(p_query)))>0
        or strpos(lower(coalesce(a.activity,'')),lower(btrim(p_query)))>0
        or strpos(lower(coalesce(a.scene,'')),lower(btrim(p_query)))>0
        or strpos(lower(coalesce(a.emotion,'')),lower(btrim(p_query)))>0
        or exists(select 1 from unnest(coalesce(a.tags,'{}'::text[])) t
          where strpos(lower(t),lower(btrim(p_query)))>0))))
      and ((p_kind is null and p_value is null) or (
        p_kind in ('tag','activity','scene','emotion') and char_length(p_value) between 1 and 24
        and a.id is not null and exists(select 1 from public.photo_search_words(a.tags,a.activity,a.scene,a.emotion) w
          where w.kind=p_kind and w.value=public.normalize_search_word(p_value,p_kind))))
  ), page as (
    select * from matching where p_cursor_at is null or (timeline_at,id)<(p_cursor_at,p_cursor_id)
    order by timeline_at desc,id desc limit least(greatest(coalesce(p_limit,36),1),50)+1
  )
  select jsonb_build_object('total',(select count(*) from matching),
    'photos',coalesce((select jsonb_agg(to_jsonb(page) order by timeline_at desc,id desc) from page),'[]'::jsonb));
$$;

-- Album composition guards accept any photo belonging to an album pet. The
-- album itself remains owner-mutable; members only receive SELECT policies.
create or replace function public.check_album_photo_pet_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.photos p join public.album_pets ap on ap.pet_id=p.pet_id
    where p.id=new.photo_id and ap.album_id=new.album_id
  ) then raise exception 'この写真はこのアルバムに使えません' using errcode='P0001'; end if;
  return new;
end;
$$;

create or replace function public.check_album_cover_pet_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.cover_photo_id is null then return new; end if;
  if tg_op='INSERT' and not exists (
    select 1 from public.photos p where p.id=new.cover_photo_id and p.pet_id=new.pet_id
  ) then raise exception 'この写真はこのアルバムに使えません' using errcode='P0001'; end if;
  if tg_op='UPDATE' and not exists (
    select 1 from public.photos p join public.album_pets ap on ap.pet_id=p.pet_id
    where p.id=new.cover_photo_id and ap.album_id=new.id
  ) then raise exception 'この写真はこのアルバムに使えません' using errcode='P0001'; end if;
  return new;
end;
$$;

create or replace function public.check_draft_frame_photo_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_album_id uuid;
begin
  select a.id into v_album_id
  from public.album_draft_spreads s
  join public.album_draft_versions v on v.id=s.draft_version_id
  join public.albums a on a.id=v.album_id
  where s.id=new.draft_spread_id;
  if not exists (
    select 1 from public.photos p join public.album_pets ap on ap.pet_id=p.pet_id
    where p.id=new.ai_photo_id and ap.album_id=v_album_id
  ) then raise exception 'この写真はこのアルバムに使えません' using errcode='P0001'; end if;
  if new.user_photo_id is not null and not exists (
    select 1 from public.photos p join public.album_pets ap on ap.pet_id=p.pet_id
    where p.id=new.user_photo_id and ap.album_id=v_album_id
  ) then raise exception 'この写真はこのアルバムに使えません' using errcode='P0001'; end if;
  return new;
end;
$$;

create or replace function public.check_draft_cover_photo_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_album_id uuid;
begin
  select a.id into v_album_id from public.album_draft_versions v
  join public.albums a on a.id=v.album_id where v.id=new.draft_version_id;
  if new.ai_photo_id is not null and not exists (
    select 1 from public.photos p join public.album_pets ap on ap.pet_id=p.pet_id
    where p.id=new.ai_photo_id and ap.album_id=v_album_id
  ) then raise exception 'この写真はこのアルバムに使えません' using errcode='P0001'; end if;
  if new.user_photo_id is not null and not exists (
    select 1 from public.photos p join public.album_pets ap on ap.pet_id=p.pet_id
    where p.id=new.user_photo_id and ap.album_id=v_album_id
  ) then raise exception 'この写真はこのアルバムに使えません' using errcode='P0001'; end if;
  return new;
end;
$$;

commit;
