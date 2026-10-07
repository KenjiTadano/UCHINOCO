begin;

alter table public.album_analytics_events
  drop constraint if exists album_analytics_events_event_type_check;

alter table public.album_analytics_events
  add constraint album_analytics_events_event_type_check check (event_type in (
    'album_generated', 'album_viewed', 'album_accepted', 'album_edit_started',
    'album_layout_changed', 'album_crop_changed', 'album_photo_swapped',
    'album_text_changed', 'album_decoration_changed', 'album_background_changed',
    'album_regenerated', 'print_preview_opened', 'checkout_started',
    'decoration_recommendation_shown', 'decoration_previewed',
    'decoration_applied', 'decoration_rejected', 'decoration_reset',
    'new_photos_suggested', 'new_photos_reviewed', 'new_photos_added',
    'new_photos_dismissed'
  ));

commit;
