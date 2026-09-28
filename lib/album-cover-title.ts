/** Shared cover title hierarchy for photobook face (06.2 / 07.x). */

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
