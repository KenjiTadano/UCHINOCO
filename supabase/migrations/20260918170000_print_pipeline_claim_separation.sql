-- Task047-5 final fix: separate atomic claim token from completion marker.
-- Adds preparation_started_at, lease-timeout recovery, and provider validation.
--
-- EXISTING migration 20260918160000 is NOT modified.

begin;

-- ── 1. preparation_started_at: atomic claim token ─────────────────────────────
-- Set when a worker claims the job; cleared on success or failure.
-- prepared_at remains NULL until PDF generation + file upload both complete.
-- A job with preparation_started_at older than LEASE_TIMEOUT_MINUTES (15) can
-- be re-claimed by any worker (crash recovery).
alter table public.print_jobs
  add column preparation_started_at timestamptz;

-- ── 2. Provider validation ────────────────────────────────────────────────────
-- Prevent arbitrary strings reaching print_jobs.provider via PRINT_PROVIDER env.
-- mark_order_paid inserts p_provider; the constraint rejects everything unknown.
alter table public.print_jobs
  add constraint print_jobs_provider_check
    check (provider in ('mock', 'prodigi', 'gelato', 'fujifilm'));

commit;
