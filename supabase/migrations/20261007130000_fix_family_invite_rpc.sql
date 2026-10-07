-- Task070.1: disambiguate invite output-column names inside the RPC.
-- The Task070 migration is already remote-applied, so it is not rewritten.
begin;

create or replace function public.create_pet_family_invite(
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

  update public.pet_family_invites as invite
     set status = 'EXPIRED'
   where invite.pet_id = p_pet_id
     and invite.invitee_email = v_email
     and invite.status = 'PENDING'
     and invite.expires_at <= now();

  if exists (
    select 1 from public.pet_family_members m
    join auth.users u on u.id = m.user_id
    where m.pet_id = p_pet_id and lower(u.email) = v_email
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

revoke all on function public.create_pet_family_invite(uuid,text,text) from public, anon;
grant execute on function public.create_pet_family_invite(uuid,text,text) to authenticated;

commit;
