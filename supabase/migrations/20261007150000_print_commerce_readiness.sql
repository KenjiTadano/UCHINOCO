-- Task072: separate payment from fulfillment and persist submission safety.
-- No external provider is enabled by this migration.

begin;

alter table public.orders
  add column quantity integer not null default 1 check (quantity > 0),
  add column tax_amount integer not null default 0 check (tax_amount >= 0),
  add column currency text not null default 'JPY' check (currency = 'JPY'),
  add column provider_cost integer check (provider_cost is null or provider_cost >= 0);

alter table public.print_jobs
  add column mode text not null default 'disabled'
    check (mode in ('disabled', 'test', 'live')),
  add column fulfillment_status text not null default 'ready'
    check (fulfillment_status in (
      'not_ready', 'ready', 'submitting', 'submitted', 'accepted',
      'in_production', 'shipped', 'delivered', 'failed', 'canceled', 'unknown'
    )),
  add column provider_request_id text unique,
  add column submission_attempted_at timestamptz,
  add column accepted_at timestamptz,
  add column delivered_at timestamptz,
  add column canceled_at timestamptz,
  add column last_error_code text,
  add column last_error_retryable boolean,
  add column last_error_at timestamptz;

comment on column public.orders.provider_cost is
  'Provider cost, separate from customer selling price. NULL until a provider quote is confirmed.';
comment on column public.print_jobs.mode is
  'External submission is prohibited unless this is live and application release gates pass.';
comment on column public.print_jobs.fulfillment_status is
  'Manufacturing lifecycle; independent from orders.status payment lifecycle.';

commit;
