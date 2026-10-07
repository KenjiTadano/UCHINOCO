begin;

create or replace function public.apply_draft_page_element_override(
  p_spread_id uuid,
  p_element_id uuid,
  p_expected_revision integer,
  p_client_seq bigint,
  p_element_type text,
  p_element_data jsonb,
  p_is_deleted boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version_id uuid;
  v_row public.album_draft_page_elements%rowtype;
  v_x numeric;
  v_y numeric;
  v_width numeric;
  v_height numeric;
  v_rotation numeric;
  v_z_index numeric;
  v_text text;
begin
  if p_spread_id is null or p_element_id is null or p_client_seq is null or p_client_seq < 1
    or p_expected_revision is null or p_expected_revision < 0 or p_is_deleted is null
  then
    raise exception '要素の更新値が不正です' using errcode = 'P0001';
  end if;
  v_version_id := public.assert_editable_album_draft_spread(p_spread_id);
  perform 1 from public.album_draft_spreads where id = p_spread_id for update;

  if not p_is_deleted then
    if p_element_type is null or p_element_type not in ('text', 'stamp', 'decoration')
      or p_element_data is null or jsonb_typeof(p_element_data) <> 'object'
      or p_element_data->>'id' is distinct from p_element_id::text
      or p_element_data->>'type' is distinct from p_element_type
    then
      raise exception '要素の種類が不正です' using errcode = 'P0001';
    end if;
    if jsonb_typeof(p_element_data->'x') is distinct from 'number'
      or jsonb_typeof(p_element_data->'y') is distinct from 'number'
      or jsonb_typeof(p_element_data->'width') is distinct from 'number'
      or jsonb_typeof(p_element_data->'height') is distinct from 'number'
      or jsonb_typeof(p_element_data->'rotation') is distinct from 'number'
      or jsonb_typeof(p_element_data->'zIndex') is distinct from 'number'
    then
      raise exception '要素の位置が不正です' using errcode = 'P0001';
    end if;
    v_x := (p_element_data->>'x')::numeric;
    v_y := (p_element_data->>'y')::numeric;
    v_width := (p_element_data->>'width')::numeric;
    v_height := (p_element_data->>'height')::numeric;
    v_rotation := (p_element_data->>'rotation')::numeric;
    v_z_index := (p_element_data->>'zIndex')::numeric;
    if v_width < (case when p_element_type = 'text' then 0.08 else 0.035 end) or v_width > 0.96
      or v_height < (case when p_element_type = 'text' then 0.025 else 0.035 end) or v_height > 0.96
      or v_x < -v_width + 0.08 or v_x > 0.92
      or v_y < -v_height + 0.08 or v_y > 0.92
      or v_rotation < -180 or v_rotation > 180
      or v_z_index < -100 or v_z_index > 100 or trunc(v_z_index) <> v_z_index
    then
      raise exception '要素の範囲が不正です' using errcode = 'P0001';
    end if;
    if p_element_data->>'printTarget' is null or p_element_data->>'printTarget' not in ('print', 'digital-only') then
      raise exception '出力先が不正です' using errcode = 'P0001';
    end if;

    if p_element_type = 'text' then
      v_text := p_element_data->>'text';
      if v_text is null or char_length(v_text) = 0 or char_length(v_text) > 120 or replace(v_text, E'\n', '') ~ '[<>[:cntrl:]]'
        or p_element_data->>'fontId' is null or p_element_data->>'fontId' not in ('editorial', 'warm', 'handwritten', 'minimal')
        or jsonb_typeof(p_element_data->'fontSize') is distinct from 'number'
        or (p_element_data->>'fontSize')::numeric not between 10 and 48
        or jsonb_typeof(p_element_data->'bold') <> 'boolean'
        or p_element_data->>'align' is null or p_element_data->>'align' not in ('left', 'center', 'right')
        or p_element_data->>'colorId' is null or p_element_data->>'colorId' not in ('ink', 'terracotta', 'sage', 'sky', 'mustard', 'rose', 'white')
      then
        raise exception 'テキストの内容が不正です' using errcode = 'P0001';
      end if;
    elsif p_element_type = 'stamp' then
      if p_element_data->>'stampId' is null or p_element_data->>'stampId' not in ('paw', 'heart', 'star', 'sparkle', 'bone', 'fish', 'crown', 'birthday', 'first-time', 'outing', 'spring', 'summer', 'autumn', 'winter')
        or p_element_data->>'colorId' is null or p_element_data->>'colorId' not in ('ink', 'terracotta', 'sage', 'sky', 'mustard', 'rose', 'white')
      then
        raise exception 'スタンプが不正です' using errcode = 'P0001';
      end if;
    elsif p_element_data->>'decorationId' is null or p_element_data->>'decorationId' not in ('line', 'tape', 'corner', 'bubble', 'ribbon')
      or p_element_data->>'colorId' is null or p_element_data->>'colorId' not in ('ink', 'terracotta', 'sage', 'sky', 'mustard', 'rose', 'white')
    then
      raise exception '装飾が不正です' using errcode = 'P0001';
    end if;
  end if;

  select * into v_row
    from public.album_draft_page_elements
   where id = p_element_id and draft_spread_id = p_spread_id
   for update;

  if not found then
    if p_is_deleted then
      return jsonb_build_object('status', 'missing');
    end if;
    insert into public.album_draft_page_elements (
      id, draft_spread_id, element_type, element_data, client_seq
    ) values (
      p_element_id, p_spread_id, p_element_type, p_element_data, p_client_seq
    );
  else
    if v_row.client_seq > p_client_seq then
      return jsonb_build_object('status', 'stale', 'revision', v_row.revision, 'clientSeq', v_row.client_seq);
    end if;
    if v_row.client_seq = p_client_seq and v_row.revision <> p_expected_revision then
      return jsonb_build_object('status', 'conflict', 'revision', v_row.revision, 'clientSeq', v_row.client_seq);
    end if;
    update public.album_draft_page_elements
       set element_type = case when p_is_deleted then element_type else p_element_type end,
           element_data = case when p_is_deleted then element_data else p_element_data end,
           is_deleted = p_is_deleted,
           client_seq = p_client_seq,
           revision = revision + 1
     where id = p_element_id and draft_spread_id = p_spread_id;
  end if;

  update public.album_draft_versions set revision = revision + 1 where id = v_version_id;
  return jsonb_build_object('status', 'applied');
end;
$$;

commit;