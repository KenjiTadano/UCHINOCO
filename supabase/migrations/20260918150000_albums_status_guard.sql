-- Task046-2 Security hardening: prevent authenticated users from directly
-- changing albums.status via PostgREST.
--
-- Problem: "albums: owner update" RLS allows owners to UPDATE any column,
-- including status. An authenticated user could set ordered → draft to bypass
-- the album edit lock.
--
-- Fix: BEFORE UPDATE OF status trigger that blocks authenticated users.
--   auth.uid() is non-null  → PostgREST authenticated request → BLOCK
--   auth.uid() is null      → service_role (webhook/admin client)  → ALLOW
--
-- This preserves:
--   - mark_order_paid RPC (service_role): draft → ordered ✓
--   - Future server-side archival (service_role): ordered → archived ✓
-- Remote Supabase: NOT applied (migration file only).

begin;

create or replace function public.check_album_status_mutable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- No-op when status is not being changed.
  if OLD.status = NEW.status then
    return NEW;
  end if;

  -- auth.uid() is non-null for authenticated PostgREST requests (JWT present).
  -- auth.uid() is null for service_role operations (no JWT → webhook/admin only).
  if (select auth.uid()) is not null then
    raise exception 'albums.status はサーバー処理以外から変更できません'
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;

-- Fire only when the status column itself is targeted for update.
create trigger albums_status_check_mutable
  before update of status on public.albums
  for each row execute function public.check_album_status_mutable();

commit;
