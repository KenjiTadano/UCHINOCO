import type { AlbumSpreadDraft } from "./types.ts";

export type AlbumPageRole = "COVER" | "TITLE" | "INTRO" | "HERO" | "STORY" | "GRID" | "QUIET" | "EVENT" | "CLOSING";
export type AlbumPageDensity = "LOW" | "MEDIUM" | "HIGH";
export type AlbumKnownEvent = { kind: "birthday" | "adoption"; date: string };

export type AlbumCompositionItem =
  | { kind: "title"; role: "TITLE"; title: string; petName: string; period: string }
  | { kind: "spread"; role: Exclude<AlbumPageRole, "COVER" | "TITLE" | "EVENT">; storySpreadId: string; density: AlbumPageDensity }
  | { kind: "event"; role: "EVENT"; eventKind: AlbumKnownEvent["kind"]; title: string; date: string; dateLabel: string; afterStorySpreadId: string | null };

export type AlbumCompositionPlan = {
  version: "album-rhythm-v2";
  coverRole: "COVER";
  items: AlbumCompositionItem[];
};

type Options = {
  title: string;
  petName: string;
  period: string;
  periodStart: string;
  periodEnd: string;
  events?: AlbumKnownEvent[];
};

function pageDensity(density: string): AlbumPageDensity {
  if (density === "dense") return "HIGH";
  if (density === "medium") return "MEDIUM";
  return "LOW";
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function dateLabel(value: string) {
  const [year, month, day] = value.split("-");
  return `${Number(year)}年${Number(month)}月${Number(day)}日`;
}

function eventsWithinPeriod(events: AlbumKnownEvent[], periodStart: string, periodEnd: string) {
  const start = periodStart.slice(0, 10);
  const end = periodEnd.slice(0, 10);
  const startYear = Number(start.slice(0, 4));
  const endYear = Number(end.slice(0, 4));
  const resolved: AlbumKnownEvent[] = [];
  for (const event of events) {
    if (!validDate(event.date)) continue;
    if (event.kind === "birthday") {
      for (let year = endYear; year >= startYear; year--) {
        const occurrence = `${year}-${event.date.slice(5)}`;
        if (validDate(occurrence) && occurrence >= start && occurrence <= end) {
          resolved.push({ ...event, date: occurrence });
          break;
        }
      }
    } else if (event.date >= start && event.date <= end) {
      resolved.push(event);
    }
  }
  return resolved;
}

function spreadRole(spread: AlbumSpreadDraft, index: number, count: number, quietId: string | null, heroIndexes: number[]): Exclude<AlbumPageRole, "COVER" | "TITLE" | "EVENT"> {
  if (index === 0 && spread.story.storyType !== "event" && !heroIndexes.includes(index)) return "INTRO";
  if (spread.story.storyType === "event") return "STORY";
  if (heroIndexes.includes(index)) return "HERO";
  if (spread.selectedLayout?.composition === "grid" || spread.assignments.length >= 4) return "GRID";
  if (spread.storySpreadId === quietId) return "QUIET";
  if (index === count - 1 && count >= 4) return "CLOSING";
  return "STORY";
}

export function buildAlbumCompositionPlan(spreads: AlbumSpreadDraft[], options: Options): AlbumCompositionPlan {
  const title = options.title.trim();
  const petName = options.petName.trim();
  const period = options.period.trim();
  const ordered = [...spreads];
  const quietCandidate =
    ordered.length >= 3
      ? (ordered
          .map((spread, index) => ({ spread, index }))
          .filter(({ spread }) => spread.assignments.length === 1 || spread.selectedLayout?.composition === "quiet" || spread.selectedLayout?.composition === "editorial")
          .sort((left, right) => left.spread.story.importance - right.spread.story.importance || left.index - right.index)[0]?.spread.storySpreadId ?? null)
      : null;

  const heroIndexes: number[] = [];
  for (let index = 0; index < ordered.length; index++) {
    const spread = ordered[index];
    const standout = spread.story.importance >= 88 || spread.story.storyType === "event";
    if (standout && spread.assignments.length > 0 && (heroIndexes.length === 0 || index - heroIndexes[heroIndexes.length - 1] >= 2)) {
      heroIndexes.push(index);
    }
  }

  const items: AlbumCompositionItem[] = [];
  if (title && petName && period) items.push({ kind: "title", role: "TITLE", title, petName, period });

  const events = eventsWithinPeriod(options.events ?? [], options.periodStart, options.periodEnd).sort((left, right) => left.date.localeCompare(right.date));
  const insertedEvents = new Set<AlbumKnownEvent>();

  ordered.forEach((spread, index) => {
    items.push({
      kind: "spread",
      role: spreadRole(spread, index, ordered.length, quietCandidate, heroIndexes),
      storySpreadId: spread.storySpreadId,
      density: pageDensity(spread.story.recommendedDensity),
    });
    const nextStart = ordered[index + 1]?.story.startedAt.slice(0, 10);
    const due = events.filter((event) => !insertedEvents.has(event) && event.date <= (nextStart ?? "9999-12-31"));
    for (const event of due) {
      insertedEvents.add(event);
      items.push({
        kind: "event",
        role: "EVENT",
        eventKind: event.kind,
        title: event.kind === "birthday" ? "誕生日" : "うちの子記念日",
        date: event.date,
        dateLabel: dateLabel(event.date),
        afterStorySpreadId: spread.storySpreadId,
      });
    }
  });

  return { version: "album-rhythm-v2", coverRole: "COVER", items };
}

export function parseAlbumCompositionPlan(value: unknown): AlbumCompositionPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<AlbumCompositionPlan>;
  if (candidate.version !== "album-rhythm-v2" || candidate.coverRole !== "COVER" || !Array.isArray(candidate.items)) return null;
  const items: AlbumCompositionItem[] = [];
  for (const raw of candidate.items) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    if (item.kind === "title" && item.role === "TITLE" && [item.title, item.petName, item.period].every((part) => typeof part === "string")) {
      items.push(item as unknown as AlbumCompositionItem);
    } else if (item.kind === "spread" && typeof item.storySpreadId === "string" && ["INTRO", "HERO", "STORY", "GRID", "QUIET", "CLOSING"].includes(String(item.role)) && ["LOW", "MEDIUM", "HIGH"].includes(String(item.density))) {
      items.push(item as unknown as AlbumCompositionItem);
    } else if (item.kind === "event" && item.role === "EVENT" && ["birthday", "adoption"].includes(String(item.eventKind)) && typeof item.title === "string" && typeof item.date === "string" && validDate(item.date) && typeof item.dateLabel === "string" && (item.afterStorySpreadId == null || typeof item.afterStorySpreadId === "string")) {
      items.push(item as unknown as AlbumCompositionItem);
    } else {
      return null;
    }
  }
  return { version: "album-rhythm-v2", coverRole: "COVER", items };
}
