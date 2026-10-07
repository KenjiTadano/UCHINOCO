"use client";

import { useMemo, useState } from "react";
import { prepareGroupingPhoto } from "../photo-grouping/actions";
import { buildPetAlbumDraft, type AlbumDraftRun } from "./actions";
import { BookDraftPreview } from "./book-draft-preview";
import type { AlbumSpreadDraft } from "@/lib/album-draft/types";

export type AlbumDraftPhotoOption = {
  id: string;
  petId: string;
  petName: string;
  takenAt: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  ready: "そのまま使える",
  needs_adjustment: "調整候補",
  unusable: "使えない",
};

function formatWhen(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function tokyoYearMonth(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date(iso))
    .slice(0, 7);
}

function monthLabel(key: string) {
  if (!key) return "—";
  const [year, month] = key.split("-");
  return `${year}年${Number(month)}月`;
}

export function AlbumDraftLab({ photos, initialPetId }: { photos: AlbumDraftPhotoOption[]; initialPetId: string | null }) {
  const [petId, setPetId] = useState(initialPetId ?? photos[0]?.petId ?? "");
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<AlbumDraftRun | null>(null);

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
  const activeMonth = monthKey && months.some(([key]) => key === monthKey) ? monthKey : ([...months].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0] ?? "");
  const petName = petOptions.find(([id]) => id === petId)?.[1] ?? "";

  async function generate() {
    if (!petId || !activeMonth) return;
    const [year, month] = activeMonth.split("-").map(Number);
    setPending(true);
    setError(null);
    setRun(null);
    try {
      for (let index = 0; index < filtered.length; index++) {
        setProgress(`${index + 1} / ${filtered.length}`);
        const prepared = await prepareGroupingPhoto(petId, filtered[index].id);
        if (!prepared.ok) setError(prepared.message ?? "準備に失敗しました。");
      }
      setProgress("レイアウト中");
      const next = await buildPetAlbumDraft(petId, { type: "monthly", year, month });
      setRun(next);
      if (!next.ok) setError(next.message);
    } finally {
      setPending(false);
      setProgress(null);
    }
  }

  const draft = run?.draft;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-28 text-[#332f2b]">
      <header className="mb-6">
        <p className="m-0 text-[12px] font-semibold tracking-wide text-[#b36048]">Task056 · Dev</p>
        <h1 className="mt-1 text-[24px] font-bold">Album Draft Lab</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[#6a5c54]">見開きごとにレイアウトを選び、写真を枠へ割り当て、切り抜きまで入れた初稿です。</p>
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
                setRun(null);
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
              data-testid="album-draft-month"
              value={activeMonth}
              onChange={(event) => {
                setMonthKey(event.target.value);
                setRun(null);
              }}
            >
              {months.map(([key, count]) => (
                <option key={key} value={key}>
                  {monthLabel(key)} · {count}枚
                </option>
              ))}
            </select>
          </label>
          <button type="button" data-testid="album-draft-run" className="rounded-xl bg-[#b36048] px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50" disabled={pending || filtered.length === 0 || !activeMonth} onClick={() => void generate()}>
            {progress ? progress : "Generate Draft"}
          </button>
        </div>
        <p className="m-0 mt-4 text-[13px] text-[#6a5c54]" data-testid="album-draft-scope" data-month={activeMonth}>
          {petName || "ペット"} · {monthLabel(activeMonth)} · Library {filtered.length}枚
        </p>
      </section>

      {error ? <p className="mb-4 rounded-xl bg-[#fdecea] px-4 py-3 text-[14px] text-[#a24129]">{error}</p> : null}

      {draft ? (
        <div className="space-y-6">
          <p className="m-0 text-[13px] text-[#6a5c54]">
            {formatWhen(draft.period.start)} – {formatWhen(draft.period.end)} · {draft.analysisVersion}
          </p>
          {run.spreads.map((spread, index) => (
            <DraftCard key={spread.spreadId} spread={spread} index={index} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DraftCard({ spread, index }: { spread: AlbumSpreadDraft; index: number }) {
  const roles = spread.story.secondaryPhotoIds.length ? `Primary ${spread.story.primaryPhotoIds.length} / Secondary ${spread.story.secondaryPhotoIds.length}` : `Primary ${spread.story.primaryPhotoIds.length}`;
  return (
    <article
      className="rounded-2xl border border-[#eadfd8] bg-white p-4"
      data-testid="album-draft-spread"
      data-layout={spread.layoutId}
      data-status={spread.status}
      data-score={spread.layoutScore}
      data-engine={spread.engineScore}
      data-quality={spread.quality.overall}
      data-crop={spread.quality.cropSafety}
      data-hierarchy={spread.quality.hierarchy}
      data-photos={spread.assignments.map((assignment) => `${assignment.photoId}:${assignment.role}`).join(",")}
      data-tiers={spread.assignments.map((assignment) => assignment.matchTier).join(",")}
      data-warnings={spread.warnings.join(",")}
      data-layout-family={spread.rhythm?.family ?? "unknown"}
      data-rhythm-adjustment={spread.rhythm?.adjustment ?? 0}
      data-recent-families={spread.rhythm?.recentFamilies.join(",") ?? ""}
      data-hero-confidence={spread.heroConfidence ?? ""}
    >
      <p className="m-0 text-[13px] font-semibold text-[#b36048]">Spread {index + 1}</p>
      <h2 className="m-0 mt-1 text-[18px] font-bold">
        {formatWhen(spread.story.startedAt)} · {spread.layoutId || "—"}
      </h2>
      <p className="m-0 mt-1 text-[13px] text-[#6a5c54]">
        {spread.story.storyType} · {spread.story.recommendedDensity} · {roles} · Score {spread.layoutScore} · Engine {spread.engineScore} · Quality {spread.quality.overall} · {STATUS_LABEL[spread.status] ?? spread.status}
      </p>
      <p className="m-0 mt-1 text-[12px] text-[#8a7b72]">
        Crop {spread.quality.cropSafety} · Hierarchy {spread.quality.hierarchy} · Balance {spread.quality.balance} · Story {spread.quality.storyFit}
      </p>
      {spread.rhythm ? (
        <p className="m-0 mt-1 text-[12px] text-[#6a5c54]">
          Rhythm {spread.rhythm.family} {spread.rhythm.adjustment >= 0 ? "+" : ""}
          {spread.rhythm.adjustment} · Repeat {spread.rhythm.repeatStreak} · Gap {spread.rhythm.candidateGap ?? "N/A"} · Recent {spread.rhythm.recentFamilies.join(" → ") || "—"} · Hero confidence {spread.heroConfidence ?? "N/A"}
        </p>
      ) : null}
      {spread.alternatives.length > 0 ? <p className="m-0 mt-1 text-[12px] text-[#6a5c54]">Alternatives {spread.alternatives.map((alt) => `${alt.layoutId} ${alt.layoutScore} ${alt.matchTier}`).join(" / ")}</p> : null}
      {spread.warnings.length > 0 ? <p className="m-0 mt-1 text-[12px] text-[#a24129]">{spread.warnings.join(" / ")}</p> : null}
      <div className="mt-4">
        <BookDraftPreview draft={spread} />
      </div>
    </article>
  );
}
