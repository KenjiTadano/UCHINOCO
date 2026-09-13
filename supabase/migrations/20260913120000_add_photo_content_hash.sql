alter table public.photos
add column content_hash text;

alter table public.photos
add constraint photos_content_hash_format_check
check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$');

create unique index photos_uploader_pet_content_hash_unique
on public.photos (uploader_user_id, pet_id, content_hash)
where content_hash is not null;
