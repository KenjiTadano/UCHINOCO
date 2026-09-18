-- Task045-3a: orders table — payment & security foundation
-- Remote Supabase: NOT applied (migration file only).
-- Stripe API: NOT connected.

begin;

-- ── orders ───────────────────────────────────────────────────────────────────
create table public.orders (
  id uuid primary key default gen_random_uuid(),

  -- Ownership
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  album_id      uuid not null references public.albums(id) on delete restrict,
  pet_id        uuid not null references public.pets(id)   on delete restrict,

  -- Status
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'cancelled', 'failed')),

  -- Product snapshot (populated by Server Action from PHOTOBOOK_PRODUCTS; never trust client)
  product_id              text    not null,
  product_name            text    not null,
  product_size            text    not null,
  product_cover_type      text    not null,
  product_cover_type_label text   not null,
  pages                   integer not null check (pages > 0),

  -- Price snapshot (recalculated server-side via calcPrice(); client values ignored)
  subtotal     integer not null check (subtotal     >= 0),
  shipping_fee integer not null check (shipping_fee >= 0),
  total        integer not null
    check (total >= 0 and total = subtotal + shipping_fee),

  -- Shipping option snapshot
  shipping_option_id   text not null,
  shipping_option_name text not null,

  -- Address snapshot
  shipping_last_name   text not null,
  shipping_first_name  text not null,
  shipping_postal_code text not null,
  shipping_prefecture  text not null,
  shipping_city        text not null,
  shipping_address1    text not null,
  shipping_address2    text,          -- nullable
  shipping_phone       text not null,

  -- Stripe (null until Task045-3c webhook)
  --   Checkout Session metadata: { order_id, album_id }
  --   PaymentIntent metadata:    { order_id }
  --   PII (name/address/phone) must NOT be stored in Stripe metadata.
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id   text,

  -- Timestamps
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  paid_at      timestamptz,
  cancelled_at timestamptz
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
create index orders_owner_created_idx
  on public.orders (owner_user_id, created_at desc);

create index orders_album_idx
  on public.orders (album_id);

-- At most one pending order per album.
-- paid / cancelled / failed orders do not compete with new pending orders.
create unique index orders_album_pending_unique
  on public.orders (album_id)
  where (status = 'pending');

-- ── updated_at trigger ────────────────────────────────────────────────────────
-- Reuses set_updated_at() defined in 20260918000001_albums.sql
create trigger orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.orders enable row level security;

-- Users may only read their own orders (SELECT only).
create policy "orders: owner select"
  on public.orders for select
  using (owner_user_id = auth.uid());

-- Direct INSERT / UPDATE / DELETE from PostgREST (authenticated or anon) is
-- forbidden. All writes are performed exclusively by service-role Server Actions
-- (lib/supabase/admin.ts). The REVOKE is belt-and-suspenders: even if a policy
-- were added later, the grant must also exist for it to take effect.
revoke insert, update, delete on public.orders from authenticated, anon;

commit;
