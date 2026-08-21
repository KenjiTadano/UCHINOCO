create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  species text not null constraint pets_species_check check (species in ('dog', 'cat')),
  breed text,
  gender text constraint pets_gender_check check (gender in ('male', 'female', 'unknown')),
  birthday date,
  adoption_date date,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pets_owner_user_id_idx on public.pets using btree (owner_user_id);

alter table public.profiles enable row level security;
alter table public.pets enable row level security;

create policy "Users can view their own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "Users can view their own pets"
on public.pets
for select
to authenticated
using ((select auth.uid()) = owner_user_id);

create policy "Users can create their own pets"
on public.pets
for insert
to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy "Users can update their own pets"
on public.pets
for update
to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy "Users can delete their own pets"
on public.pets
for delete
to authenticated
using ((select auth.uid()) = owner_user_id);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger set_pets_updated_at
before update on public.pets
for each row execute function public.set_updated_at();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, created_at, updated_at)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    now(),
    now()
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.pets to authenticated;
