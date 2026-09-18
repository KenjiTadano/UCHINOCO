-- Task045-3c: atomic mark_order_paid RPC
-- Webhook-only. Authenticated users / anon cannot call this directly.
-- Remote Supabase: NOT applied (migration file only).

begin;

create or replace function public.mark_order_paid(
  p_order_id         uuid,
  p_stripe_session_id text,
  p_payment_intent_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_album_id   uuid;
  v_status     text;
  v_session_id text;
begin
  -- Lock the order row to prevent concurrent updates.
  select album_id, status, stripe_checkout_session_id
    into v_album_id, v_status, v_session_id
    from public.orders
   where id = p_order_id
     for update;

  -- No row found → no-op (ignore unknown order IDs from Stripe metadata).
  if not found then
    return;
  end if;

  -- Already paid → idempotent return. Do not rewrite paid_at or other fields.
  if v_status = 'paid' then
    return;
  end if;

  -- Only pending → paid is allowed.
  -- Do not transition failed / cancelled → paid.
  if v_status <> 'pending' then
    return;
  end if;

  -- Session ID binding: the stripe_checkout_session_id stored at order creation
  -- must match the webhook's session ID. Prevents misrouted or replayed events.
  -- null stored session (order never bound to a session) → no-op.
  if v_session_id is null or v_session_id <> p_stripe_session_id then
    return;
  end if;

  -- Atomically update order and album in the same transaction.
  update public.orders
     set status                     = 'paid',
         paid_at                    = now(),
         stripe_payment_intent_id   = p_payment_intent_id,
         stripe_checkout_session_id = coalesce(p_stripe_session_id, stripe_checkout_session_id),
         updated_at                 = now()
   where id = p_order_id;

  update public.albums
     set status     = 'ordered',
         updated_at = now()
   where id = v_album_id;
end;
$$;

-- Webhook uses service_role key which bypasses RLS but still needs EXECUTE grant.
revoke execute on function public.mark_order_paid(uuid, text, text) from public, anon, authenticated;
grant  execute on function public.mark_order_paid(uuid, text, text) to service_role;

commit;
