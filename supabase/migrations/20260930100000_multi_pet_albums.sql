-- Multi-pet album selection. Keep albums.pet_id as the route/order anchor.
begin;

do $$
begin
  if exists (
    select 1
      from public.albums a
      join public.pets p on p.id = a.pet_id
     where a.owner_user_id <> p.owner_user_id
  ) then
    raise exception 'Album and anchor pet ownership mismatch; repair before applying multi-pet albums';
  end if;
end;
$$;

create table public.album_pets (
  album_id uuid not null references public.albums(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (album_id, pet_id)
);

create index album_pets_pet_album_idx on public.album_pets (pet_id, album_id);

alter table public.album_pets enable row level security;
revoke all on public.album_pets from public, anon, authenticated;
grant select, insert on public.album_pets to authenticated;

create policy "album_pets: owner select"
  on public.album_pets for select
  using (
    exists (
      select 1 from public.albums a
      join public.pets p on p.id = album_pets.pet_id
      where a.id = album_pets.album_id
        and a.owner_user_id = (select auth.uid())
        and p.owner_user_id = (select auth.uid())
    )
  );

create policy "album_pets: owner insert"
  on public.album_pets for insert
  with check (
    exists (
      select 1 from public.albums a
      join public.pets p on p.id = album_pets.pet_id
      where a.id = album_pets.album_id
        and a.owner_user_id = (select auth.uid())
        and p.owner_user_id = (select auth.uid())
    )
  );

insert into public.album_pets (album_id, pet_id)
select id, pet_id from public.albums
on conflict (album_id, pet_id) do nothing;

create function public.add_album_anchor_pet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.pets p
     where p.id = new.pet_id
       and p.owner_user_id = new.owner_user_id
  ) then
    raise exception 'Album anchor pet must belong to its owner';
  end if;
  insert into public.album_pets (album_id, pet_id)
  values (new.id, new.pet_id)
  on conflict (album_id, pet_id) do nothing;
  return new;
end;
$$;

revoke all on function public.add_album_anchor_pet() from public, anon, authenticated;
create trigger albums_add_anchor_pet
  after insert on public.albums
  for each row execute function public.add_album_anchor_pet();

create function public.check_album_photo_pet_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select a.owner_user_id into v_owner
    from public.albums a
   where a.id = new.album_id;

  if not exists (
    select 1
      from public.photos p
      join public.album_pets ap on ap.pet_id = p.pet_id
     where p.id = new.photo_id
       and ap.album_id = new.album_id
       and p.uploader_user_id = v_owner
  ) then
    raise exception 'この写真はこのアルバムに使えません' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.check_album_photo_pet_membership() from public, anon, authenticated;
create trigger album_photos_selected_pet_guard
  before insert or update on public.album_photos
  for each row execute function public.check_album_photo_pet_membership();

create function public.check_album_cover_pet_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cover_photo_id is null then
    return new;
  end if;
  if tg_op = 'INSERT' and not exists (
    select 1 from public.photos p
     where p.id = new.cover_photo_id
       and p.pet_id = new.pet_id
       and p.uploader_user_id = new.owner_user_id
  ) then
    raise exception 'この写真はこのアルバムに使えません' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and not exists (
    select 1 from public.photos p
    join public.album_pets ap on ap.pet_id = p.pet_id
     where p.id = new.cover_photo_id
       and ap.album_id = new.id
       and p.uploader_user_id = new.owner_user_id
  ) then
    raise exception 'この写真はこのアルバムに使えません' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.check_album_cover_pet_membership() from public, anon, authenticated;
create trigger albums_selected_cover_pet_guard
  before insert or update on public.albums
  for each row execute function public.check_album_cover_pet_membership();

create or replace function public.check_draft_frame_photo_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_album_id uuid;
  v_owner uuid;
begin
  select a.id, a.owner_user_id into v_album_id, v_owner
    from public.album_draft_spreads s
    join public.album_draft_versions v on v.id = s.draft_version_id
    join public.albums a on a.id = v.album_id
   where s.id = new.draft_spread_id;

  if not exists (
    select 1 from public.photos p
    join public.album_pets ap on ap.pet_id = p.pet_id
     where p.id = new.ai_photo_id
       and ap.album_id = v_album_id
       and p.uploader_user_id = v_owner
  ) then
    raise exception 'この写真はこのアルバムに使えません' using errcode = 'P0001';
  end if;

  if new.user_photo_id is not null and not exists (
    select 1 from public.photos p
    join public.album_pets ap on ap.pet_id = p.pet_id
     where p.id = new.user_photo_id
       and ap.album_id = v_album_id
       and p.uploader_user_id = v_owner
  ) then
    raise exception 'この写真はこのアルバムに使えません' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create or replace function public.check_draft_cover_photo_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_album_id uuid;
  v_owner uuid;
begin
  select a.id, a.owner_user_id into v_album_id, v_owner
    from public.album_draft_versions v
    join public.albums a on a.id = v.album_id
   where v.id = new.draft_version_id;

  if new.ai_photo_id is not null and not exists (
    select 1 from public.photos p
    join public.album_pets ap on ap.pet_id = p.pet_id
     where p.id = new.ai_photo_id
       and ap.album_id = v_album_id
       and p.uploader_user_id = v_owner
  ) then
    raise exception 'この写真はこのアルバムに使えません' using errcode = 'P0001';
  end if;

  if new.user_photo_id is not null and not exists (
    select 1 from public.photos p
    join public.album_pets ap on ap.pet_id = p.pet_id
     where p.id = new.user_photo_id
       and ap.album_id = v_album_id
       and p.uploader_user_id = v_owner
  ) then
    raise exception 'この写真はこのアルバムに使えません' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

commit;