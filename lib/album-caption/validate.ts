import { ALBUM_CAPTION_VERSION, CAPTION_CAPTION_MAX, CAPTION_MIN_CONFIDENCE, CAPTION_TITLE_MAX } from "./config.ts";
import { captionSourceFacts } from "./facts.ts";
import type { AlbumTextSuggestion, CaptionFacts, CaptionKind } from "./types.ts";

const CLAIM =
  /うれしそう|嬉しそう|大好き|お気に入り|毎日|初めて|はじめて|最後|飼い主|ご主人|パパ|ママ|オーナー|お誕生日|バースデー|朝食|昼食|夕食|夏|春|秋|冬/;

function lengthLimit(kind: CaptionKind): number {
  return kind === "title" ? CAPTION_TITLE_MAX : CAPTION_CAPTION_MAX;
}

export function captionLengthIssue(kind: CaptionKind, text: string): string | null {
  const value = text.trim();
  if (!value) return "empty";
  if (/[\n\r<>]/.test(value)) return "plain";
  if ([...value].length > lengthLimit(kind)) return "length";
  return null;
}

/** Claims that are not present in the fact payload. */
export function unsupportedCaptionClaims(text: string, facts: CaptionFacts): string[] {
  const hits: string[] = [];
  if (/誕生日|お誕生日|バースデー|\bbirthday\b/i.test(text) && facts.event !== "birthday") hits.push("birthday");
  if (/公園|\bpark\b/i.test(text) && facts.scene !== "park") hits.push("park");
  if (/カフェ/.test(text) && facts.scene !== "cafe") hits.push("cafe");
  if (/旅行/.test(text) && facts.scene !== "travel") hits.push("travel");
  if (/飼い主|ご主人|パパ|ママ|オーナー|\bowner\b/i.test(text)) hits.push("owner");
  if (/大好き|お気に入り|\bfavorite\b|\bfavourite\b/i.test(text)) hits.push("favorite");
  if (/初めて|はじめて|最後|毎日|\bfirst time\b/i.test(text)) hits.push("unsupported-claim");
  if (/うれしそう|嬉しそう/.test(text)) hits.push("emotion");
  if (/楽しそう/.test(text) && facts.expression !== "happy" && facts.expression !== "playful") hits.push("emotion");
  if (/リラックス/.test(text) && !["relaxed", "calm", "sleepy"].includes(facts.expression ?? "")) hits.push("emotion");
  if (/夏|春|秋|冬/.test(text)) hits.push("season");
  if (/朝食|昼食|夕食/.test(text)) hits.push("meal");
  if (text.includes("朝") && facts.dayPart !== "morning") hits.push("time");
  if (text.includes("昼") && facts.dayPart !== "midday") hits.push("time");
  if (text.includes("夕方") && facts.dayPart !== "evening") hits.push("time");
  if (text.includes("夜") && facts.dayPart !== "night") hits.push("time");
  const years = [...text.matchAll(/20\d{2}/g)].map((match) => Number(match[0]));
  if (years.some((year) => year !== facts.year)) hits.push("date");
  const months = [...text.matchAll(/(\d{1,2})月/g)].map((match) => Number(match[1]));
  if (months.some((month) => month !== facts.month)) hits.push("date");
  const days = [...text.matchAll(/(\d{1,2})月(\d{1,2})日/g)];
  if (days.some((match) => `${Number(match[1])}月${Number(match[2])}日` !== facts.dateLabel)) hits.push("date");
  if (CLAIM.test(text) && hits.length === 0) hits.push("banned");
  return [...new Set(hits)];
}

export function suggestionFromText(
  facts: CaptionFacts,
  kind: CaptionKind,
  text: string,
  confidence: number,
  warnings: string[] = [],
): AlbumTextSuggestion | null {
  const issue = captionLengthIssue(kind, text);
  if (issue) return null;
  const unsupported = unsupportedCaptionClaims(text, facts);
  if (unsupported.length > 0) return null;
  if (confidence < CAPTION_MIN_CONFIDENCE) return null;
  return {
    spreadId: facts.spreadId,
    kind,
    text: text.trim(),
    confidence,
    sourceFacts: captionSourceFacts(facts),
    warnings,
    analysisVersion: ALBUM_CAPTION_VERSION,
  };
}

function asConfidence(value: unknown): number | null {
  return typeof value === "number" && value >= 0 && value <= 1 ? value : null;
}

/** Accepts model JSON. Lines with unsupported claims are dropped, not repaired. */
export function acceptCaptionPayload(
  raw: unknown,
  facts: CaptionFacts,
  kind: CaptionKind,
): AlbumTextSuggestion[] {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const list = Array.isArray(raw) ? raw : body?.suggestions;
  if (!Array.isArray(list)) return [];
  const accepted: AlbumTextSuggestion[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const text = typeof row.text === "string" ? row.text : "";
    const confidence = asConfidence(row.confidence);
    if (confidence == null) continue;
    const suggestion = suggestionFromText(facts, kind, text, Math.min(confidence, facts.confidence || confidence));
    if (!suggestion || seen.has(suggestion.text)) continue;
    seen.add(suggestion.text);
    accepted.push(suggestion);
    if (accepted.length === 3) break;
  }
  return accepted;
}

export function parseCaptionJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

export function normalizeCaptionText(text: string): string {
  return text.replace(/\s/g, "").replace(/[。．.、]/g, "");
}

export function repeatsCaption(text: string, prior: string): boolean {
  const left = normalizeCaptionText(text);
  const right = normalizeCaptionText(prior);
  if (!left || !right) return false;
  if (left === right) return true;
  if (right.length >= 6 && left.includes(right)) return true;
  if (left.length >= 6 && right.includes(left)) return true;
  return false;
}

export function filterRepeatedSuggestions<T extends { text: string }>(items: T[], prior: string[]): T[] {
  return items.filter((item) => !prior.some((entry) => repeatsCaption(item.text, entry)));
}

export function parseStoredSuggestions(value: unknown, facts: CaptionFacts, kind: CaptionKind): AlbumTextSuggestion[] {
  if (!Array.isArray(value)) return [];
  const parsed: AlbumTextSuggestion[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.text !== "string") continue;
    const confidence = asConfidence(row.confidence) ?? facts.confidence;
    const suggestion = suggestionFromText(facts, kind, row.text, confidence);
    if (suggestion) parsed.push(suggestion);
  }
  return parsed.slice(0, 3);
}
