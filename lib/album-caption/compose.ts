import { ALBUM_CAPTION_VERSION } from "./config.ts";
import { captionConfidenceGate, captionSourceFacts } from "./facts.ts";
import type { AlbumTextSuggestion, CaptionFacts, CaptionKind, CaptionStatus } from "./types.ts";
import { filterRepeatedSuggestions, suggestionFromText } from "./validate.ts";

type DraftLine = {
  text: string;
  specificity: number;
  emotion: boolean;
  named: boolean;
};

const ACTIVITY_LINES: Record<string, { title: string[]; caption: string[] }> = {
  "playing+toy": {
    title: ["おもちゃに夢中", "おもちゃと遊ぶ", "遊びの時間"],
    caption: ["おもちゃで遊んでいる。", "おもちゃに向かっている。", "おもちゃを見ている。"],
  },
  playing: {
    title: ["遊んでいる", "遊びの時間", "体を動かしている"],
    caption: ["遊んでいる。", "体を動かしている。"],
  },
  eating: {
    title: ["ごはんの時間", "食事中", "ごはん"],
    caption: ["ごはんを食べている。", "食事をしている。"],
  },
  sleeping: {
    title: ["眠っている", "静かな時間", "目を閉じている"],
    caption: ["静かに眠っている。", "目を閉じている。"],
  },
  looking_camera: {
    title: ["こちらを見ている", "カメラのほうへ", "見つめている"],
    caption: ["カメラのほうを見ている。", "こちらを向いている。"],
  },
  cuddling: {
    title: ["くっついている", "そばで休む"],
    caption: ["くっついている。", "体を寄せている。"],
  },
  walking: {
    title: ["歩いている", "歩き"],
    caption: ["歩いている。", "足を動かしている。"],
  },
};

const SCENE_LINES: Record<string, { title: string[]; caption: string[] }> = {
  home: { title: ["家の中", "部屋の中"], caption: ["家の中にいる。", "部屋にいる。"] },
  outdoors: { title: ["外にいる", "戸外"], caption: ["外にいる。", "戸外にいる。"] },
  park: { title: ["公園", "公園の時間"], caption: ["公園にいる。", "公園で過ごしている。"] },
  cafe: { title: ["カフェ", "店の中"], caption: ["カフェにいる。", "店の中にいる。"] },
  travel: { title: ["移動中", "出かけている"], caption: ["移動している。", "出かけている。"] },
};

function pushLines(
  target: DraftLine[],
  texts: string[],
  specificity: number,
  flags?: { emotion?: boolean; named?: boolean },
) {
  texts.forEach((text, index) => {
    if (target.some((item) => item.text === text)) return;
    target.push({
      text,
      specificity: specificity - index * 0.4,
      emotion: flags?.emotion ?? false,
      named: flags?.named ?? false,
    });
  });
}

function safePetName(name: string | null): string | null {
  if (!name) return null;
  if (!/^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}A-Za-z]{1,8}$/u.test(name)) return null;
  return name;
}

function emotionLine(facts: CaptionFacts): string | null {
  if (facts.expression === "happy" || facts.expression === "playful") return "楽しそう";
  if (facts.expression === "relaxed" || facts.expression === "calm" || facts.expression === "sleepy") return "リラックスした表情";
  return null;
}

function rankLines(lines: DraftLine[], facts: CaptionFacts, kind: CaptionKind): AlbumTextSuggestion[] {
  const ranked = lines
    .map((line, index) => ({
      line,
      index,
      score: line.specificity * 10 - [...line.text].length * 0.35 - (line.emotion ? 12 : 0) - (line.named ? 6 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const named = ranked.find((item) => item.line.named);
  const dated = ranked.find((item) => /\d+月/.test(item.line.text));
  const extra = dated ?? named ?? null;
  const main = ranked.filter((item) => item !== extra && !item.line.named);
  const picked = extra ? [...main.slice(0, 2), extra] : main.slice(0, 3);
  const suggestions: AlbumTextSuggestion[] = [];
  for (const item of picked) {
    const warnings = [
      ...(item.line.emotion ? ["expression: explicit"] : []),
      ...(item.line.named ? ["pet name used once"] : []),
    ];
    const suggestion = suggestionFromText(facts, kind, item.line.text, facts.confidence, warnings);
    if (!suggestion) continue;
    suggestions.push(suggestion);
  }
  return suggestions.slice(0, 3);
}

export function composeCaptionLines(facts: CaptionFacts): { status: CaptionStatus; titles: DraftLine[]; captions: DraftLine[] } {
  const status = captionConfidenceGate(facts);
  if (status !== "ok") return { status, titles: [], captions: [] };
  const titles: DraftLine[] = [];
  const captions: DraftLine[] = [];
  if (facts.event === "birthday") {
    pushLines(titles, ["誕生日", "誕生日の写真"], 6);
    pushLines(captions, ["誕生日の写真。"], 6);
  }
  const activityKey = facts.activity === "playing" && facts.objects.includes("toy") ? "playing+toy" : facts.activity;
  const activity = ACTIVITY_LINES[activityKey];
  if (activity) {
    const titlesForActivity =
      activityKey === "sleeping" && (facts.dayPart === "night" || facts.dayPart === "evening")
        ? activity.title.filter((item) => item !== "お昼寝")
        : activity.title;
    pushLines(titles, titlesForActivity, 5);
    pushLines(captions, activity.caption, 5);
  } else if (facts.scene !== "unknown") {
    const scene = SCENE_LINES[facts.scene];
    if (scene) {
      pushLines(titles, scene.title, 3);
      pushLines(captions, scene.caption, 3);
    }
  }
  if (facts.dateLabel && facts.dayPart === "morning") {
    pushLines(captions, [`${facts.dateLabel}の朝。`], 3);
  } else if (facts.dateLabel) {
    pushLines(captions, [`${facts.dateLabel}。`], 2);
  }
  const emotion = emotionLine(facts);
  if (emotion) {
    pushLines(titles, [emotion], 2, { emotion: true });
  }
  const name = safePetName(facts.petName);
  if (name && facts.activity === "playing") {
    pushLines(captions, [`${name}と遊んでいる。`], 2, { named: true });
  }
  return { status: "ok", titles, captions };
}

export function composeCaptions(
  facts: CaptionFacts,
  options?: { priorTexts?: string[]; avoid?: string[] },
): { status: CaptionStatus; titles: AlbumTextSuggestion[]; captions: AlbumTextSuggestion[] } {
  const composed = composeCaptionLines(facts);
  if (composed.status !== "ok") return { status: composed.status, titles: [], captions: [] };
  const prior = [...(options?.priorTexts ?? facts.priorTexts), ...(options?.avoid ?? [])];
  return {
    status: "ok",
    titles: filterRepeatedSuggestions(rankLines(composed.titles, facts, "title"), prior),
    captions: filterRepeatedSuggestions(rankLines(composed.captions, facts, "caption"), prior),
  };
}

export function mergeCaptionSuggestions(
  facts: CaptionFacts,
  kind: CaptionKind,
  modelLines: AlbumTextSuggestion[],
  ruleLines: AlbumTextSuggestion[],
): AlbumTextSuggestion[] {
  const merged: AlbumTextSuggestion[] = [];
  const seen = new Set<string>();
  const pool = [...ruleLines, ...modelLines].sort((a, b) => {
    const aRule = ruleLines.some((item) => item.text === a.text) ? 1 : 0;
    const bRule = ruleLines.some((item) => item.text === b.text) ? 1 : 0;
    return bRule - aRule || b.confidence - a.confidence || [...a.text].length - [...b.text].length;
  });
  for (const item of pool) {
    if (seen.has(item.text)) continue;
    seen.add(item.text);
    merged.push({ ...item, sourceFacts: item.sourceFacts.length > 0 ? item.sourceFacts : captionSourceFacts(facts), analysisVersion: ALBUM_CAPTION_VERSION });
    if (merged.length === 3) break;
  }
  return merged;
}
