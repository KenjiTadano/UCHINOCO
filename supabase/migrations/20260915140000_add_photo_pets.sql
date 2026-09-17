-- Task042-1: relations are metadata, never an authorization grant.
-- Explicit transaction required by CLI statement execution; keep lock and backfill atomic.
begin;
lock table public.photos, public.pets in share row exclusive mode;
do $$
begin
  if exists (
    select 1 from public.photos p join public.pets pet on pet.id = p.pet_id
    where p.uploader_user_id <> pet.owner_user_id
  ) then
    raise exception 'Photo ownership mismatch; repair before applying Task042-1';
  end if;
end;
$$;

create table public.photo_pets (
  photo_id uuid not null references public.photos(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  source text not null check (source in ('primary', 'user', 'ai')),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  confirmed_by_user boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (photo_id, pet_id),
  constraint photo_pets_non_ai_confidence check (source = 'ai' or confidence is null),
  constraint photo_pets_user_confirmed check (source <> 'user' or confirmed_by_user)
);
create index photo_pets_pet_photo_idx on public.photo_pets(pet_id, photo_id);
create unique index photo_pets_one_primary_idx on public.photo_pets(photo_id) where source = 'primary';

alter table public.photo_pets enable row level security;
revoke all on public.photo_pets from public, anon, authenticated;
grant select on public.photo_pets to authenticated;
create policy photo_pets_select_owned on public.photo_pets
for select to authenticated using (
  exists (
    select 1 from public.photos p
    join public.pets primary_pet on primary_pet.id = p.pet_id
    join public.pets target_pet on target_pet.id = photo_pets.pet_id
    where p.id = photo_pets.photo_id
      and p.uploader_user_id = (select auth.uid())
      and primary_pet.owner_user_id = (select auth.uid())
      and target_pet.owner_user_id = (select auth.uid())
  )
);
-- No INSERT/UPDATE/DELETE policies or grants: writes use the bounded RPCs below.

create function public.guard_photo_pet_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_primary uuid;
  v_uploader uuid;
begin
  if tg_op = 'UPDATE' then
    if new.photo_id is distinct from old.photo_id or new.pet_id is distinct from old.pet_id
       or new.source is distinct from old.source then
      raise exception 'Photo relation identity is immutable';
    end if;
    new.created_at := old.created_at;
  else
    new.created_at := now();
    new.updated_at := now();
  end if;
  select p.pet_id, p.uploader_user_id into v_primary, v_uploader
  from public.photos p where p.id = new.photo_id for share;
  if not found then
    raise exception 'Invalid photo relation';
  end if;
  -- Lock owner records for the duration of this write (including trusted writes).
  perform pet.id from public.pets pet
  where pet.id in (v_primary, new.pet_id) order by pet.id for share;
  if not exists (select 1 from public.pets pet where pet.id = v_primary and pet.owner_user_id = v_uploader)
     or not exists (select 1 from public.pets pet where pet.id = new.pet_id and pet.owner_user_id = v_uploader)
     or ((new.source = 'primary') <> (new.pet_id = v_primary)) then
    raise exception 'Invalid photo relation';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_photo_pet_write() from public, anon, authenticated;
create trigger guard_photo_pet_write before insert or update on public.photo_pets
for each row execute function public.guard_photo_pet_write();
create trigger set_photo_pets_updated_at before update on public.photo_pets
for each row execute function public.set_updated_at();

-- Keep the registration/ownership anchor stable; existing caption/favorite/etc.
-- updates are unaffected. A future primary-transfer feature needs its own design.
create function public.guard_photo_relation_anchor()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.pet_id is distinct from old.pet_id
     or new.uploader_user_id is distinct from old.uploader_user_id then
    raise exception 'Photo registration and uploader are immutable';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_photo_relation_anchor() from public, anon, authenticated;
create trigger guard_photo_relation_anchor before update of pet_id, uploader_user_id on public.photos
for each row execute function public.guard_photo_relation_anchor();

create function public.create_primary_photo_pet()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.photo_pets(photo_id, pet_id, source, confidence, confirmed_by_user)
  values (new.id, new.pet_id, 'primary', null, false);
  return new;
end;
$$;
revoke all on function public.create_primary_photo_pet() from public, anon, authenticated;
create trigger create_primary_photo_pet after insert on public.photos
for each row execute function public.create_primary_photo_pet();

-- Idempotent data operation: never overwrite a pre-existing relation or state.
insert into public.photo_pets(photo_id, pet_id, source, confidence, confirmed_by_user)
select id, pet_id, 'primary', null, false from public.photos
on conflict (photo_id, pet_id) do nothing;

do $$
begin
  if exists (
    select 1 from public.photos p where not exists (
      select 1 from public.photo_pets r
      where r.photo_id = p.id and r.pet_id = p.pet_id and r.source = 'primary'
    )
  ) then
    raise exception 'Missing primary photo relation';
  end if;
end;
$$;

create function public.get_photo_pets(p_photo_id uuid)
returns table (pet_id uuid, pet_name text, source text, confidence numeric, confirmed_by_user boolean)
language sql stable security invoker set search_path = '' as $$
  select r.pet_id, pet.name, r.source, r.confidence, r.confirmed_by_user
  from public.photo_pets r join public.pets pet on pet.id = r.pet_id
  where r.photo_id = p_photo_id
  order by (r.source = 'primary') desc, r.created_at, r.pet_id;
$$;
revoke all on function public.get_photo_pets(uuid) from public, anon, authenticated;
grant execute on function public.get_photo_pets(uuid) to authenticated;

-- Internal authorization boundary for mutations. No caller-supplied actor ID.
-- Lock photos first, then pets in ID order; every mutation uses the same order.
create function public.require_photo_pet_management(p_photo_id uuid, p_pet_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_primary uuid;
  v_uploader uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Photo relation operation not allowed';
  end if;
  select p.pet_id, p.uploader_user_id into v_primary, v_uploader
  from public.photos p where p.id = p_photo_id for update;
  if not found or v_uploader <> v_actor then
    raise exception using errcode = '42501', message = 'Photo relation operation not allowed';
  end if;
  perform pet.id from public.pets pet
  where pet.id in (v_primary, p_pet_id) order by pet.id for share;
  if not exists (select 1 from public.pets pet where pet.id = v_primary and pet.owner_user_id = v_actor)
     or not exists (select 1 from public.pets pet where pet.id = p_pet_id and pet.owner_user_id = v_actor) then
    raise exception using errcode = '42501', message = 'Photo relation operation not allowed';
  end if;
  return v_primary;
end;
$$;
revoke all on function public.require_photo_pet_management(uuid, uuid) from public, anon, authenticated;

create function public.add_photo_pet(p_photo_id uuid, p_pet_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_primary uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Photo relation operation not allowed';
  end if;
  v_primary := public.require_photo_pet_management(p_photo_id, p_pet_id);
  if p_pet_id = v_primary or exists (
    select 1 from public.photo_pets r where r.photo_id = p_photo_id and r.pet_id = p_pet_id and r.source <> 'user'
  ) then
    raise exception using errcode = '42501', message = 'Photo relation operation not allowed';
  end if;
  insert into public.photo_pets(photo_id, pet_id, source, confidence, confirmed_by_user)
  values (p_photo_id, p_pet_id, 'user', null, true)
  on conflict (photo_id, pet_id) do nothing;
end;
$$;
revoke all on function public.add_photo_pet(uuid, uuid) from public, anon, authenticated;
grant execute on function public.add_photo_pet(uuid, uuid) to authenticated;

create function public.remove_photo_pet(p_photo_id uuid, p_pet_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_primary uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Photo relation operation not allowed';
  end if;
  v_primary := public.require_photo_pet_management(p_photo_id, p_pet_id);
  if p_pet_id = v_primary then
    raise exception using errcode = '42501', message = 'Photo relation operation not allowed';
  end if;
  delete from public.photo_pets r
  where r.photo_id = p_photo_id and r.pet_id = p_pet_id and r.source <> 'primary';
end;
$$;
revoke all on function public.remove_photo_pet(uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_photo_pet(uuid, uuid) to authenticated;
-- No DELETE trigger: FK cascades must remain possible. No Storage operations.
-- Supabase installations may grant function execution to service_role by default.
-- Only authenticated gets the three public APIs; internal helpers are trigger/
-- definer-owner calls, not client APIs.
revoke all on function public.get_photo_pets(uuid),
  public.add_photo_pet(uuid, uuid), public.remove_photo_pet(uuid, uuid),
  public.require_photo_pet_management(uuid, uuid),
  public.guard_photo_pet_write(), public.guard_photo_relation_anchor(),
  public.create_primary_photo_pet() from service_role;
commit;
