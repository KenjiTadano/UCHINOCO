-- Task042-2: prevent deleting a registration pet while its photos have other
-- pet relations. Keep the existing photo deletion and Storage cleanup paths.
create function public.protect_related_pet_photos()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- DELETE holds the pet row lock. Relation writers lock both owner-pet rows
  -- FOR SHARE, so an addition cannot slip between this check and the cascade.
  -- Definer access sees every secondary relation, independent of SELECT RLS.
  if exists (
    select 1 from public.photos p
    join public.photo_pets r on r.photo_id = p.id
    where p.pet_id = old.id and r.pet_id <> old.id
  ) then
    raise exception using errcode = 'P0422', message = 'Pet has photos related to other pets';
  end if;
  return old;
end;
$$;
revoke all on function public.protect_related_pet_photos() from public, anon, authenticated, service_role;
create trigger protect_related_pet_photos before delete on public.pets
for each row execute function public.protect_related_pet_photos();
