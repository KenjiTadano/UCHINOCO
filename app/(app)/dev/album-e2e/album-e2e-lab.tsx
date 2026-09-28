"use client";

import { useMemo, useState } from "react";
import { BookDraftPreview } from "../album-draft/book-draft-preview";
import { prepareGroupingPhoto } from "../photo-grouping/actions";
import { beginAlbumAnalysisAudit, generatePetAlbum, type AlbumE2ERun } from "./actions";
import type { AlbumGenerationResult, PhotoTrace, PrimaryChain } from "@/lib/album-generation/types";
import type { AnalysisTrace } from "@/lib/photo-analysis/trace";

export type AlbumE2EPhotoOption = {
  id: string;
  petId: string;
  petName: string;
  takenAt: string | null;
};

const STAGE_LABEL: Record<string, string> = {
  photoIntelligence: "Photo Intelligence",
  grouping: "Grouping",
  bestShot: "Best Shot",
  candidates: "Candidates",
  story: "Story",
  draft: "Draft",
};

function tokyoYearMonth(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" })
    .format(new Date(iso))
    .slice(0, 7);
}

function cropMin(
  assignments: {
    safety: {
      faceSafety: number;
      headSafety: number;
      earSafety: number;
      bodySafety: number;
      subjectScale: number;
      maskSafety: number;
    };
  }[],
) {
  if (assignments.length === 0) return "—";
  const min = (key: keyof (typeof assignments)[number]["safety"]) => Math.min(...assignments.map((item) => item.safety[key]));
  return `face ${min("faceSafety")} · head ${min("headSafety")} · ear ${min("earSafety")} · body ${min("bodySafety")} · scale ${min("subjectScale")} · mask ${min("maskSafety")}`;
}

function monthLabel(key: string) {
  if (!key) return "—";
  const [year, month] = key.split("-");
  return `${year}年${Number(month)}月`;
}

export function AlbumE2ELab({ photos, initialPetId }: { photos: AlbumE2EPhotoOption[]; initialPetId: string | null }) {
  const [petId, setPetId] = useState(initialPetId ?? photos[0]?.petId ?? "");
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<AlbumE2ERun | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [signatures, setSignatures] = useState<string[]>([]);

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

  async function generate() {
    if (!petId || !activeMonth) return;
    const [year, month] = activeMonth.split("-").map(Number);
    setPending(true);
    setError(null);
    try {
      await beginAlbumAnalysisAudit();
      for (let index = 0; index < filtered.length; index++) {
        setProgress(`${index + 1} / ${filtered.length}`);
        const prepared = await prepareGroupingPhoto(petId, filtered[index].id);
        if (!prepared.ok) setError(prepared.message ?? "準備に失敗しました。");
      }
      setProgress("つないでいます");
      const next = await generatePetAlbum(petId, { type: "monthly", year, month });
      setRun(next);
      if (!next.ok) setError(next.message);
      else setSignatures((current) => [...current, next.signature].slice(-3));
    } finally {
      setPending(false);
      setProgress(null);
    }
  }

  const result = run?.result;
  const trace = result?.traces.find((item) => item.photoId === traceId) ?? null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-28 text-[#332f2b]">
      <header className="mb-6">
        <p className="m-0 text-[12px] font-semibold tracking-wide text-[#b36048]">Task057 · Dev</p>
        <h1 className="mt-1 text-[24px] font-bold">Album E2E Lab</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[#6a5c54]">
          写真から見開き初稿までを一度につなぎ、役割と枚数が途中で崩れていないかを見ます。
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
                setSignatures([]);
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
              data-testid="album-e2e-month"
              value={activeMonth}
              onChange={(event) => {
                setMonthKey(event.target.value);
                setRun(null);
                setSignatures([]);
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
            data-testid="album-e2e-run"
            className="rounded-xl bg-[#b36048] px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
            disabled={pending || filtered.length === 0 || !activeMonth}
            onClick={() => void generate()}
          >
            {progress ? progress : "Generate Full Album"}
          </button>
        </div>
      </section>
      {error ? <p className="mb-4 rounded-xl bg-[#fdecea] px-4 py-3 text-[14px] text-[#a24129]">{error}</p> : null}
      {result ? (
        <div className="space-y-4">
          <Summary
            result={result}
            signature={run?.signature ?? ""}
            signatures={signatures}
            visionCalls={run?.visionCalls ?? 0}
            analysis={run?.analysis ?? []}
          />
          {result.album.spreads.map((spread, index) => (
            <article
              key={spread.spreadId}
              className="rounded-2xl border border-[#eadfd8] bg-white p-4"
              data-testid="album-e2e-spread"
              data-layout={spread.layoutId}
              data-status={spread.status}
              data-quality={spread.quality.overall}
              data-warnings={spread.warnings.join(",")}
              data-photos={spread.assignments.map((item) => `${item.photoId}:${item.role}`).join(",")}
            >
              <h2 className="m-0 text-[18px] font-bold">
                Spread {index + 1} · {spread.layoutId}
              </h2>
              <p className="m-0 mt-1 text-[13px] text-[#6a5c54]">
                {spread.status} · Quality {spread.quality.overall} · {spread.story.storyType} · {spread.story.recommendedDensity}
              </p>
              <p className="m-0 mt-1 text-[12px] text-[#6a5c54]">
                Alternatives {spread.alternatives.map((item) => `${item.layoutId} ${item.layoutScore}`).join(" / ") || "なし"}
                {" · "}
                Crop min {cropMin(spread.assignments)}
              </p>
              {spread.warnings.length > 0 ? (
                <p className="m-0 mt-1 text-[12px] text-[#a24129]">{spread.warnings.join(" / ")}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {spread.assignments.map((assignment) => (
                  <button
                    key={assignment.frameId}
                    type="button"
                    className="rounded-full border border-[#eadfd8] px-3 py-1 text-[12px]"
                    data-testid="album-e2e-photo"
                    data-photo-id={assignment.photoId}
                    onClick={() => setTraceId(assignment.photoId)}
                  >
                    {assignment.role} · {assignment.photoId.slice(0, 8)}
                  </button>
                ))}
              </div>
              <div className="mt-4">
                <BookDraftPreview draft={spread} />
              </div>
            </article>
          ))}
          <ChainTable chains={result.primaryChains} />
          {trace ? <TraceCard trace={trace} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function Summary({
  result,
  signature,
  signatures,
  visionCalls,
  analysis,
}: {
  result: AlbumGenerationResult;
  signature: string;
  signatures: string[];
  visionCalls: number;
  analysis: AnalysisTrace[];
}) {
  const stable = signatures.length >= 2 && signatures.every((item) => item === signatures[0]);
  return (
    <section
      className="rounded-2xl border border-[#eadfd8] bg-white p-4"
      data-testid="album-e2e-summary"
      data-grade={result.quality.grade}
      data-overall={result.quality.overall}
      data-blocking={result.quality.blockingIssues.join(",")}
      data-warnings={result.quality.nonBlockingIssues.join(",")}
      data-signature={signature}
      data-library={result.counts.library}
      data-period={result.counts.period}
      data-groups={result.counts.sceneGroups}
      data-scenes={result.counts.selectedScenes}
      data-photos={result.counts.selectedPhotos}
      data-spreads={result.counts.draftSpreads}
      data-stable={stable ? "yes" : "pending"}
      data-cache-source={result.stages.photoIntelligence.cacheSource ?? "unknown"}
      data-vision-calls={visionCalls}
    >
      <h2 className="m-0 text-[16px] font-bold">
        {result.quality.grade} · {result.quality.overall}
      </h2>
      <p className="m-0 mt-1 text-[13px] text-[#6a5c54]">
        Library {result.counts.library} · Period {result.counts.period} · Scenes {result.counts.sceneGroups} →{" "}
        {result.counts.selectedScenes} · Photos {result.counts.selectedPhotos} · Spreads {result.counts.draftSpreads} · Draft
        photos {result.counts.draftPhotos}
      </p>
      <p className="m-0 mt-1 text-[13px]">
        selection {result.quality.selectionQuality} · story {result.quality.storyQuality} · layout {result.quality.layoutQuality} ·
        crop {result.quality.cropSafety} · consistency {result.quality.consistency}
      </p>
      <ul className="mt-3 space-y-1 text-[13px]">
        {(Object.keys(STAGE_LABEL) as (keyof typeof result.stages)[]).map((key) => {
          const stage = result.stages[key];
          return (
            <li key={key}>
              {STAGE_LABEL[key]} {stage.inputCount} → {stage.outputCount} · {stage.status}
              {stage.durationMs !== undefined ? ` · ${stage.durationMs}ms` : ""} · cache {stage.cache ?? "unknown"}
              {stage.cacheSource ? ` · source ${stage.cacheSource}` : ""}
            </li>
          );
        })}
      </ul>
      <p className="m-0 mt-3 text-[13px]">
        Blocking {result.quality.blockingIssues.join(", ") || "なし"} · Warnings{" "}
        {result.quality.nonBlockingIssues.join(", ") || "なし"}
      </p>
      <p className="m-0 mt-1 text-[12px] text-[#8a7b72]" data-testid="album-e2e-vision">
        Vision calls {visionCalls} · Runs {signatures.length} · {stable ? "同じ割り当て" : "比較中"}
      </p>
      {analysis.length > 0 ? (
        <ul className="mt-3 space-y-1 text-[12px] text-[#6a5c54]" data-testid="analysis-cache">
          {analysis.map((item) => (
            <li
              key={`${item.photoId}-${item.analysisType}`}
              data-source={item.cacheSource}
              data-type={item.analysisType}
              data-status={item.status}
              data-version={item.version}
              title={item.fingerprint}
            >
              {item.photoId.slice(0, 8)} · {item.analysisType} · {item.version} · {item.cacheSource} · {item.status}
              {item.createdAt ? ` · ${item.createdAt.slice(0, 19)}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ChainTable({ chains }: { chains: PrimaryChain[] }) {
  return (
    <section className="rounded-2xl border border-[#eadfd8] bg-white p-4" data-testid="album-e2e-chains">
      <h2 className="m-0 text-[16px] font-bold">Primary continuity</h2>
      <div className="mt-2 overflow-x-auto text-[12px]">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[#8a7b72]">
              <th className="py-1 pr-3">Scene</th>
              <th className="py-1 pr-3">Best Shot</th>
              <th className="py-1 pr-3">Candidate</th>
              <th className="py-1 pr-3">Story</th>
              <th className="py-1 pr-3">Draft</th>
            </tr>
          </thead>
          <tbody>
            {chains.map((chain) => (
              <tr key={chain.groupId} data-testid="album-e2e-chain">
                <td className="py-1 pr-3">{chain.groupId}</td>
                <td className="py-1 pr-3">{chain.bestShotPhotoId.slice(0, 8)}</td>
                <td className="py-1 pr-3">{chain.candidatePhotoId.slice(0, 8)}</td>
                <td className="py-1 pr-3">{chain.storyPhotoId.slice(0, 8)}</td>
                <td className="py-1 pr-3">
                  {chain.draftPhotoId.slice(0, 8)} {chain.draftRole}
                  {chain.warnings.length > 0 ? ` · ${chain.warnings.join(",")}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TraceCard({ trace }: { trace: PhotoTrace }) {
  return (
    <section className="rounded-2xl border border-[#eadfd8] bg-white p-4" data-testid="album-e2e-trace" data-photo-id={trace.photoId}>
      <h2 className="m-0 text-[16px] font-bold">Trace {trace.photoId.slice(0, 8)}</h2>
      <ol className="mt-2 space-y-1 text-[13px]">
        <li>Best Shot · {trace.bestShotRole}</li>
        <li>Candidate · {trace.candidateRole}</li>
        <li>Story · {trace.storySpreadId || "—"} · {trace.storyRole}</li>
        <li>
          Draft · {trace.draftSpreadId || "—"} · {trace.draftRole} · {trace.frameId}
        </li>
      </ol>
      {trace.warnings.length > 0 ? <p className="m-0 mt-2 text-[12px] text-[#a24129]">{trace.warnings.join(" / ")}</p> : null}
    </section>
  );
}
