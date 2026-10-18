"use client";

import { useEffect, useRef, useState } from "react";
import {
  overrideCover,
  refreshCoverPhotoUrls,
  type CoverSeed,
  type CoverWriteResult,
} from "@/app/(app)/album-draft-service";
import { AUTOSAVE_DEBOUNCE_MS } from "@/lib/album-persistence/config";
import {
  applyCoverColor,
  applyCoverPhoto,
  applyCoverSubtitle,
  applyCoverTemplate,
  applyCoverTitle,
  mergeServerCover,
  type CoverEditorModel,
  type CoverField,
} from "@/lib/album-persistence/cover";
import { presentSaveError } from "@/lib/album-persistence/editor";
import { useEditorHistory } from "@/lib/album-persistence/use-editor-history";
import type { EditorHistoryEntry } from "@/lib/album-persistence/history";
import type { CoverColorId, CoverTemplateId } from "@/lib/album-cover-templates";

type SaveState = "saved" | "saving" | "error";

type Intent = { field: CoverField; value: string | null; previewUrl?: string; seq: number };

export function useCoverEditDraft(
  initial: CoverEditorModel | null,
  albumId: string,
  seed: CoverSeed,
  readonly: boolean,
) {
  const [cover, setCover] = useState(initial);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(initial?.clientSeq ?? 0);
  const revisionRef = useRef(initial?.revision ?? 1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSend = useRef<(() => void) | null>(null);
  const pendingField = useRef<CoverField | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const inFlight = useRef(0);
  const intents = useRef(new Map<CoverField, Intent>());
  const failures = useRef(new Map<CoverField, string>());
  const queued = useRef(0);
  const coverRef = useRef(cover);
  const history = useEditorHistory("cover");

  useEffect(() => {
    coverRef.current = cover;
  }, [cover]);

  function bump(fallback: number) {
    const next = Math.max(seqRef.current, fallback) + 1;
    seqRef.current = next;
    return next;
  }

  function publishSaveState() {
    if (failures.current.size) {
      setSaveState("error");
      setError([...failures.current.values()][0]);
    } else if (timer.current || queued.current || inFlight.current) {
      setSaveState("saving");
      setError(null);
    } else {
      setSaveState("saved");
      setError(null);
    }
  }

  function noteWrite(result: CoverWriteResult, sent: Intent) {
    const saved = result.cover;
    const base = coverRef.current;
    if (saved && base && (saved.id !== base.id || saved.draftVersionId !== base.draftVersionId)) {
      failures.current.set(sent.field, "編集対象の初稿が変更されました。再読み込みしてください。");
      publishSaveState();
      return;
    }
    // The queue's next write needs the latest DB revision, even when this
    // response is too old to replace a newer optimistic cover.
    if (saved) revisionRef.current = Math.max(revisionRef.current, saved.revision);
    if (!result.ok || result.writeStatus === "conflict" || result.writeStatus === "stale" || result.writeStatus === "missing") {
      if (intents.current.get(sent.field)?.seq === sent.seq) {
        failures.current.set(sent.field, presentSaveError(result.message ?? "保存が競合しました。再試行できます。"));
      }
      publishSaveState();
      return;
    }
    if (intents.current.get(sent.field)?.seq === sent.seq) {
      intents.current.delete(sent.field);
      failures.current.delete(sent.field);
    }
    if (saved && base && seqRef.current <= sent.seq && !failures.current.size) {
      const next = mergeServerCover(base, saved, sent.seq);
      seqRef.current = Math.max(seqRef.current, next.clientSeq);
      coverRef.current = next;
      setCover(next);
    }
    publishSaveState();
  }

  async function track(sent: Intent, coverId: string) {
    inFlight.current++;
    publishSaveState();
    try {
      const result = await overrideCover(coverId, revisionRef.current, sent.seq, sent.field, sent.value);
      noteWrite(result, sent);
    } catch {
      if (intents.current.get(sent.field)?.seq === sent.seq) {
        failures.current.set(sent.field, "保存に失敗しました。再試行できます。");
      }
    } finally {
      inFlight.current = Math.max(0, inFlight.current - 1);
      queued.current = Math.max(0, queued.current - 1);
      publishSaveState();
    }
  }

  async function flushPending() {
    pendingSend.current?.();
    const waiting = queue.current;
    await waiting;
    return !failures.current.size && !timer.current && !queued.current && !inFlight.current;
  }

  useEffect(() => {
    const warnUnsaved = (event: BeforeUnloadEvent) => {
      if (timer.current || queued.current || inFlight.current || failures.current.size) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warnUnsaved);
    return () => window.removeEventListener("beforeunload", warnUnsaved);
  }, []);

  function userValue(field: CoverField) {
    const source = coverRef.current?.source;
    if (!source) return null;
    if (field === "photo") return source.userPhotoId;
    if (field === "title") return source.userTitle;
    if (field === "subtitle") return source.userSubtitle;
    if (field === "template") return source.userTemplateId;
    return source.userColorId;
  }

  function write(field: CoverField, value: string | null, debounce: boolean, previewUrl?: string, record = true) {
    const current = coverRef.current;
    if (!current || readonly) return;
    if (pendingSend.current && pendingField.current !== field) pendingSend.current();
    const before = userValue(field);
    const nextSeq = bump(current.clientSeq);
    const sent: Intent = { field, value, previewUrl, seq: nextSeq };
    intents.current.set(field, sent);
    let next = current;
    if (field === "photo") next = applyCoverPhoto(current, value, nextSeq, previewUrl);
    if (field === "title") next = applyCoverTitle(current, value, nextSeq);
    if (field === "subtitle") next = applyCoverSubtitle(current, value, nextSeq);
    if (field === "template") next = applyCoverTemplate(current, value as CoverTemplateId | null, nextSeq);
    if (field === "color") next = applyCoverColor(current, value as CoverColorId | null, nextSeq);
    coverRef.current = next;
    setCover(next);
    if (record) {
      const edit = { targetId: current.id, field, before, after: value };
      if (debounce) history.note(edit);
      else history.push(edit);
    }
    const send = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      pendingSend.current = null;
      pendingField.current = null;
      queued.current++;
      publishSaveState();
      queue.current = queue.current.then(() => track(sent, current.id));
    };
    if (!debounce) {
      pendingSend.current?.();
      send();
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    pendingSend.current = send;
    pendingField.current = field;
    setSaveState("saving");
    timer.current = setTimeout(send, AUTOSAVE_DEBOUNCE_MS);
  }

  function applyEntry(entry: EditorHistoryEntry, value: unknown) {
    if (entry.field !== "photo" && entry.field !== "title" && entry.field !== "subtitle" && entry.field !== "template" && entry.field !== "color") {
      return;
    }
    const next = (value as string | null) ?? null;
    const previewUrl = entry.field === "photo" && next ? coverRef.current?.previewUrls[next] : undefined;
    write(entry.field, next, false, previewUrl, false);
  }

  function undo() {
    if (readonly || !coverRef.current) return;
    const entry = history.undo();
    if (!entry) return;
    applyEntry(entry, entry.before);
  }

  function redo() {
    if (readonly || !coverRef.current) return;
    const entry = history.redo();
    if (!entry) return;
    applyEntry(entry, entry.after);
  }

  function retry() {
    const pending = [...intents.current.values()].find((item) => failures.current.has(item.field)) ?? [...intents.current.values()][0];
    if (!pending || readonly) return;
    write(pending.field, pending.value, false, pending.previewUrl);
  }

  async function refreshUrls() {
    const refreshed = await refreshCoverPhotoUrls(albumId, seed);
    if (!refreshed.ok) return;
    setCover((current) => {
      if (!current) return current;
      const next = {
        ...current,
        previewUrls: { ...current.previewUrls, ...refreshed.urls },
        previewUrl: current.photoId ? refreshed.urls[current.photoId] ?? current.previewUrl : current.previewUrl,
      };
      coverRef.current = next;
      return next;
    });
  }

  return {
    cover,
    saveState,
    error,
    setPhoto: (photoId: string | null, previewUrl?: string) => write("photo", photoId, false, previewUrl, true),
    setTitle: (title: string) => write("title", title, true, undefined, true),
    setSubtitle: (subtitle: string) => write("subtitle", subtitle, true, undefined, true),
    setTemplate: (templateId: CoverTemplateId) => write("template", templateId, false, undefined, true),
    setColor: (colorId: CoverColorId) => write("color", colorId, false, undefined, true),
    undo,
    redo,
    canUndo: !readonly && Boolean(cover) && history.canUndo,
    canRedo: !readonly && Boolean(cover) && history.canRedo,
    retry,
    refreshUrls,
    flushPending,
  };
}
