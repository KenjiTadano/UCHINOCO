"use client";

import { useEffect, useMemo, useState } from "react";
import { PHOTO_INTELLIGENCE_CONFIG } from "@/lib/photo-intelligence/config";
import type { PhotoIntelligence, TechnicalParts } from "@/lib/photo-intelligence/types";
import {
  analyzePhotoIntelligence,
  type PhotoIntelligenceAnalyzeResult,
} from "./actions";

export type PhotoIntelligenceOption = {
  id: string;
  petId: string;
  petName: string;
  thumbUrl: string | null;
  takenAt: string | null;
};

type Props = {
  photos: PhotoIntelligenceOption[];
  initialPetId: string | null;
  initialPhotoId: string | null;
};

type BatchRow = PhotoIntelligenceAnalyzeResult & {
  thumbUrl: string | null;
  takenAt: string | null;
};

const AXES: Array<{
  key: keyof Pick<
    PhotoIntelligence,
    | "technicalQuality"
    | "petVisibility"
    | "expression"
    | "composition"
    | "uniqueness"
    | "memoryValue"
  >;
  label: string;
  weight: number;
}> = [
  { key: "technicalQuality", label: "Technical", weight: PHOTO_INTELLIGENCE_CONFIG.weights.technicalQuality },
  { key: "petVisibility", label: "Pet Visibility", weight: PHOTO_INTELLIGENCE_CONFIG.weights.petVisibility },
  { key: "expression", label: "Expression", weight: PHOTO_INTELLIGENCE_CONFIG.weights.expression },
  { key: "composition", label: "Composition", weight: PHOTO_INTELLIGENCE_CONFIG.weights.composition },
  { key: "uniqueness", label: "Uniqueness", weight: PHOTO_INTELLIGENCE_CONFIG.weights.uniqueness },
  { key: "memoryValue", label: "Memory Value", weight: PHOTO_INTELLIGENCE_CONFIG.weights.memoryValue },
];

const TAG_LABELS: Record<string, string> = {
  home: "home",
  outdoors: "outdoors",
  travel: "travel",
  cafe: "cafe",
  park: "park",
  sleeping: "sleeping",
  playing: "playing",
  eating: "eating",
  looking_camera: "looking_camera",
  cuddling: "cuddling",
  walking: "walking",
  funny: "funny",
  calm: "calm",
  action: "action",
  portrait: "portrait",
  everyday: "everyday",
  event: "event",
};

function formatWhen(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function PhotoIntelligenceLab({ photos, initialPetId, initialPhotoId }: Props) {
  const [petId, setPetId] = useState(initialPetId ?? photos[0]?.petId ?? "");
  const [photoId, setPhotoId] = useState(
    initialPhotoId ?? photos.find((photo) => photo.petId === (initialPetId ?? photos[0]?.petId))?.id ?? "",
  );
  const [result, setResult] = useState<PhotoIntelligenceAnalyzeResult | null>(null);
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "error">("loading");

  const petOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const photo of photos) map.set(photo.petId, photo.petName);
    return Array.from(map.entries());
  }, [photos]);

  const filteredPhotos = useMemo(
    () => photos.filter((photo) => photo.petId === petId),
    [photos, petId],
  );

  const active = result?.intelligence;
  const previewSrc = result?.imageUrl ?? result?.previewUrl;

  useEffect(() => {
    setLoadState("loading");
  }, [previewSrc]);

  async function runOne(nextPetId: string, nextPhotoId: string, force: boolean) {
    if (!nextPetId || !nextPhotoId) return;
    setError(null);
    setPending(true);
    setProgress(null);
    try {
      const res = await analyzePhotoIntelligence(nextPetId, nextPhotoId, force);
      setResult(res);
      if (!res.ok || !res.intelligence) {
        setError(res.message ?? "評価に失敗しました。");
        return;
      }
      const option = photos.find((photo) => photo.id === nextPhotoId);
      setRows((current) => {
        const row: BatchRow = {
          ...res,
          thumbUrl: option?.thumbUrl ?? res.previewUrl,
          takenAt: option?.takenAt ?? null,
        };
        const without = current.filter((item) => item.photoId !== res.photoId);
        return [row, ...without];
      });
    } finally {
      setPending(false);
    }
  }

  async function runBatch() {
    const list = filteredPhotos.slice(0, 16);
    if (list.length === 0) return;
    setError(null);
    setPending(true);
    try {
      for (let index = 0; index < list.length; index++) {
        const photo = list[index];
        setProgress(`${index + 1} / ${list.length}`);
        setPhotoId(photo.id);
        const res = await analyzePhotoIntelligence(photo.petId, photo.id, false);
        const row: BatchRow = {
          ...res,
          thumbUrl: photo.thumbUrl ?? res.previewUrl,
          takenAt: photo.takenAt,
        };
        setRows((current) => {
          const without = current.filter((item) => item.photoId !== photo.id);
          return [...without, row];
        });
        if (res.ok && res.intelligence) setResult(res);
      }
    } finally {
      setPending(false);
      setProgress(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-28 text-[#332f2b]">
      <header className="mb-6">
        <p className="m-0 text-[12px] font-semibold tracking-wide text-[#b36048]">
          Task051 · Dev
        </p>
        <h1 className="mt-1 text-[24px] font-bold">Photo Intelligence Lab</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[#6a5c54]">
          1枚ごとの撮れ高です。画質だけでなく、見え方・表情・構図・珍しさ・思い出の残りやすさを分けて見ます。
          似た写真のグループ分けやベストショット選定はまだしません。
        </p>
      </header>

      <section className="mb-4 grid gap-3 rounded-2xl border border-[#eadfd8] bg-white p-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label className="block text-[13px] font-semibold">
          Pet
          <select
            className="mt-1 w-full rounded-xl border border-[#eadfd8] bg-[#fcfaf7] px-3 py-2 text-[14px]"
            value={petId}
            onChange={(event) => {
              const next = event.target.value;
              setPetId(next);
              const first = photos.find((photo) => photo.petId === next);
              setPhotoId(first?.id ?? "");
              setResult(null);
            }}
          >
            {petOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[13px] font-semibold">
          Photo
          <select
            className="mt-1 w-full rounded-xl border border-[#eadfd8] bg-[#fcfaf7] px-3 py-2 text-[14px]"
            value={photoId}
            onChange={(event) => {
              setPhotoId(event.target.value);
              setResult(null);
            }}
          >
            {filteredPhotos.map((photo) => (
              <option key={photo.id} value={photo.id}>
                {formatWhen(photo.takenAt) || photo.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-xl bg-[#b36048] px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
            disabled={pending || !petId || !photoId}
            onClick={() => runOne(petId, photoId, false)}
          >
            {pending && !progress ? "評価中…" : "評価する"}
          </button>
          <button
            type="button"
            className="rounded-xl border border-[#eadfd8] bg-white px-4 py-2.5 text-[14px] font-semibold disabled:opacity-50"
            disabled={pending || !petId || !photoId}
            onClick={() => runOne(petId, photoId, true)}
          >
            再解析
          </button>
          <button
            type="button"
            data-testid="pi-batch"
            className="rounded-xl border border-[#eadfd8] bg-[#fcfaf7] px-4 py-2.5 text-[14px] font-semibold disabled:opacity-50"
            disabled={pending || filteredPhotos.length === 0}
            onClick={() => void runBatch()}
          >
            {progress ? `連続評価 ${progress}` : "このペットを16枚評価"}
          </button>
        </div>
      </section>

      <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {filteredPhotos.slice(0, 40).map((photo) => {
          const selected = photo.id === photoId;
          return (
            <button
              key={photo.id}
              type="button"
              className="shrink-0 overflow-hidden rounded-xl border bg-[#f4efe9]"
              style={{
                width: 72,
                height: 72,
                borderColor: selected ? "#b36048" : "#eadfd8",
                boxShadow: selected ? "0 0 0 2px #b36048" : undefined,
              }}
              onClick={() => {
                setPhotoId(photo.id);
                const existing = rows.find((row) => row.photoId === photo.id);
                setResult(existing ?? null);
              }}
            >
              {photo.thumbUrl ? (
                <img src={photo.thumbUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="mb-4 rounded-xl bg-[#fdecea] px-4 py-3 text-[14px] text-[#a24129]">{error}</p>
      ) : null}

      {active && result ? (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
          <div>
            <h2 className="mb-2 text-[13px] font-semibold tracking-wide text-[#8a7368]">Original</h2>
            <div
              className="relative overflow-hidden rounded-2xl bg-[#2a2420]"
              data-load-state={loadState}
              style={{ aspectRatio: "4 / 5" }}
            >
              {previewSrc && loadState !== "error" ? (
                <img
                  src={previewSrc}
                  alt="評価中の写真"
                  className="h-full w-full object-contain"
                  style={{ opacity: loadState === "loaded" ? 1 : 0 }}
                  onLoad={() => setLoadState("loaded")}
                  onError={() => setLoadState("error")}
                />
              ) : null}
              {loadState === "loading" ? (
                <p className="absolute inset-0 flex items-center justify-center text-[12px] font-semibold tracking-wide text-[#d9cfc6]">
                  LOADING
                </p>
              ) : null}
              {loadState === "error" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center text-[12px] text-[#f3e7df]">
                  <p className="m-0 font-bold tracking-wide">IMAGE LOAD ERROR</p>
                  <p className="m-0 break-all">{result.photoId}</p>
                  <p className="m-0 break-all">{result.storagePath}</p>
                </div>
              ) : null}
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-[#8a7368]">
              {result.photoId}
              <br />
              {result.signals
                ? `${result.signals.width}×${result.signals.height} · pixels ${result.signals.pixelsKnown ? "measured" : "neutral"} · lap ${result.signals.laplacianVar.toFixed(5)}`
                : null}
            </p>
          </div>

          <div className="rounded-2xl border border-[#eadfd8] bg-white p-4">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="m-0 text-[12px] font-semibold tracking-wide text-[#8a7368]">OVERALL</p>
                <p className="m-0 text-[56px] font-bold leading-none" data-testid="pi-overall">
                  {active.overallScore}
                </p>
              </div>
              <div className="text-right text-[12px] leading-relaxed text-[#6a5c54]">
                <p className="m-0" data-testid="pi-status">
                  {active.status} · confidence {active.confidence.toFixed(2)}
                </p>
                <p className="m-0">{active.analysisVersion}</p>
                <p className="m-0">
                  {result.fromCache ? "cache hit" : "fresh"}
                  {result.visionCalled ? " · vision" : ""}
                  {result.visionFailed ? " · vision fallback" : ""}
                  {result.cropFromCache ? " · crop cache" : ""}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {AXES.map((axis) => {
                const value = active[axis.key];
                const contribution = Math.round(value * axis.weight * 10) / 10;
                return (
                  <div key={axis.key}>
                    <div className="mb-1 flex items-baseline justify-between text-[13px]">
                      <span className="font-semibold">{axis.label}</span>
                      <span className="tabular-nums text-[#6a5c54]">
                        {value}
                        <span className="ml-2 text-[11px]">寄与 {contribution}</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#f3ebe4]">
                      <div
                        className="h-full rounded-full bg-[#b36048]"
                        style={{ width: `${value}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5">
              <h3 className="m-0 text-[12px] font-semibold tracking-wide text-[#8a7368]">Tags</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {active.tags.length === 0 ? (
                  <span className="text-[13px] text-[#8a7368]">タグなし</span>
                ) : (
                  active.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-[#f6efe8] px-2.5 py-1 text-[12px] font-semibold text-[#6a5348]"
                    >
                      {TAG_LABELS[tag] ?? tag}
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="mt-4">
              <h3 className="m-0 text-[12px] font-semibold tracking-wide text-[#8a7368]">Reasons</h3>
              <ul className="mt-2 space-y-1 pl-4 text-[14px] leading-relaxed">
                {active.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>

            {active.warnings.length > 0 ? (
              <p className="mt-4 text-[12px] leading-relaxed text-[#a24129]">
                {active.warnings.join(" · ")}
              </p>
            ) : null}

            {result.parts ? <TechnicalDetails parts={result.parts} /> : null}
          </div>
        </section>
      ) : null}

      {rows.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-[16px] font-bold">評価一覧</h2>
          <div className="overflow-x-auto rounded-2xl border border-[#eadfd8] bg-white">
            <table className="w-full min-w-[860px] border-collapse text-left text-[12px]">
              <thead className="bg-[#fcfaf7] text-[#8a7368]">
                <tr>
                  <th className="px-3 py-2 font-semibold">Photo</th>
                  <th className="px-2 py-2 font-semibold">Overall</th>
                  <th className="px-2 py-2 font-semibold">Tech</th>
                  <th className="px-2 py-2 font-semibold">Pet</th>
                  <th className="px-2 py-2 font-semibold">Expr</th>
                  <th className="px-2 py-2 font-semibold">Comp</th>
                  <th className="px-2 py-2 font-semibold">Uniq</th>
                  <th className="px-2 py-2 font-semibold">Mem</th>
                  <th className="px-2 py-2 font-semibold">Conf</th>
                  <th className="px-3 py-2 font-semibold">Tags</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const score = row.intelligence;
                  return (
                    <tr
                      key={row.photoId ?? row.message ?? "row"}
                      data-testid="pi-row"
                      data-photo-id={row.photoId ?? ""}
                      data-overall={score?.overallScore ?? ""}
                      data-technical={score?.technicalQuality ?? ""}
                      data-visibility={score?.petVisibility ?? ""}
                      data-expression={score?.expression ?? ""}
                      data-composition={score?.composition ?? ""}
                      data-uniqueness={score?.uniqueness ?? ""}
                      data-memory={score?.memoryValue ?? ""}
                      data-confidence={score?.confidence ?? ""}
                      data-status={score?.status ?? ""}
                      data-tags={(score?.tags ?? []).join(",")}
                      data-warnings={(score?.warnings ?? []).join(",")}
                      data-reasons={(score?.reasons ?? []).join(" / ")}
                      data-vision-failed={row.visionFailed ? "1" : "0"}
                      data-from-cache={row.fromCache ? "1" : "0"}
                      className="cursor-pointer border-t border-[#f3ebe4]"
                      onClick={() => {
                        if (!row.photoId) return;
                        const option = photos.find((photo) => photo.id === row.photoId);
                        if (option) setPetId(option.petId);
                        setPhotoId(row.photoId);
                        setResult(row);
                      }}
                    >
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2">
                          {row.thumbUrl ? (
                            <img src={row.thumbUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
                          ) : (
                            <span className="inline-block h-12 w-12 rounded-lg bg-[#f3ebe4]" />
                          )}
                          <span>
                            {formatWhen(row.takenAt)}
                            <br />
                            <span className="text-[#8a7368]">{row.ok ? row.photoId?.slice(0, 8) : row.message}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-2 text-[16px] font-bold">{score?.overallScore ?? "—"}</td>
                      <td className="px-2 py-2 tabular-nums">{score?.technicalQuality ?? "—"}</td>
                      <td className="px-2 py-2 tabular-nums">{score?.petVisibility ?? "—"}</td>
                      <td className="px-2 py-2 tabular-nums">{score?.expression ?? "—"}</td>
                      <td className="px-2 py-2 tabular-nums">{score?.composition ?? "—"}</td>
                      <td className="px-2 py-2 tabular-nums">{score?.uniqueness ?? "—"}</td>
                      <td className="px-2 py-2 tabular-nums">{score?.memoryValue ?? "—"}</td>
                      <td className="px-2 py-2 tabular-nums">{score ? score.confidence.toFixed(2) : "—"}</td>
                      <td className="px-3 py-2 text-[#6a5c54]">{score?.tags.slice(0, 4).join(" · ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function TechnicalDetails({ parts }: { parts: TechnicalParts }) {
  const items = [
    ["blur", parts.blur],
    ["sharpness", parts.sharpness],
    ["exposure", parts.exposure],
    ["contrast", parts.contrast],
    ["noise", parts.noise],
    ["resolution", parts.resolution],
  ] as const;
  return (
    <details className="mt-4 text-[12px] text-[#6a5c54]">
      <summary className="cursor-pointer font-semibold">Technical breakdown</summary>
      <p className="mt-2 m-0">
        {items.map(([label, value]) => `${label} ${value}`).join(" · ")}
      </p>
    </details>
  );
}
