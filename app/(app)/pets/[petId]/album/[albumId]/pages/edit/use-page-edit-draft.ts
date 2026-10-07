"use client";

import { useEffect, useRef, useState } from "react";
import { overrideFrameCrop, overrideFramePhoto, overrideSpreadDecoration, overridePageElement, overrideSpreadBackground, overrideSpreadLayout, overrideSpreadText, refreshDraftPhotoUrls } from "@/app/(app)/album-draft-service";
import { canPlaceDecoration, decorationSlotIssue, isDecorationId, plainTextIssue, slotKind, styleIssue, textSlotIssue } from "@/lib/album-polish/catalog";
import { decorationUserSnapshot, textUserSnapshot } from "@/lib/album-polish/rows";
import { normalizePageElement, type ElementBackgroundId, type PageElement, type PageSide } from "@/lib/album-elements/model";
import { applyDecorationState, applyTextState, decorationTargetId, textTargetId } from "@/lib/album-polish/state";
import type { DecorationOverrideSnapshot, OverrideMode, ScalePreset, TextOverrideSnapshot, TextStyleId } from "@/lib/album-polish/types";
import { AUTOSAVE_DEBOUNCE_MS } from "@/lib/album-persistence/config";
import { applyFrameCrop, applyFramePhoto, applyPreviewUrls, applySpreadLayout, clientSeqOf, mergeServerDraft, presentSaveError } from "@/lib/album-persistence/editor";
import { useEditorHistory } from "@/lib/album-persistence/use-editor-history";
import type { EditorHistoryEntry } from "@/lib/album-persistence/history";
import type { CropTriple } from "@/lib/album-persistence/types";
import type { PersistedDraftView, PersistenceResult } from "@/lib/album-persistence/view";

type SaveState = "saved" | "saving" | "error";
type RecommendationSnapshot = {
  elements: PageElement[];
  backgrounds: Record<PageSide, ElementBackgroundId | null>;
};
type RecommendationChange = {
  elements: PageElement[];
  backgrounds: Partial<Record<PageSide, ElementBackgroundId>>;
};

type Intent =
  | { kind: "layout"; spreadId: string; layoutId: string | null }
  | { kind: "crop"; frameId: string; crop: CropTriple | null }
  | { kind: "photo"; frameId: string; photoId: string | null; previewUrl?: string }
  | { kind: "text"; spreadId: string; slotId: string; mode: OverrideMode; text: string | null; styleId: TextStyleId | null }
  | {
      kind: "decoration";
      spreadId: string;
      slotId: string;
      mode: OverrideMode;
      decorationId: DecorationOverrideSnapshot["decorationId"];
      scale: ScalePreset | null;
    }
  | { kind: "element"; spreadId: string; elementId: string; element: PageElement | null }
  | { kind: "background"; spreadId: string; pageSide: PageSide; backgroundId: ElementBackgroundId | null };

function rememberDraft(next: PersistedDraftView, seq: Map<string, number>, revision: Map<string, number>) {
  for (const spread of next.spreads) {
    seq.set(spread.id, Math.max(seq.get(spread.id) ?? 0, spread.source.clientSeq));
    revision.set(spread.id, spread.source.revision);
    for (const frame of spread.sourceFrames) {
      seq.set(frame.id, Math.max(seq.get(frame.id) ?? 0, frame.clientSeq));
      revision.set(frame.id, frame.revision);
    }
    for (const text of spread.texts ?? []) {
      const key = textTargetId(spread.id, text.slotId);
      seq.set(key, Math.max(seq.get(key) ?? 0, text.clientSeq));
      revision.set(key, text.revision);
    }
    for (const decoration of spread.decorations ?? []) {
      const key = decorationTargetId(spread.id, decoration.slotId);
      seq.set(key, Math.max(seq.get(key) ?? 0, decoration.clientSeq));
      revision.set(key, decoration.revision);
    }
    for (const element of spread.elements ?? []) {
      const key = `element:${spread.id}:${element.id}`;
      seq.set(key, Math.max(seq.get(key) ?? 0, element.clientSeq));
      revision.set(key, element.revision);
    }
    for (const side of ["left", "right"] as const) {
      const background = spread.backgrounds?.[side];
      const key = `background:${spread.id}:${side}`;
      seq.set(key, Math.max(seq.get(key) ?? 0, background?.clientSeq ?? 0));
      revision.set(key, background?.revision ?? 0);
    }
  }
}

export function usePageEditDraft(initial: PersistedDraftView | null, albumId: string, readonly: boolean) {
  const [view, setView] = useState(initial);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(new Map<string, number>());
  const revisionRef = useRef(new Map<string, number>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inFlight = useRef(0);
  const initialized = useRef(false);
  const intent = useRef<Intent | null>(null);
  const viewRef = useRef(view);
  const history = useEditorHistory("page");

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    if (!initial || initialized.current) return;
    rememberDraft(initial, seqRef.current, revisionRef.current);
    initialized.current = true;
  }, [initial]);

  function bump(id: string, fallback: number) {
    const next = (seqRef.current.get(id) ?? fallback) + 1;
    seqRef.current.set(id, next);
    return next;
  }

  function noteWrite(result: PersistenceResult, sentSeq: number, targetId: string) {
    if (result.view) {
      setView((current) => {
        const base = current ?? viewRef.current;
        if (!base) return result.view;
        if (!result.ok || clientSeqOf(base, targetId) > sentSeq || (seqRef.current.get(targetId) ?? 0) > sentSeq) return base;
        const next = mergeServerDraft(base, result.view as PersistedDraftView, sentSeq, targetId);
        if (next === result.view) rememberDraft(next, seqRef.current, revisionRef.current);
        viewRef.current = next;
        return next;
      });
    }
    if (!result.ok || result.writeStatus === "conflict") {
      setSaveState("error");
      setError(presentSaveError(result.message));
      return;
    }
    if (result.writeStatus === "stale") {
      const newer = (seqRef.current.get(targetId) ?? 0) > sentSeq || timers.current.has(targetId);
      if (!newer) {
        setSaveState("error");
        setError(presentSaveError(result.message ?? "保存が競合しました。再試行できます。"));
      }
      return;
    }
    if ((seqRef.current.get(targetId) ?? 0) > sentSeq || timers.current.has(targetId)) return;
    intent.current = null;
    if (inFlight.current === 0 && timers.current.size === 0) {
      setSaveState("saved");
      setError(null);
    }
  }

  function track(work: () => Promise<PersistenceResult>, sentSeq: number, targetId: string) {
    inFlight.current += 1;
    setSaveState("saving");
    setError(null);
    return work()
      .then((result) => {
        noteWrite(result, sentSeq, targetId);
        return result;
      })
      .finally(() => {
        inFlight.current = Math.max(0, inFlight.current - 1);
        if (inFlight.current === 0 && timers.current.size === 0) {
          setSaveState((state) => (state === "saving" ? "saved" : state));
        }
      });
  }

  function revisionOf(id: string, fallback: number) {
    return revisionRef.current.get(id) ?? fallback;
  }

  function readUserCrop(frameId: string): CropTriple | null {
    const frame = viewRef.current?.spreads.flatMap((spread) => spread.sourceFrames).find((item) => item.id === frameId);
    if (!frame || (frame.userCropX == null && frame.userCropY == null && frame.userCropScale == null)) return null;
    return { x: frame.userCropX ?? 0.5, y: frame.userCropY ?? 0.5, scale: frame.userCropScale ?? 1 };
  }

  function writeLayout(spreadId: string, layoutId: string | null, record = true) {
    const current = viewRef.current;
    const spread = current?.spreads.find((item) => item.id === spreadId);
    if (!current || !spread || readonly) return;
    const before = spread.userLayoutId;
    const nextSeq = bump(spreadId, spread.source.clientSeq);
    const revision = revisionOf(spreadId, spread.source.revision);
    intent.current = { kind: "layout", spreadId, layoutId };
    const nextView = applySpreadLayout(current, spreadId, layoutId, nextSeq);
    viewRef.current = nextView;
    setView(nextView);
    if (record) history.push({ targetId: spreadId, field: "layout", before, after: layoutId });
    void track(() => overrideSpreadLayout(spreadId, revision, nextSeq, layoutId), nextSeq, spreadId);
  }

  function writeCrop(frameId: string, crop: CropTriple | null, debounce: boolean, record = true) {
    const current = viewRef.current;
    const spread = current?.spreads.find((item) => item.sourceFrames.some((frame) => frame.id === frameId));
    const frame = spread?.sourceFrames.find((item) => item.id === frameId);
    if (!current || !frame || readonly) return;
    const before = readUserCrop(frameId);
    const nextSeq = bump(frameId, frame.clientSeq);
    const revision = revisionOf(frameId, frame.revision);
    intent.current = { kind: "crop", frameId, crop };
    const nextView = applyFrameCrop(current, frameId, crop, nextSeq);
    viewRef.current = nextView;
    setView(nextView);
    const pending = timers.current.get(frameId);
    if (pending) clearTimeout(pending);
    const send = () => {
      timers.current.delete(frameId);
      void track(() => overrideFrameCrop(frameId, revision, nextSeq, crop), nextSeq, frameId);
    };
    if (record) {
      const edit = { targetId: frameId, field: "crop" as const, before, after: crop };
      if (debounce) history.note(edit);
      else history.push(edit);
    }
    if (!debounce) {
      send();
      return;
    }
    setSaveState("saving");
    timers.current.set(frameId, setTimeout(send, AUTOSAVE_DEBOUNCE_MS));
  }

  function writePhoto(frameId: string, photoId: string | null, previewUrl?: string, record = true) {
    const current = viewRef.current;
    const spread = current?.spreads.find((item) => item.sourceFrames.some((frame) => frame.id === frameId));
    const frame = spread?.sourceFrames.find((item) => item.id === frameId);
    if (!current || !frame || readonly) return;
    const before = frame.userPhotoId;
    const nextSeq = bump(frameId, frame.clientSeq);
    const revision = revisionOf(frameId, frame.revision);
    intent.current = { kind: "photo", frameId, photoId, previewUrl };
    const nextView = applyFramePhoto(current, frameId, photoId, nextSeq, previewUrl);
    viewRef.current = nextView;
    setView(nextView);
    if (record) history.push({ targetId: frameId, field: "photo", before, after: photoId });
    void track(() => overrideFramePhoto(frameId, revision, nextSeq, photoId), nextSeq, frameId);
  }

  function targetParts(targetId: string) {
    const [, spreadId, ...rest] = targetId.split(":");
    return { spreadId, slotId: rest.join(":") };
  }

  function writeText(spreadId: string, slotId: string, next: { mode: OverrideMode; text: string | null; styleId: TextStyleId | null }, field: "text" | "textStyle", debounce: boolean, record: boolean) {
    const current = viewRef.current;
    const spread = current?.spreads.find((item) => item.id === spreadId);
    const kind = slotKind(slotId);
    if (!current || !spread || !kind || readonly) return;
    const issue = textSlotIssue(spread.effectiveLayoutId, slotId, kind) ?? plainTextIssue(kind, next.text) ?? styleIssue(next.styleId);
    if (issue) {
      setSaveState("error");
      setError(issue);
      return;
    }
    const before = textUserSnapshot(spread.texts.find((item) => item.slotId === slotId));
    const targetId = textTargetId(spreadId, slotId);
    const row = spread.texts.find((item) => item.slotId === slotId);
    const nextSeq = bump(targetId, row?.clientSeq ?? 0);
    const revision = revisionOf(targetId, row?.revision ?? 0);
    intent.current = { kind: "text", spreadId, slotId, mode: next.mode, text: next.text, styleId: next.styleId };
    const nextView = applyTextState(current, spreadId, slotId, { ...next, kind }, nextSeq);
    viewRef.current = nextView;
    setView(nextView);
    const pending = timers.current.get(targetId);
    if (pending) clearTimeout(pending);
    const send = () => {
      timers.current.delete(targetId);
      void track(() => overrideSpreadText(spreadId, slotId, kind, revision, nextSeq, next.mode, next.text, next.styleId), nextSeq, targetId);
    };
    if (record) {
      if (field === "textStyle") {
        history.push({ targetId, field: "textStyle", before: before.styleId, after: next.styleId });
      } else {
        const edit = {
          targetId,
          field: "text" as const,
          before: { mode: before.mode, text: before.text } satisfies TextOverrideSnapshot,
          after: { mode: next.mode, text: next.text } satisfies TextOverrideSnapshot,
        };
        if (debounce) history.note(edit);
        else history.push(edit);
      }
    }
    if (!debounce) {
      send();
      return;
    }
    setSaveState("saving");
    timers.current.set(targetId, setTimeout(send, AUTOSAVE_DEBOUNCE_MS));
  }

  function writeDecoration(spreadId: string, slotId: string, next: DecorationOverrideSnapshot, record: boolean) {
    const current = viewRef.current;
    const spread = current?.spreads.find((item) => item.id === spreadId);
    if (!current || !spread || readonly) return;
    const issue = decorationSlotIssue(spread.effectiveLayoutId, slotId);
    if (issue) {
      setSaveState("error");
      setError(issue);
      return;
    }
    const before = decorationUserSnapshot(spread.decorations.find((item) => item.slotId === slotId));
    const preview = applyDecorationState(current, spreadId, slotId, next, 0);
    const previewSpread = preview.spreads.find((item) => item.id === spreadId);
    const previewRow = previewSpread?.decorations.find((item) => item.slotId === slotId);
    if (!previewRow || !previewSpread || !canPlaceDecoration(spread.decorations, slotId, previewRow)) {
      setSaveState("error");
      setError("装飾は見開きあたり3つまでです。");
      return;
    }
    const targetId = decorationTargetId(spreadId, slotId);
    const row = spread.decorations.find((item) => item.slotId === slotId);
    const nextSeq = bump(targetId, row?.clientSeq ?? 0);
    const revision = revisionOf(targetId, row?.revision ?? 0);
    intent.current = {
      kind: "decoration",
      spreadId,
      slotId,
      mode: next.mode,
      decorationId: next.decorationId,
      scale: next.scale,
    };
    const pending = timers.current.get(targetId);
    if (pending) clearTimeout(pending);
    const nextView = applyDecorationState(current, spreadId, slotId, next, nextSeq);
    viewRef.current = nextView;
    setView(nextView);
    if (record) history.push({ targetId, field: "decoration", before, after: next });
    void track(() => overrideSpreadDecoration(spreadId, slotId, revision, nextSeq, next.mode, next.decorationId, next.scale), nextSeq, targetId);
  }

  function writePageElement(spreadId: string, elementId: string, next: PageElement | null, record = true, debounce = false) {
    const current = viewRef.current;
    const spread = current?.spreads.find((item) => item.id === spreadId);
    const before = spread?.elements.find((item) => item.id === elementId) ?? null;
    if (!current || !spread || readonly) return;
    const normalized = next ? normalizePageElement(next) : null;
    if (next && (!normalized || normalized.id !== elementId)) {
      setSaveState("error");
      setError("要素の内容が不正です。");
      return;
    }
    const targetId = `element:${spreadId}:${elementId}`;
    const nextSeq = bump(targetId, before?.clientSeq ?? 0);
    const revision = revisionOf(targetId, before?.revision ?? 0);
    const element = normalized ? { ...normalized, revision, clientSeq: nextSeq } : null;
    intent.current = { kind: "element", spreadId, elementId, element };
    revisionRef.current.set(targetId, revision);
    const nextView: PersistedDraftView = {
      ...current,
      spreads: current.spreads.map((item) => {
        if (item.id !== spreadId) return item;
        const elements = item.elements.filter((candidate) => candidate.id !== elementId);
        if (element) elements.push(element);
        return { ...item, elements };
      }),
    };
    viewRef.current = nextView;
    setView(nextView);
    if (record) {
      const edit = { targetId, field: "element" as const, before, after: element };
      if (debounce) history.note(edit);
      else history.push(edit);
    }
    const pending = timers.current.get(targetId);
    if (pending) clearTimeout(pending);
    const send = () => {
      timers.current.delete(targetId);
      void track(() => overridePageElement(spreadId, elementId, revision, nextSeq, element), nextSeq, targetId);
    };
    if (!debounce) {
      send();
      return;
    }
    setSaveState("saving");
    timers.current.set(targetId, setTimeout(send, AUTOSAVE_DEBOUNCE_MS));
  }

  function writeBackground(spreadId: string, pageSide: PageSide, backgroundId: ElementBackgroundId | null, record = true) {
    const current = viewRef.current;
    const spread = current?.spreads.find((item) => item.id === spreadId);
    if (!current || !spread || readonly) return;
    const targetId = `background:${spreadId}:${pageSide}`;
    const before = spread.backgrounds[pageSide];
    const nextSeq = bump(targetId, before.clientSeq);
    const revision = revisionOf(targetId, before.revision);
    intent.current = { kind: "background", spreadId, pageSide, backgroundId };
    revisionRef.current.set(targetId, revision);
    const nextView: PersistedDraftView = {
      ...current,
      spreads: current.spreads.map((item) => (item.id === spreadId ? { ...item, backgrounds: { ...item.backgrounds, [pageSide]: { backgroundId, revision, clientSeq: nextSeq } } } : item)),
    };
    viewRef.current = nextView;
    setView(nextView);
    if (record) history.push({ targetId, field: "background", before: before.backgroundId, after: backgroundId });
    void track(() => overrideSpreadBackground(spreadId, pageSide, revision, nextSeq, backgroundId), nextSeq, targetId);
  }

  function writeRecommendationSnapshot(spreadId: string, next: RecommendationSnapshot, record: boolean) {
    const spread = viewRef.current?.spreads.find((item) => item.id === spreadId);
    if (!spread || readonly) return;
    const before: RecommendationSnapshot = {
      elements: spread.elements.filter((element) => element.recommendationId?.startsWith("task059:")),
      backgrounds: { left: spread.backgrounds.left.backgroundId, right: spread.backgrounds.right.backgroundId },
    };
    if (record) {
      history.push({ targetId: `recommendation:${spreadId}`, field: "recommendation", before, after: next });
    }
    const elementIds = new Set([...before.elements.map((element) => element.id), ...next.elements.map((element) => element.id)]);
    for (const elementId of elementIds) {
      const target = next.elements.find((element) => element.id === elementId) ?? null;
      const current = spread.elements.find((element) => element.id === elementId);
      if (!current || !target || JSON.stringify(current) !== JSON.stringify(target)) {
        writePageElement(spreadId, elementId, target, false, false);
      }
    }
    for (const side of ["left", "right"] as const) {
      if (spread.backgrounds[side].backgroundId !== next.backgrounds[side]) {
        writeBackground(spreadId, side, next.backgrounds[side], false);
      }
    }
  }

  function applyDecorationRecommendation(spreadId: string, change: RecommendationChange) {
    const current = viewRef.current?.spreads.find((item) => item.id === spreadId);
    if (!current || readonly) return false;
    const ownedByRecommendation = (element: PageElement) => element.recommendationId?.startsWith("task059:") === true;
    const userElements = current.elements.filter((element) => !ownedByRecommendation(element));
    const hasUserPolish = current.texts.some((item) => item.overrideMode !== "inherit") || current.decorations.some((item) => item.overrideMode !== "inherit");
    const previousAi = current.elements.filter(ownedByRecommendation);
    const backgroundsAreAiOwned = previousAi.some((element) =>
      ["left", "right"].every((side) => {
        const expected = element.recommendationBackgroundsAfter?.[side as PageSide];
        return expected === undefined || expected === current.backgrounds[side as PageSide].backgroundId;
      }),
    );
    const hasManualBackground = (["left", "right"] as const).some((side) => current.backgrounds[side].backgroundId != null && !backgroundsAreAiOwned);
    if (userElements.length > 0 || hasUserPolish || hasManualBackground) {
      setError("手動で追加した要素を保護するため、AI提案は適用できません。");
      return false;
    }
    const before: RecommendationSnapshot = {
      elements: previousAi,
      backgrounds: { left: current.backgrounds.left.backgroundId, right: current.backgrounds.right.backgroundId },
    };
    const inheritedBackgrounds = previousAi.find((element) => element.recommendationBackgroundsBefore)?.recommendationBackgroundsBefore;
    const backgroundBaseline = {
      left: inheritedBackgrounds?.left ?? before.backgrounds.left,
      right: inheritedBackgrounds?.right ?? before.backgrounds.right,
    };
    const nextBackgrounds = { ...backgroundBaseline, ...change.backgrounds };
    const recommendationId = `task059:${crypto.randomUUID()}`;
    const next: RecommendationSnapshot = {
      backgrounds: nextBackgrounds,
      elements: change.elements.map((element) => ({
        ...element,
        recommendationId,
        recommendationBackgroundsBefore: backgroundBaseline,
        recommendationBackgroundsAfter: nextBackgrounds,
      })),
    };
    writeRecommendationSnapshot(spreadId, next, true);
    setSaveState("saving");
    return true;
  }

  function clearAIRecommendations(spreadId: string) {
    const current = viewRef.current?.spreads.find((item) => item.id === spreadId);
    if (!current || readonly) return false;
    const recommendations = current.elements.filter((element) => element.recommendationId?.startsWith("task059:"));
    if (recommendations.length === 0) return false;
    const backgrounds = { left: current.backgrounds.left.backgroundId, right: current.backgrounds.right.backgroundId };
    for (const element of recommendations) {
      for (const side of ["left", "right"] as const) {
        const applied = element.recommendationBackgroundsAfter?.[side];
        if (applied !== undefined && backgrounds[side] === applied) {
          backgrounds[side] = element.recommendationBackgroundsBefore?.[side] ?? null;
        }
      }
    }
    writeRecommendationSnapshot(spreadId, { elements: [], backgrounds }, true);
    setSaveState("saving");
    return true;
  }

  function applyEntry(entry: EditorHistoryEntry, value: unknown) {
    if (entry.field === "layout") writeLayout(entry.targetId, (value as string | null) ?? null, false);
    if (entry.field === "crop") writeCrop(entry.targetId, (value as CropTriple | null) ?? null, false, false);
    if (entry.field === "photo") {
      const photoId = (value as string | null) ?? null;
      writePhoto(entry.targetId, photoId, photoId ? viewRef.current?.previewUrls[photoId] : undefined, false);
    }
    if (entry.field === "text" || entry.field === "textStyle") {
      const { spreadId, slotId } = targetParts(entry.targetId);
      const spread = viewRef.current?.spreads.find((item) => item.id === spreadId);
      const current = textUserSnapshot(spread?.texts.find((item) => item.slotId === slotId));
      if (entry.field === "text") {
        const snap = value as TextOverrideSnapshot;
        writeText(spreadId, slotId, { mode: snap.mode, text: snap.text, styleId: current.styleId }, "text", false, false);
      } else {
        writeText(spreadId, slotId, { ...current, styleId: (value as TextStyleId | null) ?? null }, "textStyle", false, false);
      }
    }
    if (entry.field === "decoration") {
      const { spreadId, slotId } = targetParts(entry.targetId);
      writeDecoration(spreadId, slotId, value as DecorationOverrideSnapshot, false);
    }
    if (entry.field === "element") {
      const { spreadId, slotId: elementId } = targetParts(entry.targetId);
      writePageElement(spreadId, elementId, (value as PageElement | null) ?? null, false);
    }
    if (entry.field === "background") {
      const { spreadId, slotId } = targetParts(entry.targetId);
      writeBackground(spreadId, slotId as PageSide, (value as ElementBackgroundId | null) ?? null, false);
    }
    if (entry.field === "recommendation") {
      const { spreadId } = targetParts(entry.targetId);
      writeRecommendationSnapshot(spreadId, value as RecommendationSnapshot, false);
    }
  }

  function spreadIdOf(entry: EditorHistoryEntry) {
    const current = viewRef.current;
    if (!current) return null;
    if (entry.field === "layout") return entry.targetId;
    if (entry.field === "text" || entry.field === "textStyle" || entry.field === "decoration" || entry.field === "element" || entry.field === "background" || entry.field === "recommendation") {
      return targetParts(entry.targetId).spreadId || null;
    }
    return current.spreads.find((spread) => spread.sourceFrames.some((frame) => frame.id === entry.targetId))?.id ?? null;
  }

  function undo() {
    if (readonly || !viewRef.current) return null;
    const entry = history.undo();
    if (!entry) return null;
    applyEntry(entry, entry.before);
    return spreadIdOf(entry);
  }

  function redo() {
    if (readonly || !viewRef.current) return null;
    const entry = history.redo();
    if (!entry) return null;
    applyEntry(entry, entry.after);
    return spreadIdOf(entry);
  }

  function retry() {
    const pending = intent.current;
    if (!pending || readonly) return;
    if (pending.kind === "layout") writeLayout(pending.spreadId, pending.layoutId);
    if (pending.kind === "crop") writeCrop(pending.frameId, pending.crop, false);
    if (pending.kind === "photo") writePhoto(pending.frameId, pending.photoId, pending.previewUrl);
    if (pending.kind === "text") {
      writeText(pending.spreadId, pending.slotId, pending, "text", false, false);
    }
    if (pending.kind === "decoration") writeDecoration(pending.spreadId, pending.slotId, pending, false);
    if (pending.kind === "element") writePageElement(pending.spreadId, pending.elementId, pending.element, false, false);
    if (pending.kind === "background") writeBackground(pending.spreadId, pending.pageSide, pending.backgroundId, false);
  }

  async function refreshUrls() {
    const refreshed = await refreshDraftPhotoUrls(albumId);
    if (!refreshed.ok) return;
    setView((current) => {
      if (!current) return current;
      const next = applyPreviewUrls(current, refreshed.urls);
      viewRef.current = next;
      return next;
    });
  }

  return {
    view,
    saveState,
    error,
    setLayout: (spreadId: string, layoutId: string | null) => writeLayout(spreadId, layoutId, true),
    beginCrop: (frameId: string) => {
      if (readonly) return;
      history.beginGesture({ targetId: frameId, field: "crop", before: readUserCrop(frameId), after: readUserCrop(frameId) });
    },
    endCrop: () => history.endGesture(),
    setCrop: (frameId: string, crop: CropTriple) => writeCrop(frameId, crop, true, true),
    resetCrop: (frameId: string) => writeCrop(frameId, null, false, true),
    setPhoto: (frameId: string, photoId: string | null, previewUrl?: string) => writePhoto(frameId, photoId, previewUrl, true),
    resetPhoto: (frameId: string) => writePhoto(frameId, null, undefined, true),
    setText: (spreadId: string, slotId: string, text: string) => {
      const spread = viewRef.current?.spreads.find((item) => item.id === spreadId);
      const current = textUserSnapshot(spread?.texts.find((item) => item.slotId === slotId));
      writeText(spreadId, slotId, { mode: "replace", text, styleId: current.styleId }, "text", true, true);
    },
    setTextStyle: (spreadId: string, slotId: string, styleId: TextStyleId | null) => {
      const spread = viewRef.current?.spreads.find((item) => item.id === spreadId);
      const current = textUserSnapshot(spread?.texts.find((item) => item.slotId === slotId));
      writeText(spreadId, slotId, { mode: current.mode, text: current.text, styleId }, "textStyle", false, true);
    },
    setTextMode: (spreadId: string, slotId: string, mode: "inherit" | "hidden") => {
      const spread = viewRef.current?.spreads.find((item) => item.id === spreadId);
      const current = textUserSnapshot(spread?.texts.find((item) => item.slotId === slotId));
      if (mode === "inherit" && current.styleId) {
        history.push({
          targetId: textTargetId(spreadId, slotId),
          field: "textStyle",
          before: current.styleId,
          after: null,
        });
      }
      writeText(spreadId, slotId, mode === "inherit" ? { mode, text: null, styleId: null } : { mode, text: current.text, styleId: current.styleId }, "text", false, true);
    },
    setDecoration: (spreadId: string, slotId: string, decorationId: string | null, scale: ScalePreset | null) => {
      if (decorationId != null && !isDecorationId(decorationId)) {
        setSaveState("error");
        setError("未対応の装飾です。");
        return;
      }
      writeDecoration(spreadId, slotId, { mode: "replace", decorationId: decorationId ?? null, scale: scale ?? "small" }, true);
    },
    setDecorationMode: (spreadId: string, slotId: string, mode: "inherit" | "hidden") => {
      const spread = viewRef.current?.spreads.find((item) => item.id === spreadId);
      const current = decorationUserSnapshot(spread?.decorations.find((item) => item.slotId === slotId));
      writeDecoration(spreadId, slotId, mode === "inherit" ? { mode, decorationId: null, scale: null } : { mode, decorationId: current.decorationId, scale: current.scale }, true);
    },
    beginPageElementGesture: (spreadId: string, elementId: string) => {
      if (readonly) return;
      const element = viewRef.current?.spreads.find((item) => item.id === spreadId)?.elements.find((item) => item.id === elementId);
      history.beginGesture({ targetId: `element:${spreadId}:${elementId}`, field: "element", before: element ?? null, after: element ?? null });
    },
    endPageElementGesture: () => history.endGesture(),
    setPageElement: (spreadId: string, elementId: string, element: PageElement | null, debounce = false) => writePageElement(spreadId, elementId, element ? { ...element, recommendationId: undefined, recommendationBackgroundsBefore: undefined, recommendationBackgroundsAfter: undefined } : null, true, debounce),
    setPageBackground: (spreadId: string, pageSide: PageSide, backgroundId: ElementBackgroundId | null) => writeBackground(spreadId, pageSide, backgroundId, true),
    applyDecorationRecommendation,
    clearAIRecommendations,
    undo,
    redo,
    canUndo: !readonly && Boolean(view) && history.canUndo,
    canRedo: !readonly && Boolean(view) && history.canRedo,
    retry,
    refreshUrls,
  };
}
