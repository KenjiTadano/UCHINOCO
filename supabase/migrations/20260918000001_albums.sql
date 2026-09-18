-- Task044: albums + album_photos
-- albums owns the draft; album_photos owns the ordered photo list.
-- No service_role usage in product paths — all RLS security invoker.

begin;

create table public.albums (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  title text not null default '',
  status text not null default 'draft' check (status in ('draft', 'ready', 'ordered', 'archived')),
  period_from timestamptz,
  period_to timestamptz,
  cover_photo_id uuid references public.photos(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index albums_owner_pet_created_idx on public.albums (owner_user_id, pet_id, created_at desc);

-- Composite PK prevents duplicate photo per album.
-- position is 0-indexed; duplicates within an album are allowed transiently during bulk update only.
create table public.album_photos (
  album_id uuid not null references public.albums(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete cascade,
  position integer not null default 0,
  selected_by text not null default 'ai' check (selected_by in ('ai', 'user')),
  created_at timestamptz not null default now(),
  primary key (album_id, photo_id)
);

create index album_photos_album_position_idx on public.album_photos (album_id, position);

-- ── RLS: albums ─────────────────────────────────────────────────────────────
alter table public.albums enable row level security;

create policy "albums: owner select"
  on public.albums for select
  using (owner_user_id = auth.uid());

create policy "albums: owner insert"
  on public.albums for insert
  with check (owner_user_id = auth.uid());

create policy "albums: owner update"
  on public.albums for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "albums: owner delete"
  on public.albums for delete
  using (owner_user_id = auth.uid());

-- ── RLS: album_photos ────────────────────────────────────────────────────────
-- Access is gated through the parent album's owner_user_id — no direct uid column needed.
alter table public.album_photos enable row level security;

create policy "album_photos: album owner select"
  on public.album_photos for select
  using (
    exists (
      select 1 from public.albums a
      where a.id = album_photos.album_id
        and a.owner_user_id = auth.uid()
    )
  );

create policy "album_photos: album owner insert"
  on public.album_photos for insert
  with check (
    exists (
      select 1 from public.albums a
      where a.id = album_photos.album_id
        and a.owner_user_id = auth.uid()
    )
  );

create policy "album_photos: album owner update"
  on public.album_photos for update
  using (
    exists (
      select 1 from public.albums a
      where a.id = album_photos.album_id
        and a.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.albums a
      where a.id = album_photos.album_id
        and a.owner_user_id = auth.uid()
    )
  );

create policy "album_photos: album owner delete"
  on public.album_photos for delete
  using (
    exists (
      select 1 from public.albums a
      where a.id = album_photos.album_id
        and a.owner_user_id = auth.uid()
    )
  );

-- ── Helper: updated_at trigger ───────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger albums_updated_at
  before update on public.albums
  for each row execute function public.set_updated_at();

-- ── Helper: reorder RPC ──────────────────────────────────────────────────────
-- Accepts a JSON array of {photo_id, position} and bulk-updates positions for
-- the caller's album in a single round-trip. Validates album ownership inline.
create or replace function public.reorder_album_photos(
  p_album_id uuid,
  p_positions jsonb        -- [{photo_id: uuid, position: int}, ...]
)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_owner uuid;
  v_item jsonb;
begin
  -- ownership check (no service_role)
  select owner_user_id into v_owner
  from public.albums
  where id = p_album_id
    and owner_user_id = auth.uid();

  if v_owner is null then
    raise exception 'not found';
  end if;

  for v_item in select jsonb_array_elements(p_positions)
  loop
    update public.album_photos
    set position = (v_item->>'position')::integer
    where album_id = p_album_id
      and photo_id = (v_item->>'photo_id')::uuid;
  end loop;
end;
$$;

revoke all on function public.reorder_album_photos(uuid, jsonb) from public, anon, service_role;
grant execute on function public.reorder_album_photos(uuid, jsonb) to authenticated;

commit;
