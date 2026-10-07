/** Shared cover title hierarchy for photobook face (06.2 / 07.x). */

export function formatAlbumPeriodLabels(from: string | null, to: string | null) {
  const fallback = new Date();
  const parts = (value: string | null) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(value ? new Date(value) : fallback);
  const start = parts(from ?? to);
  const end = parts(to ?? from);
  const value = (items: Intl.DateTimeFormatPart[], type: "year" | "month") => items.find((part) => part.type === type)?.value ?? "";
  const startYear = value(start, "year");
  const startMonth = value(start, "month");
  const endYear = value(end, "year");
  const endMonth = value(end, "month");
  const monthLabel = startYear === endYear
    ? startMonth === endMonth
      ? `${Number(endMonth)}月`
      : `${Number(startMonth)}〜${Number(endMonth)}月`
    : Number(endYear) - Number(startYear) > 1
      ? `${startYear}〜${endYear}年`
      : `${startYear}年${Number(startMonth)}月〜${endYear}年${Number(endMonth)}月`;
  const coverDateLabel = startYear === endYear
    ? startMonth === endMonth
      ? `${startYear}.${startMonth}`
      : `${startYear}.${startMonth}-${endMonth}`
    : `${startYear}.${startMonth}-${endYear}.${endMonth}`;
  return { monthLabel, coverDateLabel };
}

export function buildCoverTitleLines(
  petName: string,
  albumTitle: string,
  periodMonthLabel: string,
): { prefix: string; main: string } {
  const prefix = `${petName}の`;
  const monthMain = `${periodMonthLabel}の思い出`;
  const title = albumTitle.trim();

  if (!title) return { prefix, main: monthMain };

  if (title.startsWith(prefix)) {
    const rest = title.slice(prefix.length).trim();
    if (rest.length > 0 && rest.length <= 14) {
      return { prefix, main: rest };
    }
  }

  if (title.length <= 10) return { prefix, main: title };
  return { prefix, main: monthMain };
}
