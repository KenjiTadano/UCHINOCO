-- Keep the existing status CHECK, photo uniqueness, RLS and updated_at trigger.
alter table public.photo_ai_analyses
  add column attempts integer not null default 0
  constraint photo_ai_analyses_attempts_check check (attempts between 0 and 3);

-- Historical running/failed work has already consumed at least one attempt.
update public.photo_ai_analyses
set attempts = 1
where status in ('processing', 'failed');

create index photo_ai_analyses_queue_idx
  on public.photo_ai_analyses (status, updated_at)
  where status <> 'completed';
