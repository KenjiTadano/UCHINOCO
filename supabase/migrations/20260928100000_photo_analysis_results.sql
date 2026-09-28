-- Task058.2: versioned AI analysis cache.
-- Grouping, best shot, candidates, story, and layout stay derived.
-- Existing album draft migrations are not modified.

begin;

create table public.photo_analysis_results (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos (id) on delete cascade,
  analysis_type text not null,
  analysis_version text not null,
  source_fingerprint text not null,
  result_status text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint photo_analysis_results_type_check
    check (analysis_type in ('photo_intelligence_semantic', 'subject_geometry')),
  constraint photo_analysis_results_status_check
    check (result_status in ('success', 'fallback', 'failed')),
  constraint photo_analysis_results_version_check
    check (char_length(analysis_version) between 3 and 80),
  constraint photo_analysis_results_fingerprint_check
    check (char_length(source_fingerprint) between 8 and 500),
  constraint photo_analysis_results_result_object_check
    check (jsonb_typeof(result) = 'object')
);

create unique index photo_analysis_results_identity_idx
  on public.photo_analysis_results (photo_id, analysis_type, analysis_version, source_fingerprint);

create index photo_analysis_results_photo_idx
  on public.photo_analysis_results (photo_id);

create trigger set_photo_analysis_results_updated_at
before update on public.photo_analysis_results
for each row execute function public.set_updated_at();

alter table public.photo_analysis_results enable row level security;

create policy "Users can view analysis for their own pet photos"
on public.photo_analysis_results
for select
to authenticated
using (
  exists (
    select 1
    from public.photos
    join public.pets on public.pets.id = public.photos.pet_id
    where public.photos.id = photo_analysis_results.photo_id
      and public.pets.owner_user_id = (select auth.uid())
  )
);

revoke all on table public.photo_analysis_results from public, anon, authenticated;
grant select on table public.photo_analysis_results to authenticated;

-- Owner writes go through this function. A stored success row is not replaced.
create or replace function public.save_photo_analysis_result(
  p_photo_id uuid,
  p_analysis_type text,
  p_analysis_version text,
  p_source_fingerprint text,
  p_result_status text,
  p_result jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_id uuid;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;
  if p_analysis_type not in ('photo_intelligence_semantic', 'subject_geometry')
    or p_result_status not in ('success', 'fallback', 'failed')
    or p_analysis_version is null
    or char_length(p_analysis_version) < 3
    or char_length(p_analysis_version) > 80
    or p_source_fingerprint is null
    or char_length(p_source_fingerprint) < 8
    or char_length(p_source_fingerprint) > 500
    or jsonb_typeof(p_result) is distinct from 'object'
  then
    raise exception '解析結果の形式が不正です' using errcode = 'P0001';
  end if;

  select public.pets.owner_user_id into v_owner
  from public.photos
  join public.pets on public.pets.id = public.photos.pet_id
  where public.photos.id = p_photo_id;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception '写真を読み込めませんでした' using errcode = '42501';
  end if;

  insert into public.photo_analysis_results (
    photo_id,
    analysis_type,
    analysis_version,
    source_fingerprint,
    result_status,
    result
  ) values (
    p_photo_id,
    p_analysis_type,
    p_analysis_version,
    p_source_fingerprint,
    p_result_status,
    p_result
  )
  on conflict (photo_id, analysis_type, analysis_version, source_fingerprint) do nothing
  returning id into v_id;

  if v_id is not null then
    return jsonb_build_object('stored', true, 'reason', 'inserted', 'id', v_id);
  end if;

  select id, result_status into v_id, v_status
  from public.photo_analysis_results
  where photo_id = p_photo_id
    and analysis_type = p_analysis_type
    and analysis_version = p_analysis_version
    and source_fingerprint = p_source_fingerprint;

  if v_status = 'success' or p_result_status <> 'success' then
    return jsonb_build_object(
      'stored', false,
      'reason', case when v_status = 'success' then 'success_immutable' else 'non_success_kept' end,
      'id', v_id,
      'result_status', v_status
    );
  end if;

  update public.photo_analysis_results
  set result_status = 'success',
      result = p_result
  where id = v_id
    and result_status <> 'success';

  return jsonb_build_object('stored', true, 'reason', 'replaced_non_success', 'id', v_id);
end;
$$;

revoke all on function public.save_photo_analysis_result(uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.save_photo_analysis_result(uuid, text, text, text, text, jsonb) to authenticated;

commit;
