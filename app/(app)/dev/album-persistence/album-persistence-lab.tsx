"use client";

import { useMemo, useRef, useState } from "react";
import { BookDraftPreview } from "../album-draft/book-draft-preview";
import { beginAlbumAnalysisAudit, generatePetAlbum } from "../album-e2e/actions";
import { prepareGroupingPhoto } from "../photo-grouping/actions";
import type { AlbumGenerationResult } from "@/lib/album-generation/types";
import { AUTOSAVE_DEBOUNCE_MS } from "@/lib/album-persistence/config";
import { draftSignature, type PersistableSpread } from "@/lib/album-persistence/payload";
import type { CropTriple } from "@/lib/album-persistence/types";
import {
  loadPersistedDraft,
  overrideFrameCrop,
  overrideFramePhoto,
  overrideSpreadLayout,
  saveGeneratedDraft,
  type PersistedDraftView,
  type PersistedFrameView,
  type PersistenceResult,
} from "./actions";

export type PersistencePhotoOption = {
  id: string;
  petId: string;
  petName: string;
  takenAt: string | null;
};

type SaveState = "saved" | "saving" | "error";

function tokyoYearMonth(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" })
    .format(new Date(iso))
    .slice(0, 7);
}

function monthLabel(key: string) {
  if (!key) return "—";
  const [year, month] = key.split("-");
  return `${year}年${Number(month)}月`;
}

function cropText(crop: { x: number | null; y: number | null; scale: number | null } | null) {
  if (!crop || crop.x == null) return "NULL";
  return `${crop.x.toFixed(3)}, ${crop.y?.toFixed(3)}, ${crop.scale?.toFixed(3)}`;
}

function toPersistable(result: AlbumGenerationResult): PersistableSpread[] {
  return result.album.spreads.map((spread) => ({
    storySpreadId: spread.storySpreadId,
    layoutId: spread.layoutId,
    warnings: spread.warnings,
    story: {
      storyType: spread.story.storyType,
      recommendedDensity: spread.story.recommendedDensity,
      importance: spread.story.importance,
      coherenceScore: spread.story.coherenceScore,
    },
    assignments: spread.assignments.map((item) => ({
      frameId: item.frameId,
      role: item.role,
      photoId: item.photoId,
      crop: item.crop,
      cropQuality: item.cropQuality,
      matchTier: item.matchTier,
      warnings: item.warnings,
    })),
  }));
}

function refreshPreview<T extends { effectiveLayoutId: string; frames: PersistedFrameView[]; preview: PersistedDraftView["spreads"][number]["preview"] }>(
  spread: T,
): T {
  return {
    ...spread,
    preview: {
      ...spread.preview,
      layoutId: spread.effectiveLayoutId,
      assignments: spread.preview.assignments.map((assignment) => {
        const frame = spread.frames.find((item) => item.frameId === assignment.frameId);
        if (!frame) return assignment;
        return { ...assignment, photoId: frame.effectivePhotoId, crop: frame.effectiveCrop };
      }),
    },
  };
}

function patchFrame(view: PersistedDraftView, frameId: string, patch: (frame: PersistedFrameView) => PersistedFrameView) {
  return {
    ...view,
    spreads: view.spreads.map((spread) => {
      const frames = spread.frames.map((frame) => (frame.id === frameId ? patch(frame) : frame));
      return refreshPreview({ ...spread, frames });
    }),
  };
}

export function AlbumPersistenceLab({
  photos,
  initialPetId,
}: {
  photos: PersistencePhotoOption[];
  initialPetId: string | null;
}) {
  const [petId, setPetId] = useState(initialPetId ?? photos[0]?.petId ?? "");
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [generated, setGenerated] = useState<AlbumGenerationResult | null>(null);
  const [view, setView] = useState<PersistedDraftView | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inFlight = useRef(0);

  const petOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const photo of photos) map.set(photo.petId, photo.petName);
    return Array.from(map.entries());
  }, [photos]);
  const filtered = useMemo(() => photos.filter((photo) => photo.petId === petId), [photos, petId]);
  const months = useMemo(() => {
    const counts = new Map<string, number>();
    for (const photo of filtered) {
      if (!photo.takenAt) continue;
      const key = tokyoYearMonth(photo.takenAt);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);
  const activeMonth =
    monthKey && months.some(([key]) => key === monthKey)
      ? monthKey
      : [...months].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0] ?? "";

  function noteWrite(result: PersistenceResult, sentSeq: number, frameOrSpreadId: string) {
    inFlight.current = Math.max(0, inFlight.current - 1);
    if (!result.ok || !result.view) {
      setSaveState("error");
      setError(result.message ?? "保存に失敗しました。");
      return;
    }
    setView((current) => {
      if (!current) return result.view;
      const localFrame = current.spreads.flatMap((spread) => spread.frames).find((frame) => frame.id === frameOrSpreadId);
      const localSpread = current.spreads.find((spread) => spread.id === frameOrSpreadId);
      const localSeq = localFrame?.clientSeq ?? localSpread?.clientSeq ?? sentSeq;
      if (localSeq > sentSeq) return current;
      return result.view;
    });
    if (result.writeStatus === "conflict") {
      setSaveState("error");
      setError(result.message ?? "保存が競合しました。再試行できます。");
      return;
    }
    if (inFlight.current === 0) {
      setSaveState("saved");
      setError(null);
    }
  }

  function track<T>(work: () => Promise<T>) {
    inFlight.current += 1;
    setSaveState("saving");
    return work().finally(() => {
      if (inFlight.current === 0) setSaveState((state) => (state === "saving" ? "saved" : state));
    });
  }

  function queueFrame(frame: PersistedFrameView, crop: CropTriple, delayMs = 0) {
    const nextSeq = frame.clientSeq + 1;
    const revision = frame.revision;
    setView((current) =>
      current
        ? patchFrame(current, frame.id, (item) => ({
            ...item,
            clientSeq: nextSeq,
            userCrop: crop,
            effectiveCrop: crop,
          }))
        : current,
    );
    const key = frame.id;
    const existing = timers.current.get(key);
    if (existing) clearTimeout(existing);
    timers.current.set(
      key,
      setTimeout(() => {
        void track(() => overrideFrameCrop(frame.id, revision, nextSeq, crop, delayMs)).then((result) =>
          noteWrite(result, nextSeq, frame.id),
        );
      }, delayMs > 0 ? 0 : AUTOSAVE_DEBOUNCE_MS),
    );
  }

  async function generate() {
    if (!petId || !activeMonth) return;
    const [year, month] = activeMonth.split("-").map(Number);
    setPending("準備");
    setError(null);
    try {
      await beginAlbumAnalysisAudit();
      for (let index = 0; index < filtered.length; index += 1) {
        setPending(`${index + 1} / ${filtered.length}`);
        const prepared = await prepareGroupingPhoto(petId, filtered[index].id);
        if (!prepared.ok) setError(prepared.message ?? "準備に失敗しました。");
      }
      setPending("生成");
      const run = await generatePetAlbum(petId, { type: "monthly", year, month });
      if (!run.ok || !run.result) {
        setError(run.message ?? "生成に失敗しました。");
        return;
      }
      setGenerated(run.result);
    } finally {
      setPending(null);
    }
  }

  async function saveDraft() {
    if (!generated) return;
    setPending("保存");
    const result = await saveGeneratedDraft(
      petId,
      activeMonth,
      toPersistable(generated),
      generated.period,
      generated.warnings,
    );
    setPending(null);
    if (!result.ok || !result.view) {
      setError(result.message);
      setSaveState("error");
      return;
    }
    setView(result.view);
    setSaveState("saved");
    setError(null);
  }

  async function reload() {
    setPending("読込");
    const result = await loadPersistedDraft(petId, activeMonth);
    setPending(null);
    if (!result.ok || !result.view) {
      setError(result.message);
      return;
    }
    setView(result.view);
    setError(null);
  }

  function setLayout(spreadId: string, revision: number, clientSeq: number, layoutId: string | null) {
    const nextSeq = clientSeq + 1;
    setView((current) =>
      current
        ? {
            ...current,
            spreads: current.spreads.map((spread) =>
              spread.id === spreadId
                ? {
                    ...spread,
                    clientSeq: nextSeq,
                    userLayoutId: layoutId,
                    effectiveLayoutId: layoutId ?? spread.aiLayoutId,
                    preview: refreshPreview({
                      ...spread,
                      clientSeq: nextSeq,
                      userLayoutId: layoutId,
                      effectiveLayoutId: layoutId ?? spread.aiLayoutId,
                    }).preview,
                  }
                : spread,
            ),
          }
        : current,
    );
    void track(() => overrideSpreadLayout(spreadId, revision, nextSeq, layoutId)).then((result) =>
      noteWrite(result, nextSeq, spreadId),
    );
  }

  const second = view?.spreads[1];
  const secondary = second?.frames.find((frame) => frame.role === "secondary");
  const otherPhoto = filtered.find((photo) => photo.id !== secondary?.aiPhotoId);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-28 text-[#332f2b]">
      <header className="mb-6">
        <p className="m-0 text-[12px] font-semibold tracking-wide text-[#b36048]">Task058 · Dev</p>
        <h1 className="mt-1 text-[24px] font-bold">Album Persistence Lab</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[#6a5c54]">
          AIの初稿はそのまま残し、あとからの変更だけを別に保存します。
        </p>
      </header>
      <section className="mb-6 rounded-2xl border border-[#eadfd8] bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-[200px] text-[13px] font-semibold">
            Pet
            <select
              className="mt-1 w-full rounded-xl border border-[#eadfd8] bg-[#fcfaf7] px-3 py-2 text-[14px]"
              value={petId}
              onChange={(event) => {
                setPetId(event.target.value);
                setMonthKey(null);
                setView(null);
                setGenerated(null);
              }}
            >
              {petOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-[180px] text-[13px] font-semibold">
            Month
            <select
              className="mt-1 w-full rounded-xl border border-[#eadfd8] bg-[#fcfaf7] px-3 py-2 text-[14px]"
              data-testid="album-persistence-month"
              value={activeMonth}
              onChange={(event) => {
                setMonthKey(event.target.value);
                setView(null);
                setGenerated(null);
              }}
            >
              {months.map(([key, count]) => (
                <option key={key} value={key}>
                  {monthLabel(key)} · {count}枚
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            data-testid="album-persistence-generate"
            className="rounded-xl bg-[#b36048] px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
            disabled={Boolean(pending) || filtered.length === 0}
            onClick={() => void generate()}
          >
            {pending && !view ? pending : "Generate AI Draft"}
          </button>
          <button
            type="button"
            data-testid="album-persistence-save"
            className="rounded-xl border border-[#eadfd8] px-4 py-2.5 text-[14px] font-semibold disabled:opacity-50"
            disabled={!generated || Boolean(pending)}
            onClick={() => void saveDraft()}
          >
            Save Draft
          </button>
          <button
            type="button"
            data-testid="album-persistence-reload"
            className="rounded-xl border border-[#eadfd8] px-4 py-2.5 text-[14px] font-semibold disabled:opacity-50"
            disabled={Boolean(pending)}
            onClick={() => void reload()}
          >
            Reload Draft
          </button>
        </div>
        <p className="m-0 mt-3 text-[13px]" data-testid="album-persistence-save-state" data-state={saveState}>
          {saveState === "saving" ? "Saving..." : saveState === "error" ? "Save failed" : "Saved"}
        </p>
      </section>
      {error ? <p className="mb-4 rounded-xl bg-[#fdecea] px-4 py-3 text-[14px] text-[#a24129]">{error}</p> : null}
      {generated && !view ? (
        <p
          className="mb-4 text-[14px]"
          data-testid="album-persistence-generated"
          data-signature={draftSignature(toPersistable(generated))}
        >
          生成 {generated.album.spreads.map((spread) => spread.layoutId).join(" / ")} ·{" "}
          {generated.counts.draftPhotos} photos
        </p>
      ) : null}
      {view ? (
        <div className="space-y-4" data-testid="album-persistence-book" data-signature={view.signature}>
          {view.spreads.map((spread, index) => (
            <article
              key={spread.id}
              className="rounded-2xl border border-[#eadfd8] bg-white p-4"
              data-testid="album-persistence-spread"
              data-ai-layout={spread.aiLayoutId}
              data-user-layout={spread.userLayoutId ?? ""}
              data-effective-layout={spread.effectiveLayoutId}
            >
              <h2 className="m-0 text-[18px] font-bold">Spread {index + 1}</h2>
              <p className="m-0 mt-1 text-[13px]">
                AI Layout {spread.aiLayoutId} · User Layout {spread.userLayoutId ?? "NULL"} · Effective Layout{" "}
                {spread.effectiveLayoutId}
              </p>
              <div className="mt-2 space-y-1 text-[12px] text-[#6a5c54]">
                {spread.frames.map((frame) => (
                  <p
                    key={frame.id}
                    className="m-0"
                    data-testid="album-persistence-frame"
                    data-role={frame.role}
                    data-ai-photo={frame.aiPhotoId}
                    data-user-photo={frame.userPhotoId ?? ""}
                    data-effective-photo={frame.effectivePhotoId}
                    data-ai-crop={`${frame.aiCrop.x},${frame.aiCrop.y},${frame.aiCrop.scale}`}
                    data-user-crop={frame.userCrop ? `${frame.userCrop.x},${frame.userCrop.y},${frame.userCrop.scale}` : ""}
                    data-effective-crop={`${frame.effectiveCrop.x},${frame.effectiveCrop.y},${frame.effectiveCrop.scale}`}
                  >
                    {frame.role} · AI Crop {cropText(frame.aiCrop)} · User Crop {cropText(frame.userCrop)} · Effective{" "}
                    {cropText(frame.effectiveCrop)}
                    {frame.userPhotoId ? ` · User Photo ${frame.userPhotoId.slice(0, 8)}` : ""}
                  </p>
                ))}
              </div>
              {index === 2 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-testid="album-persistence-layout-override"
                    className="rounded-full border border-[#eadfd8] px-3 py-1 text-[12px]"
                    onClick={() =>
                      setLayout(spread.id, spread.revision, spread.clientSeq, spread.aiLayoutId === "L01b" ? "L01" : "L01b")
                    }
                  >
                    Layout {spread.aiLayoutId === "L01b" ? "L01" : "L01b"}
                  </button>
                  <button
                    type="button"
                    data-testid="album-persistence-reset-layout"
                    className="rounded-full border border-[#eadfd8] px-3 py-1 text-[12px]"
                    onClick={() => setLayout(spread.id, spread.revision, spread.clientSeq, null)}
                  >
                    Reset Layout to AI
                  </button>
                </div>
              ) : null}
              <div className="mt-4">
                <BookDraftPreview draft={{ ...spread.preview, layoutId: spread.effectiveLayoutId }} />
              </div>
            </article>
          ))}
          {secondary ? (
            <section className="rounded-2xl border border-[#eadfd8] bg-white p-4">
              <h2 className="m-0 text-[16px] font-bold">Spread 2 secondary</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="album-persistence-crop-nudge"
                  className="rounded-full border border-[#eadfd8] px-3 py-1 text-[12px]"
                  onPointerDown={(event) => {
                    const startX = event.clientX;
                    const origin = secondary.effectiveCrop.x;
                    const move = (next: PointerEvent) => {
                      const x = Math.min(0.95, Math.max(0.05, origin + (next.clientX - startX) / 240));
                      queueFrame(secondary, { ...secondary.effectiveCrop, x });
                    };
                    const up = () => {
                      window.removeEventListener("pointermove", move);
                      window.removeEventListener("pointerup", up);
                    };
                    window.addEventListener("pointermove", move);
                    window.addEventListener("pointerup", up);
                  }}
                >
                  Drag crop
                </button>
                <button
                  type="button"
                  data-testid="album-persistence-crop-zoom"
                  className="rounded-full border border-[#eadfd8] px-3 py-1 text-[12px]"
                  onClick={() =>
                    queueFrame(secondary, {
                      ...secondary.effectiveCrop,
                      scale: Math.min(2.2, secondary.effectiveCrop.scale + 0.12),
                    })
                  }
                >
                  Zoom
                </button>
                <button
                  type="button"
                  data-testid="album-persistence-reset-crop"
                  className="rounded-full border border-[#eadfd8] px-3 py-1 text-[12px]"
                  onClick={() => {
                    const nextSeq = secondary.clientSeq + 1;
                    setView((current) =>
                      current
                        ? patchFrame(current, secondary.id, (frame) => ({
                            ...frame,
                            clientSeq: nextSeq,
                            userCrop: null,
                            effectiveCrop: frame.aiCrop,
                          }))
                        : current,
                    );
                    void track(() => overrideFrameCrop(secondary.id, secondary.revision, nextSeq, null)).then((result) =>
                      noteWrite(result, nextSeq, secondary.id),
                    );
                  }}
                >
                  Reset Crop to AI
                </button>
                {otherPhoto ? (
                  <button
                    type="button"
                    data-testid="album-persistence-photo-swap"
                    className="rounded-full border border-[#eadfd8] px-3 py-1 text-[12px]"
                    onClick={() => {
                      const nextSeq = secondary.clientSeq + 1;
                      setView((current) =>
                        current
                          ? patchFrame(current, secondary.id, (frame) => ({
                              ...frame,
                              clientSeq: nextSeq,
                              userPhotoId: otherPhoto.id,
                              effectivePhotoId: otherPhoto.id,
                            }))
                          : current,
                      );
                      void track(() =>
                        overrideFramePhoto(secondary.id, secondary.revision, nextSeq, otherPhoto.id),
                      ).then((result) => noteWrite(result, nextSeq, secondary.id));
                    }}
                  >
                    別の写真
                  </button>
                ) : null}
                <button
                  type="button"
                  data-testid="album-persistence-reset-photo"
                  className="rounded-full border border-[#eadfd8] px-3 py-1 text-[12px]"
                  onClick={() => {
                    const nextSeq = secondary.clientSeq + 1;
                    setView((current) =>
                      current
                        ? patchFrame(current, secondary.id, (frame) => ({
                            ...frame,
                            clientSeq: nextSeq,
                            userPhotoId: null,
                            effectivePhotoId: frame.aiPhotoId,
                          }))
                        : current,
                    );
                    void track(() => overrideFramePhoto(secondary.id, secondary.revision, nextSeq, null)).then((result) =>
                      noteWrite(result, nextSeq, secondary.id),
                    );
                  }}
                >
                  Reset Photo
                </button>
                <button
                  type="button"
                  data-testid="album-persistence-race"
                  className="rounded-full border border-[#eadfd8] px-3 py-1 text-[12px]"
                  onClick={() => {
                    const base = secondary.effectiveCrop;
                    const revision = secondary.revision;
                    const start = secondary.clientSeq;
                    const steps = [0.04, 0.1, 0.18].map((delta, index) => ({
                      seq: start + index + 1,
                      delay: [900, 300, 0][index],
                      crop: { ...base, x: Math.min(0.95, base.x + delta) },
                    }));
                    const last = steps[2];
                    setView((current) =>
                      current
                        ? patchFrame(current, secondary.id, (frame) => ({
                            ...frame,
                            clientSeq: last.seq,
                            userCrop: last.crop,
                            effectiveCrop: last.crop,
                          }))
                        : current,
                    );
                    for (const step of steps) {
                      void track(() => overrideFrameCrop(secondary.id, revision, step.seq, step.crop, step.delay)).then(
                        (result) => noteWrite(result, step.seq, secondary.id),
                      );
                    }
                  }}
                >
                  Race crop
                </button>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
