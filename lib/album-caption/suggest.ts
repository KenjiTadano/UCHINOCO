import { ALBUM_CAPTION_VERSION } from "./config.ts";
import { captionCacheKey, captionReadPlan, reusableCaption, type CaptionMemory } from "./cache.ts";
import { composeCaptions, mergeCaptionSuggestions } from "./compose.ts";
import { captionConfidenceGate, captionFingerprint } from "./facts.ts";
import { buildCaptionPrompt } from "./prompt.ts";
import type { AlbumTextSuggestion, CaptionFacts, CaptionKind, CaptionStatus } from "./types.ts";
import { acceptCaptionPayload, filterRepeatedSuggestions, parseCaptionJson, parseStoredSuggestions } from "./validate.ts";

export type CaptionResolution = {
  status: CaptionStatus;
  source: "memory" | "db" | "model" | "rules";
  suggestions: AlbumTextSuggestion[];
  /** Unfiltered lines to persist. Null when the cache was already hit or this pass must not be stored. */
  cacheable: AlbumTextSuggestion[] | null;
  modelCalled: boolean;
  fingerprint: string;
};

export async function resolveCaptionKind(input: {
  force?: boolean;
  kind: CaptionKind;
  facts: CaptionFacts;
  memory: CaptionMemory;
  stored: unknown;
  complete?: (system: string, user: string) => Promise<string | null>;
  avoid?: string[];
}): Promise<CaptionResolution> {
  const fingerprint = captionFingerprint(input.facts, input.kind);
  const gate = captionConfidenceGate(input.facts);
  const prior = [...input.facts.priorTexts, ...(input.avoid ?? []), ...(input.facts.userText ? [input.facts.userText] : [])];
  const empty = (status: CaptionStatus, source: CaptionResolution["source"], modelCalled = false): CaptionResolution => ({
    status,
    source,
    suggestions: [],
    cacheable: null,
    modelCalled,
    fingerprint,
  });
  if (gate !== "ok") return empty(gate, "rules");

  const key = captionCacheKey(input.facts.spreadId, input.kind, ALBUM_CAPTION_VERSION, fingerprint);
  const memoryHit = input.force ? null : input.memory.read(key);
  const storedRow = storedCaption(input.stored, input.facts, input.kind, fingerprint);
  const dbHit = input.force ? null : reusableCaption(storedRow, { analysisVersion: ALBUM_CAPTION_VERSION, inputFingerprint: fingerprint });
  const plan = captionReadPlan({ force: Boolean(input.force), memoryHit: Boolean(memoryHit), dbHit: Boolean(dbHit) });
  if (plan === "memory" && memoryHit) {
    return {
      status: "ok",
      source: "memory",
      suggestions: filterRepeatedSuggestions(memoryHit.suggestions, prior),
      cacheable: null,
      modelCalled: false,
      fingerprint,
    };
  }
  if (plan === "db" && dbHit) {
    input.memory.write(key, dbHit);
    return {
      status: "ok",
      source: "db",
      suggestions: filterRepeatedSuggestions(dbHit.suggestions, prior),
      cacheable: null,
      modelCalled: false,
      fingerprint,
    };
  }

  const rules = composeCaptions(input.facts);
  const ruleLines = input.kind === "title" ? rules.titles : rules.captions;
  let modelLines: AlbumTextSuggestion[] = [];
  let modelCalled = false;
  if (input.complete) {
    modelCalled = true;
    const prompt = buildCaptionPrompt(input.facts, input.kind);
    try {
      const raw = await input.complete(prompt.system, prompt.user);
      if (raw) modelLines = acceptCaptionPayload(parseCaptionJson(raw), input.facts, input.kind);
    } catch {
      modelLines = [];
    }
  }
  const canonical = mergeCaptionSuggestions(input.facts, input.kind, modelLines, ruleLines);
  const suggestions = filterRepeatedSuggestions(canonical, prior);
  if (canonical.length === 0) return empty(rules.status === "ok" ? "insufficient" : rules.status, modelCalled ? "model" : "rules", modelCalled);
  if (!input.force) {
    input.memory.write(key, {
      analysisVersion: ALBUM_CAPTION_VERSION,
      inputFingerprint: fingerprint,
      suggestions: canonical,
    });
  }
  return {
    status: "ok",
    source: modelLines.length > 0 ? "model" : "rules",
    suggestions,
    cacheable: input.force ? null : canonical,
    modelCalled,
    fingerprint,
  };
}

function storedCaption(stored: unknown, facts: CaptionFacts, kind: CaptionKind, fingerprint: string) {
  if (!stored || typeof stored !== "object") return null;
  const row = stored as { analysisVersion?: unknown; inputFingerprint?: unknown; suggestions?: unknown };
  if (typeof row.analysisVersion !== "string" || typeof row.inputFingerprint !== "string") return null;
  const suggestions = parseStoredSuggestions(row.suggestions, facts, kind);
  if (row.inputFingerprint !== fingerprint || suggestions.length === 0) return null;
  return {
    analysisVersion: row.analysisVersion,
    inputFingerprint: row.inputFingerprint,
    suggestions,
  };
}
