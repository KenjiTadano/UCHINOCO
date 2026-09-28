"use client";

import { useMemo, useState } from "react";
import { prepareGroupingPhoto } from "../photo-grouping/actions";
import { selectPetBestShots, type BestShotGroupView, type BestShotRunResult } from "./actions";
import type { BestShotCandidate } from "@/lib/best-shot/types";

export type BestShotPhotoOption = {
  id: string;
  petId: string;
  petName: string;
  takenAt: string | null;
};

function formatWhen(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function thumbFor(group: BestShotGroupView, photoId: string) {
  return group.group.members.find((member) => member.photoId === photoId)?.thumbUrl ?? null;
}

export function BestShotLab({
  photos,
  initialPetId,
}: {
  photos: BestShotPhotoOption[];
  initialPetId: string | null;
}) {
  const [petId, setPetId] = useState(initialPetId ?? photos[0]?.petId ?? "");
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BestShotRunResult | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);

  const petOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const photo of photos) map.set(photo.petId, photo.petName);
    return Array.from(map.entries());
  }, [photos]);

  const filtered = useMemo(
    () => photos.filter((photo) => photo.petId === petId),
    [photos, petId],
  );

  const selected =
    result?.groups.find((group) => group.group.id === groupId) ?? result?.groups[0] ?? null;

  async function run() {
    if (!petId) return;
    setPending(true);
    setError(null);
    setResult(null);
    try {
      for (let index = 0; index < filtered.length; index++) {
        setProgress(`${index + 1} / ${filtered.length}`);
        const prepared = await prepareGroupingPhoto(petId, filtered[index].id);
        if (!prepared.ok) setError(prepared.message ?? "準備に失敗しました。");
      }
      setProgress("選定中");
      const selectedShots = await selectPetBestShots(petId);
      setResult(selectedShots);
      if (!selectedShots.ok) setError(selectedShots.message);
      const focus =
        selectedShots.groups.find((group) => group.group.photoIds.length > 1)?.group.id ??
        selectedShots.groups[0]?.group.id ??
        null;
      setGroupId(focus);
    } finally {
      setPending(false);
      setProgress(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-28 text-[#332f2b]">
      <header className="mb-6">
        <p className="m-0 text-[12px] font-semibold tracking-wide text-[#b36048]">Task053 · Dev</p>
        <h1 className="mt-1 text-[24px] font-bold">Best Shot Lab</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[#6a5c54]">
          同じ場面の中から、その場面を残すならどの写真かを選びます。撮れ高の合計が一番高い写真を、そのまま代表にはしません。
        </p>
      </header>

      <section className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-[#eadfd8] bg-white p-4">
        <label className="block min-w-[200px] text-[13px] font-semibold">
          Pet
          <select
            className="mt-1 w-full rounded-xl border border-[#eadfd8] bg-[#fcfaf7] px-3 py-2 text-[14px]"
            value={petId}
            onChange={(event) => {
              setPetId(event.target.value);
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
        <button
          type="button"
          data-testid="best-shot-run"
          className="rounded-xl bg-[#b36048] px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
          disabled={pending || filtered.length === 0}
          onClick={() => void run()}
        >
          {progress ? progress : "Best Shot選定"}
        </button>
        <p className="m-0 text-[13px] text-[#6a5c54]">{filtered.length}枚</p>
      </section>

      {error ? (
        <p className="mb-4 rounded-xl bg-[#fdecea] px-4 py-3 text-[14px] text-[#a24129]">{error}</p>
      ) : null}

      {result?.ok && selected ? (
        <div className="space-y-4">
          <label className="block text-[13px] font-semibold">
            Scene Group
            <select
              className="mt-1 w-full max-w-xl rounded-xl border border-[#eadfd8] bg-white px-3 py-2 text-[14px]"
              value={selected.group.id}
              onChange={(event) => setGroupId(event.target.value)}
              data-testid="best-shot-group-select"
            >
              {result.groups.map((item, index) => (
                <option key={item.group.id} value={item.group.id}>
                  Group {index + 1} · {formatWhen(item.group.startedAt)} · {item.group.photoIds.length} photos ·
                  confidence {Math.round(item.group.groupConfidence * 100)}%
                </option>
              ))}
            </select>
          </label>
          <GroupDetail view={selected} />
        </div>
      ) : null}
    </div>
  );
}

function GroupDetail({ view }: { view: BestShotGroupView }) {
  const { group, selection } = view;
  const primary = selection.ranking.find((candidate) => candidate.role === "primary");
  const secondary = selection.ranking.find((candidate) => candidate.role === "secondary");

  return (
    <article
      className="rounded-2xl border border-[#eadfd8] bg-white p-4"
      data-testid="best-shot-group"
      data-group-id={group.id}
      data-photo-count={group.photoIds.length}
      data-primary={selection.primaryPhotoId}
      data-secondary={selection.secondaryPhotoId ?? ""}
      data-confidence={selection.confidence}
      data-warnings={selection.warnings.join(",")}
      data-version={selection.analysisVersion}
      data-pairs={group.pairs
        .map(
          (pair) =>
            `${pair.photoA.slice(0, 8)}-${pair.photoB.slice(0, 8)}:v${pair.visualScore}/g${pair.geometryScore}`,
        )
        .join(",")}
    >
      <p className="m-0 text-[13px] text-[#6a5c54]">
        {formatWhen(group.startedAt)}
        {group.startedAt !== group.endedAt ? ` – ${formatWhen(group.endedAt)}` : ""} · {group.photoIds.length}{" "}
        photos · group confidence {Math.round(group.groupConfidence * 100)}%
        {group.scene ? ` · ${group.scene}` : ""}
        {group.activity ? ` / ${group.activity}` : ""}
        {selection.warnings.length ? ` · ${selection.warnings.join(" ")}` : ""}
      </p>
      <p className="mt-2 mb-4 text-[14px] leading-relaxed">{selection.reason}</p>

      <div className="grid gap-4 md:grid-cols-2">
        {primary ? (
          <ShotCard
            label="PRIMARY"
            candidate={primary}
            thumbUrl={thumbFor(view, primary.photoId)}
            testId="best-shot-primary"
          />
        ) : null}
        {secondary ? (
          <ShotCard
            label="SECONDARY"
            candidate={secondary}
            thumbUrl={thumbFor(view, secondary.photoId)}
            note={selection.secondaryReason}
            testId="best-shot-secondary"
          />
        ) : (
          <p className="m-0 self-center text-[13px] text-[#8a7368]" data-testid="best-shot-no-secondary">
            Secondaryはありません。
          </p>
        )}
      </div>

      <h2 className="mt-6 mb-3 text-[16px] font-bold">候補の横並び</h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {selection.ranking.map((candidate) => (
          <CandidateTile
            key={candidate.photoId}
            candidate={candidate}
            thumbUrl={thumbFor(view, candidate.photoId)}
          />
        ))}
      </div>
    </article>
  );
}

function ShotCard({
  label,
  candidate,
  thumbUrl,
  note,
  testId,
}: {
  label: string;
  candidate: BestShotCandidate;
  thumbUrl: string | null;
  note?: string;
  testId: string;
}) {
  const scores = candidate.scores;
  return (
    <section data-testid={testId} data-photo-id={candidate.photoId} data-score={scores.overall}>
      <p className="m-0 text-[12px] font-bold tracking-wide text-[#b36048]">{label}</p>
      {thumbUrl ? (
        <img src={thumbUrl} alt="" className="mt-2 max-h-80 w-full rounded-2xl object-contain bg-[#f6f1ec]" />
      ) : (
        <div className="mt-2 h-48 rounded-2xl bg-[#f3ebe4]" />
      )}
      <p className="mt-3 mb-1 text-[20px] font-bold">Best Shot {scores.overall}</p>
      <p className="m-0 text-[12px] text-[#8a7368]">{candidate.photoId.slice(0, 8)}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]">
        <Score label="Expression" value={scores.expression} />
        <Score label="Pet" value={scores.petVisibility} />
        <Score label="Technical" value={scores.technical} />
        <Score label="Memory" value={scores.memoryValue} />
        <Score label="Rel Unique" value={scores.relativeUniqueness} />
        <Score label="Sharpness" value={scores.sharpness} />
        <Score label="Scene" value={scores.sceneRepresentativeness} />
        <Score label="PI Overall" value={scores.photoIntelligence} />
      </dl>
      {note ? <p className="mt-2 mb-0 text-[13px] leading-relaxed text-[#6a5c54]">{note}</p> : null}
    </section>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-2 border-b border-[#f3ebe4] py-1">
      <dt className="text-[#8a7368]">{label}</dt>
      <dd className="m-0 font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function CandidateTile({
  candidate,
  thumbUrl,
}: {
  candidate: BestShotCandidate;
  thumbUrl: string | null;
}) {
  const scores = candidate.scores;
  return (
    <article
      className="w-40 shrink-0 rounded-xl border border-[#eadfd8] p-2"
      data-testid="best-shot-candidate"
      data-photo-id={candidate.photoId}
      data-rank={candidate.rank}
      data-role={candidate.role}
      data-score={scores.overall}
      data-pi={scores.photoIntelligence}
      data-expression={scores.expression}
      data-technical={scores.technical}
      data-memory={scores.memoryValue}
      data-unique={scores.relativeUniqueness}
      data-composition={scores.composition}
      data-scene={scores.sceneRepresentativeness}
      data-sharpness={scores.sharpness}
      data-penalty={scores.duplicationPenalty}
    >
      <div className="relative">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="h-28 w-full rounded-lg object-cover" />
        ) : (
          <div className="h-28 rounded-lg bg-[#f3ebe4]" />
        )}
        <span className="absolute left-1 top-1 rounded bg-[#332f2b] px-1.5 py-0.5 text-[10px] font-bold text-white">
          {candidate.rank}
          {candidate.role === "primary" ? " PRIMARY" : candidate.role === "secondary" ? " SECONDARY" : ""}
        </span>
      </div>
      <p className="mt-2 mb-0 text-[13px] font-bold">Best {scores.overall}</p>
      <p className="m-0 text-[11px] leading-relaxed text-[#6a5c54]">
        PI {scores.photoIntelligence} · Expr {scores.expression}
        <br />
        Tech {scores.technical} · Mem {scores.memoryValue}
        <br />
        Uniq {scores.relativeUniqueness} · Sharp {scores.sharpness}
      </p>
    </article>
  );
}
