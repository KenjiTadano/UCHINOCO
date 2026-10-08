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

type Intent = { field: CoverField; value: string | null; previewUrl?: string };

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
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const inFlight = useRef(0);
  const intent = useRef<Intent | null>(null);
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

  function noteWrite(result: CoverWriteResult, sentSeq: number) {
    const saved = result.cover;
    if (saved) {
      setCover((current) => {
        const base = current ?? coverRef.current;
        if (!base) return saved;
        if (!result.ok || base.clientSeq > sentSeq) return base;
        const next = mergeServerCover(base, saved, sentSeq);
        if (next === saved) {
          seqRef.current = Math.max(seqRef.current, next.clientSeq);
          revisionRef.current = next.revision;
        }
        coverRef.current = next;
        return next;
      });
    }
    if (!result.ok || result.writeStatus === "conflict") {
      setSaveState("error");
      setError(presentSaveError(result.message));
      return;
    }
    if (result.writeStatus === "stale") {
      const newer = seqRef.current > sentSeq || timer.current != null;
      if (!newer) {
        setSaveState("error");
        setError(presentSaveError(result.message ?? "保存が競合しました。再試行できます。"));
      }
      return;
    }
    if (seqRef.current > sentSeq || timer.current) return;
    intent.current = null;
    if (inFlight.current === 0 && !timer.current) {
      setSaveState("saved");
      setError(null);
    }
  }

  function track(work: () => Promise<CoverWriteResult>, sentSeq: number) {
    inFlight.current += 1;
    setSaveState("saving");
    setError(null);
    return work()
      .then((result) => {
        noteWrite(result, sentSeq);
        return result;
      })
      .finally(() => {
        inFlight.current = Math.max(0, inFlight.current - 1);
        if (inFlight.current === 0 && !timer.current) {
          setSaveState((state) => (state === "saving" ? "saved" : state));
        }
      });
  }

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
    const before = userValue(field);
    const nextSeq = bump(current.clientSeq);
    const revision = revisionRef.current;
    intent.current = { field, value, previewUrl };
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
      queue.current = queue.current.then(
        () => track(() => overrideCover(current.id, revision, nextSeq, field, value), nextSeq),
        () => track(() => overrideCover(current.id, revision, nextSeq, field, value), nextSeq),
      );
    };
    if (!debounce) {
      pendingSend.current?.();
      send();
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    pendingSend.current = send;
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
    const pending = intent.current;
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
  };
}
