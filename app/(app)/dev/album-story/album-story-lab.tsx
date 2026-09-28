"use client";

import { useMemo, useState } from "react";
import { prepareGroupingPhoto } from "../photo-grouping/actions";
import { buildPetAlbumStory, type AlbumStoryRun, type StorySpreadCard } from "./actions";

export type AlbumStoryPhotoOption = {
  id: string;
  petId: string;
  petName: string;
  takenAt: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  single: "ひとつの場面",
  same_day: "同じ時間帯",
  event: "イベント",
  sequence: "流れ",
  contrast: "対比",
  everyday: "日常",
};

const DENSITY_LABEL: Record<string, string> = {
  hero: "ヒーロー",
  light: "軽め",
  medium: "ふつう",
  dense: "密",
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

export function AlbumStoryLab({
  photos,
  initialPetId,
}: {
  photos: AlbumStoryPhotoOption[];
  initialPetId: string | null;
}) {
  const [petId, setPetId] = useState(initialPetId ?? photos[0]?.petId ?? "");
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<AlbumStoryRun | null>(null);

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
      setProgress("まとめ中");
      const next = await buildPetAlbumStory(petId, { type: "monthly", year, month });
      setRun(next);
      if (!next.ok) setError(next.message);
    } finally {
      setPending(false);
      setProgress(null);
    }
  }

  const story = run?.story;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-28 text-[#332f2b]">
      <header className="mb-6">
        <p className="m-0 text-[12px] font-semibold tracking-wide text-[#b36048]">Task055 · Dev</p>
        <h1 className="mt-1 text-[24px] font-bold">Album Story Lab</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[#6a5c54]">
          残した場面を、枚数で切らず、一つの思い出として見られる見開きにまとめます。
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
              data-testid="album-story-month"
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
          <button
            type="button"
            data-testid="album-story-run"
            className="rounded-xl bg-[#b36048] px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
            disabled={pending || filtered.length === 0 || !activeMonth}
            onClick={() => void generate()}
          >
            {progress ? progress : "Generate Story"}
          </button>
        </div>
        <p className="m-0 mt-4 text-[13px] text-[#6a5c54]" data-testid="album-story-scope" data-month={activeMonth} data-pet={petName}>
          {petName || "ペット"} · {monthLabel(activeMonth)} · Library {filtered.length}枚
        </p>
      </section>

      {error ? (
        <p className="mb-4 rounded-xl bg-[#fdecea] px-4 py-3 text-[14px] text-[#a24129]">{error}</p>
      ) : null}

      {story ? (
        <div className="space-y-4">
          <section
            className="rounded-2xl border border-[#eadfd8] bg-white p-4"
            data-testid="album-story-stats"
            data-version={story.analysisVersion}
            data-period-type={story.period.type}
            data-period-start={story.period.start}
            data-period-end={story.period.end}
            data-scenes={story.stats.selectedSceneCount}
            data-photos={story.stats.selectedPhotoCount}
            data-spreads={story.stats.spreadCount}
            data-chronology={story.storyBalance.chronology}
            data-coherence={story.storyBalance.coherence}
            data-pacing={story.storyBalance.pacing}
          >
            <h2 className="m-0 text-[16px] font-bold">Story</h2>
            <p className="m-0 mt-1 text-[13px] text-[#6a5c54]">
              {formatWhen(story.period.start)} – {formatWhen(story.period.end)}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
              <Stat label="Selected scenes" value={String(story.stats.selectedSceneCount)} />
              <Stat label="Selected photos" value={String(story.stats.selectedPhotoCount)} />
              <Stat label="Spreads" value={String(story.stats.spreadCount)} />
              <Stat label="Chronology" value={String(story.storyBalance.chronology)} />
              <Stat label="Coherence" value={String(story.storyBalance.coherence)} />
              <Stat label="Pacing" value={String(story.storyBalance.pacing)} />
              <Stat label="Version" value={story.analysisVersion} />
            </dl>
          </section>
          <div className="space-y-3">
            {run.spreads.map((spread, index) => (
              <SpreadCard key={spread.id} spread={spread} index={index} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[#8a7b72]">{label}</dt>
      <dd className="m-0 mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}

function SpreadCard({ spread, index }: { spread: StorySpreadCard; index: number }) {
  return (
    <article
      className="rounded-2xl border border-[#eadfd8] bg-white p-4"
      data-testid="story-spread"
      data-spread-id={spread.id}
      data-type={spread.storyType}
      data-coherence={spread.coherenceScore}
      data-importance={spread.importance}
      data-density={spread.recommendedDensity}
      data-scenes={spread.sceneIds.length}
      data-photos={spread.photoIds.length}
      data-started={spread.startedAt}
      data-ended={spread.endedAt}
      data-scene-ids={spread.sceneIds.join(",")}
      data-photo-ids={spread.photoIds.join(",")}
      data-warnings={spread.warnings.join(",")}
    >
      <p className="m-0 text-[13px] font-semibold text-[#b36048]">Spread {index + 1}</p>
      <h2 className="m-0 mt-1 text-[16px] font-bold">
        {formatWhen(spread.startedAt)}
        {spread.endedAt !== spread.startedAt ? ` – ${formatWhen(spread.endedAt)}` : ""}
      </h2>
      <p className="m-0 mt-1 text-[13px] text-[#6a5c54]">
        {TYPE_LABEL[spread.storyType] ?? spread.storyType} · {spread.sceneIds.length} scenes · {spread.photoIds.length}{" "}
        photos · Coherence {spread.coherenceScore} · Importance {spread.importance} ·{" "}
        {DENSITY_LABEL[spread.recommendedDensity] ?? spread.recommendedDensity}
      </p>
      <p className="m-0 mt-1 text-[13px]">
        {[spread.theme.scene, spread.theme.activity, spread.theme.event, spread.theme.season].filter(Boolean).join(" · ")}
      </p>
      {spread.warnings.length > 0 ? (
        <p className="m-0 mt-1 text-[12px] text-[#a24129]">{spread.warnings.join(" / ")}</p>
      ) : null}
      <div className="mt-3 flex gap-2">
        {spread.photos.map((photo) => (
          <figure key={photo.photoId} className="m-0 w-[96px]">
            {photo.thumbUrl ? (
              <img src={photo.thumbUrl} alt="" className="h-[96px] w-[96px] rounded-xl object-cover" />
            ) : (
              <div className="h-[96px] w-[96px] rounded-xl bg-[#f3ece6]" />
            )}
            <figcaption className="mt-1 text-center text-[11px] text-[#8a7b72]">
              {photo.role === "secondary" ? "Secondary" : "Primary"}
            </figcaption>
          </figure>
        ))}
      </div>
    </article>
  );
}
