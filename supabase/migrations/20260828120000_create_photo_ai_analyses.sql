create table public.photo_ai_analyses (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null unique references public.photos (id) on delete cascade,
  status text not null constraint photo_ai_analyses_status_check
    check (status in ('pending', 'processing', 'completed', 'failed')),
  description text,
  tags text[] not null default '{}'::text[],
  activity text,
  scene text,
  emotion text,
  contains_pet boolean,
  model text,
  prompt_version text,
  error_code text,
  analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.photo_ai_analyses enable row level security;

create policy "Users can view analyses for their own pet photos"
on public.photo_ai_analyses
for select
to authenticated
using (
  exists (
    select 1
    from public.photos
    join public.pets on public.pets.id = public.photos.pet_id
    where public.photos.id = photo_ai_analyses.photo_id
      and public.pets.owner_user_id = (select auth.uid())
  )
);

create policy "Users can create analyses for their own pet photos"
on public.photo_ai_analyses
for insert
to authenticated
with check (
  exists (
    select 1
    from public.photos
    join public.pets on public.pets.id = public.photos.pet_id
    where public.photos.id = photo_ai_analyses.photo_id
      and public.pets.owner_user_id = (select auth.uid())
  )
);

create policy "Users can update analyses for their own pet photos"
on public.photo_ai_analyses
for update
to authenticated
using (
  exists (
    select 1
    from public.photos
    join public.pets on public.pets.id = public.photos.pet_id
    where public.photos.id = photo_ai_analyses.photo_id
      and public.pets.owner_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.photos
    join public.pets on public.pets.id = public.photos.pet_id
    where public.photos.id = photo_ai_analyses.photo_id
      and public.pets.owner_user_id = (select auth.uid())
  )
);

create trigger set_photo_ai_analyses_updated_at
before update on public.photo_ai_analyses
for each row execute function public.set_updated_at();

grant select, insert, update on table public.photo_ai_analyses to authenticated;
