"use client";

import { useMemo, useState } from "react";
import { prepareGroupingPhoto } from "../photo-grouping/actions";
import {
  selectPetAlbumCandidates,
  type AlbumCandidateCard,
  type AlbumCandidateRun,
} from "./actions";

export type AlbumCandidatePhotoOption = {
  id: string;
  petId: string;
  petName: string;
  takenAt: string | null;
};

const REASON_LABEL: Record<string, string> = {
  HIGH_MEMORY_VALUE: "思い出の価値が高い",
  BEST_SHOT_STRONG: "代表写真が強い",
  IMPROVES_TIME_COVERAGE: "期間の抜けを埋める",
  ADDS_ACTIVITY_DIVERSITY: "違う行動を足す",
  ADDS_VISUAL_DIVERSITY: "見た目の幅を足す",
  MUST_KEEP: "特に強い場面として残す",
  LOW_SCENE_SCORE: "場面の点数が低い",
  SAME_DAY_OVERREPRESENTED: "同じ日に寄りすぎる",
  ACTIVITY_REPETITION: "同じ行動が続いている",
  VISUAL_REPETITION: "同じ見え方が続いている",
  PHOTO_BUDGET_REACHED: "枚数の上限に達した",
  LOW_CONFIDENCE: "グループの確信度が低い",
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

function reasonText(reasons: string[]) {
  return reasons.map((reason) => REASON_LABEL[reason] ?? reason).join(" / ");
}

export function AlbumCandidatesLab({
  photos,
  initialPetId,
}: {
  photos: AlbumCandidatePhotoOption[];
  initialPetId: string | null;
}) {
  const [petId, setPetId] = useState(initialPetId ?? photos[0]?.petId ?? "");
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<AlbumCandidateRun | null>(null);
  const [monthKey, setMonthKey] = useState<string | null>(null);

  const petOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const photo of photos) map.set(photo.petId, photo.petName);
    return Array.from(map.entries());
  }, [photos]);

  const filtered = useMemo(
    () => photos.filter((photo) => photo.petId === petId),
    [photos, petId],
  );
  const petName = petOptions.find(([id]) => id === petId)?.[1] ?? "";
  const months = useMemo(() => monthCounts(filtered), [filtered]);
  const activeMonth =
    monthKey && months.some(([key]) => key === monthKey)
      ? monthKey
      : [...months].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0] ?? "";
  const periodPhotos = activeMonth
    ? filtered.filter((photo) => photo.takenAt && tokyoYearMonth(photo.takenAt) === activeMonth).length
    : 0;

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
      setProgress("選定中");
      const next = await selectPetAlbumCandidates(petId, { type: "monthly", year, month });
      setRun(next);
      if (!next.ok) setError(next.message);
    } finally {
      setPending(false);
      setProgress(null);
    }
  }

  const result = run?.result;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-28 text-[#332f2b]">
      <header className="mb-6">
        <p className="m-0 text-[12px] font-semibold tracking-wide text-[#b36048]">Task054.1 · Dev</p>
        <h1 className="mt-1 text-[24px] font-bold">Album Candidate Lab</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[#6a5c54]">
          その期間を振り返ったときに、いろんな思い出が残るように場面を選びます。点が高い順に、そのまま採用はしません。
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
              data-testid="album-candidate-month"
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
            data-testid="album-candidates-run"
            className="rounded-xl bg-[#b36048] px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
            disabled={pending || filtered.length === 0 || !activeMonth}
            onClick={() => void generate()}
          >
            {progress ? progress : "Generate Candidates"}
          </button>
        </div>
        <dl
          className="mt-4 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4"
          data-testid="album-candidate-source"
          data-pet={petName}
          data-photos={filtered.length}
          data-month={activeMonth}
          data-period-photos={periodPhotos}
        >
          <Stat label="期間" value={result ? periodRange(result.period.start, result.period.end) : monthLabel(activeMonth)} />
          <Stat label="Pet" value={petName || "—"} />
          <Stat label="Library photos" value={String(filtered.length)} />
          <Stat label="Period photos" value={String(periodPhotos)} />
        </dl>
      </section>

      {error ? (
        <p className="mb-4 rounded-xl bg-[#fdecea] px-4 py-3 text-[14px] text-[#a24129]">{error}</p>
      ) : null}

      {result ? (
        <div className="space-y-8">
          <section
            className="rounded-2xl border border-[#eadfd8] bg-white p-4"
            data-testid="album-candidate-stats"
            data-version={result.analysisVersion}
            data-period-type={result.period.type}
            data-period-start={result.period.start}
            data-period-end={result.period.end}
            data-available={result.stats.availablePhotoCount}
            data-period-photos={result.stats.periodPhotoCount}
            data-source={result.stats.sourcePhotoCount}
            data-scenes={result.stats.sceneCount}
            data-selected-scenes={result.stats.selectedSceneCount}
            data-selected-photos={result.stats.selectedPhotoCount}
            data-primary={result.stats.primaryCount}
            data-secondary={result.stats.secondaryCount}
            data-time={result.balance.timeCoverage}
            data-scene-diversity={result.balance.sceneDiversity}
            data-activity-diversity={result.balance.activityDiversity}
            data-visual-diversity={result.balance.visualDiversity}
            data-overall={result.balance.overall}
            data-dominant-activity={dominantLabel(result.balance.dominant.activity)}
            data-dominant-day={dominantLabel(result.balance.dominant.day)}
            data-dominant-scene={dominantLabel(result.balance.dominant.scene)}
            data-dominant-visual={dominantLabel(result.balance.dominant.visual)}
          >
            <h2 className="m-0 text-[16px] font-bold">Stats</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
              <Stat label="Library photos" value={String(result.stats.availablePhotoCount)} />
              <Stat label="Period photos" value={String(result.stats.periodPhotoCount)} />
              <Stat label="Scene Count" value={String(result.stats.sceneCount)} />
              <Stat label="Selected Scenes" value={String(result.stats.selectedSceneCount)} />
              <Stat label="Selected Photos" value={String(result.stats.selectedPhotoCount)} />
              <Stat label="Primary" value={String(result.stats.primaryCount)} />
              <Stat label="Secondary" value={String(result.stats.secondaryCount)} />
              <Stat label="Time Coverage" value={String(result.balance.timeCoverage)} />
              <Stat label="Activity Balance" value={String(result.balance.activityDiversity)} />
              <Stat label="Scene Balance" value={String(result.balance.sceneDiversity)} />
              <Stat label="Visual Balance" value={String(result.balance.visualDiversity)} />
              <Stat label="Balance overall" value={String(result.balance.overall)} />
              <Stat label="Dominant activity" value={dominantLabel(result.balance.dominant.activity)} />
              <Stat label="Dominant day" value={dominantLabel(result.balance.dominant.day)} />
              <Stat label="Version" value={result.analysisVersion} />
            </dl>
          </section>

          <SceneList title="Selected Scenes" testId="album-candidate-selected" cards={run.selected} />
          <SceneList title="Rejected Scenes" testId="album-candidate-rejected" cards={run.rejected} />
        </div>
      ) : null}
    </div>
  );
}

function tokyoYearMonth(iso: string) {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).format(new Date(iso));
  return formatted.slice(0, 7);
}

function monthCounts(photos: AlbumCandidatePhotoOption[]) {
  const counts = new Map<string, number>();
  for (const photo of photos) {
    if (!photo.takenAt) continue;
    const key = tokyoYearMonth(photo.takenAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function monthLabel(key: string) {
  if (!key) return "—";
  const [year, month] = key.split("-");
  return `${year}年${Number(month)}月`;
}

function periodRange(start: string, end: string) {
  return `${formatWhen(start)} – ${formatWhen(end)}`;
}

function dominantLabel(share: { key: string; ratio: number } | null) {
  if (!share) return "—";
  return `${share.key} ${Math.round(share.ratio * 100)}%`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[#8a7b72]">{label}</dt>
      <dd className="m-0 mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}

function SceneList({
  title,
  testId,
  cards,
}: {
  title: string;
  testId: string;
  cards: AlbumCandidateCard[];
}) {
  return (
    <section>
      <h2 className="m-0 text-[16px] font-bold">
        {title}
        <span className="ml-2 text-[13px] font-medium text-[#8a7b72]">{cards.length}</span>
      </h2>
      <div className="mt-3 grid gap-3">
        {cards.map((card) => (
          <article
            key={card.groupId}
            className="grid gap-3 rounded-2xl border border-[#eadfd8] bg-white p-3 sm:grid-cols-[180px_1fr]"
            data-testid={testId}
            data-group-id={card.groupId}
            data-primary={card.primaryPhotoId}
            data-secondary={card.secondaryPhotoId ?? ""}
            data-scene-score={card.sceneScore}
            data-effective={card.effectiveScore}
            data-reasons={card.selectionReason.join(",")}
            data-tags={card.tags.join(",")}
            data-activity={card.activity ?? ""}
            data-scene={card.scene ?? ""}
            data-started={card.startedAt}
            data-best-shot={card.bestShot}
            data-members={card.memberCount}
            data-member-ids={card.memberPhotoIds.join(",")}
          >
            <div className="flex gap-2">
              <Photo thumb={card.primaryThumbUrl} label="Primary" />
              {card.secondaryPhotoId ? <Photo thumb={card.secondaryThumbUrl} label="Secondary" /> : null}
            </div>
            <div className="min-w-0 text-[13px] leading-relaxed">
              <p className="m-0 font-semibold">
                {formatWhen(card.startedAt)} · {card.scene ?? "scene"} / {card.activity ?? "activity"}
              </p>
              <p className="m-0 mt-1 text-[#6a5c54]">
                Scene {card.sceneScore} · Effective {card.effectiveScore}
                {card.mustKeep ? " · must keep" : ""}
              </p>
              <p className="m-0 mt-1">{card.tags.join(" · ") || "タグなし"}</p>
              <p className="m-0 mt-1">{reasonText(card.selectionReason)}</p>
              <p className="m-0 mt-1 truncate text-[#8a7b72]">{card.primaryPhotoId}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Photo({ thumb, label }: { thumb: string | null; label: string }) {
  return (
    <figure className="m-0 w-[84px]">
      {thumb ? (
        <img src={thumb} alt="" className="h-[84px] w-[84px] rounded-xl object-cover" />
      ) : (
        <div className="h-[84px] w-[84px] rounded-xl bg-[#f3ece6]" />
      )}
      <figcaption className="mt-1 text-center text-[11px] text-[#8a7b72]">{label}</figcaption>
    </figure>
  );
}
