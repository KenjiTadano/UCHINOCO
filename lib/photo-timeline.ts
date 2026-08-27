const TOKYO_TIME_ZONE = "Asia/Tokyo";

type TimelinePhoto = {
  taken_at: string | null;
  created_at: string;
};

export type PhotoTimelineGroup<T extends TimelinePhoto> = {
  dateKey: string;
  dateLabel: string;
  photos: T[];
};

function dateParts(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TOKYO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
}

export function photoTimestamp(photo: TimelinePhoto) {
  return photo.taken_at ?? photo.created_at;
}

export function tokyoDateKey(value: string) {
  const parts = dateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatTokyoDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: TOKYO_TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(value));
}

export function formatTokyoDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: TOKYO_TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function groupPhotosByTokyoDate<T extends TimelinePhoto>(
  photos: T[],
): PhotoTimelineGroup<T>[] {
  const sortedPhotos = [...photos].sort(
    (left, right) =>
      new Date(photoTimestamp(right)).getTime() -
      new Date(photoTimestamp(left)).getTime(),
  );
  const groups = new Map<string, T[]>();

  for (const photo of sortedPhotos) {
    const key = tokyoDateKey(photoTimestamp(photo));
    const group = groups.get(key);
    if (group) {
      group.push(photo);
    } else {
      groups.set(key, [photo]);
    }
  }

  return Array.from(groups, ([dateKey, groupedPhotos]) => ({
    dateKey,
    dateLabel: formatTokyoDate(photoTimestamp(groupedPhotos[0])),
    photos: groupedPhotos,
  })).sort((left, right) => right.dateKey.localeCompare(left.dateKey));
}
