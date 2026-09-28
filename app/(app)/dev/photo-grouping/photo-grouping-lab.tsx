"use client";

import { useMemo, useState } from "react";
import {
  groupPetPhotos,
  prepareGroupingPhoto,
  type GroupingGroupView,
  type GroupingRunResult,
} from "./actions";

export type GroupingPhotoOption = {
  id: string;
  petId: string;
  petName: string;
  thumbUrl: string | null;
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

export function PhotoGroupingLab({
  photos,
  initialPetId,
}: {
  photos: GroupingPhotoOption[];
  initialPetId: string | null;
}) {
  const [petId, setPetId] = useState(initialPetId ?? photos[0]?.petId ?? "");
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GroupingRunResult | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const petOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const photo of photos) map.set(photo.petId, photo.petName);
    return Array.from(map.entries());
  }, [photos]);

  const filtered = useMemo(
    () => photos.filter((photo) => photo.petId === petId),
    [photos, petId],
  );

  async function run() {
    if (!petId) return;
    setPending(true);
    setError(null);
    setResult(null);
    try {
      for (let index = 0; index < filtered.length; index++) {
        setProgress(`${index + 1} / ${filtered.length}`);
        const prepared = await prepareGroupingPhoto(petId, filtered[index].id);
        if (!prepared.ok) {
          setError(prepared.message ?? "準備に失敗しました。");
        }
      }
      setProgress("グループ化中");
      const grouped = await groupPetPhotos(petId);
      setResult(grouped);
      if (!grouped.ok) setError(grouped.message);
      setOpenId(grouped.groups.find((group) => group.photoIds.length > 1)?.id ?? grouped.groups[0]?.id ?? null);
    } finally {
      setPending(false);
      setProgress(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-28 text-[#332f2b]">
      <header className="mb-6">
        <p className="m-0 text-[12px] font-semibold tracking-wide text-[#b36048]">Task052 · Dev</p>
        <h1 className="mt-1 text-[24px] font-bold">Photo Grouping Lab</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[#6a5c54]">
          同じ場面の写真をまとめます。時刻が近いだけでは同じグループにしません。別の日のよく似た写真は分けます。
          ベストショットはまだ決めません。
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
          data-testid="grouping-run"
          className="rounded-xl bg-[#b36048] px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
          disabled={pending || filtered.length === 0}
          onClick={() => void run()}
        >
          {progress ? progress : "グループ化"}
        </button>
        <p className="m-0 text-[13px] text-[#6a5c54]">{filtered.length}枚</p>
      </section>

      {error ? (
        <p className="mb-4 rounded-xl bg-[#fdecea] px-4 py-3 text-[14px] text-[#a24129]">{error}</p>
      ) : null}

      {result?.ok ? (
        <div className="space-y-4">
          {result.groups.map((group, index) => (
            <GroupCard
              key={group.id}
              index={index + 1}
              group={group}
              open={openId === group.id}
              onToggle={() => setOpenId((current) => (current === group.id ? null : group.id))}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GroupCard({
  index,
  group,
  open,
  onToggle,
}: {
  index: number;
  group: GroupingGroupView;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <article
      className="rounded-2xl border border-[#eadfd8] bg-white p-4"
      data-testid="scene-group"
      data-group-id={group.id}
      data-photo-ids={group.photoIds.join(",")}
      data-confidence={group.groupConfidence}
      data-burst={group.burst ? "1" : "0"}
      data-warnings={group.warnings.join(",")}
      data-boundary={
        group.boundaryPair
          ? `${group.boundaryPair.overall}|t${group.boundaryPair.timeScore}|v${group.boundaryPair.visualScore}|g${group.boundaryPair.geometryScore}|s${group.boundaryPair.semanticScore}|b${group.boundaryPair.backgroundScore}|${group.boundaryPair.blocks.join("+")}`
          : ""
      }
      data-blocking={
        group.blockingPair
          ? `${group.blockingPair.overall}|t${group.blockingPair.timeScore}|v${group.blockingPair.visualScore}|g${group.blockingPair.geometryScore}|s${group.blockingPair.semanticScore}|b${group.blockingPair.backgroundScore}|${group.blockingPair.blocks.join("+")}`
          : ""
      }
      data-scene={group.scene ?? ""}
      data-activity={group.activity ?? ""}
    >
      <button type="button" className="w-full text-left" onClick={onToggle}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="m-0 text-[18px] font-bold">Group {index}</h2>
          <p className="m-0 text-[13px] text-[#6a5c54]">
            {formatWhen(group.startedAt)}
            {group.startedAt !== group.endedAt ? ` – ${formatWhen(group.endedAt)}` : ""}
          </p>
        </div>
        <p className="mt-1 mb-3 text-[13px] text-[#6a5c54]">
          {group.photoIds.length} photos · confidence {Math.round(group.groupConfidence * 100)}%
          {group.burst ? " · burst" : ""}
          {group.scene ? ` · ${group.scene}` : ""}
          {group.activity ? ` / ${group.activity}` : ""}
          {group.warnings.length ? ` · ${group.warnings.join(" ")}` : ""}
        </p>
        <div className="flex gap-2 overflow-x-auto">
          {group.members.map((member) => (
            <span key={member.photoId} className="relative shrink-0">
              {member.thumbUrl ? (
                <img src={member.thumbUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />
              ) : (
                <span className="inline-block h-16 w-16 rounded-lg bg-[#f3ebe4]" />
              )}
              {member.representative ? (
                <span className="absolute left-1 top-1 rounded bg-[#b36048] px-1 text-[10px] font-bold text-white">
                  Rep
                </span>
              ) : null}
            </span>
          ))}
        </div>
        <p className="mt-3 mb-0 text-[14px] leading-relaxed">{group.reason}</p>
        {group.boundaryPair ? (
          <p className="mt-1 mb-0 text-[12px] text-[#8a7368]">
            直前との類似 {group.boundaryPair.overall}（time {group.boundaryPair.timeScore} / visual{" "}
            {group.boundaryPair.visualScore} / geometry {group.boundaryPair.geometryScore} / semantic{" "}
            {group.boundaryPair.semanticScore} / background {group.boundaryPair.backgroundScore}
            {group.boundaryPair.blocks.length ? ` / ${group.boundaryPair.blocks.join(" ")}` : ""}）
          </p>
        ) : null}
        {group.blockingPair ? (
          <p className="mt-1 mb-0 text-[12px] text-[#8a7368]">
            代表との類似 {group.blockingPair.overall}（time {group.blockingPair.timeScore} / visual{" "}
            {group.blockingPair.visualScore} / geometry {group.blockingPair.geometryScore} / semantic{" "}
            {group.blockingPair.semanticScore} / background {group.blockingPair.backgroundScore}
            {group.blockingPair.blocks.length ? ` / ${group.blockingPair.blocks.join(" ")}` : ""}）
          </p>
        ) : null}
      </button>

      {open ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
            <thead className="text-[#8a7368]">
              <tr>
                <th className="py-1 pr-2 font-semibold">Photo</th>
                <th className="py-1 pr-2 font-semibold">Time</th>
                <th className="py-1 pr-2 font-semibold">Overall</th>
                <th className="py-1 pr-2 font-semibold">Relative uniq</th>
                <th className="py-1 font-semibold">Pairs</th>
              </tr>
            </thead>
            <tbody>
              {group.members.map((member) => {
                const pairs = group.pairs.filter(
                  (pair) => pair.photoA === member.photoId || pair.photoB === member.photoId,
                );
                return (
                  <tr
                    key={member.photoId}
                    className="border-t border-[#f3ebe4]"
                    data-testid="group-member"
                    data-photo-id={member.photoId}
                    data-overall={member.overallScore ?? ""}
                    data-relative={member.relativeUniqueness}
                    data-representative={member.representative ? "1" : "0"}
                  >
                    <td className="py-2 pr-2">
                      {member.thumbUrl ? (
                        <img src={member.thumbUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
                      ) : null}
                      <span className="mt-1 block text-[#8a7368]">{member.photoId.slice(0, 8)}</span>
                    </td>
                    <td className="py-2 pr-2">{formatWhen(member.capturedAt)}</td>
                    <td className="py-2 pr-2 tabular-nums">{member.overallScore ?? "—"}</td>
                    <td className="py-2 pr-2 tabular-nums">{member.relativeUniqueness}</td>
                    <td className="py-2 text-[#6a5c54]">
                      {pairs.length === 0
                        ? "singleton"
                        : pairs
                            .map((pair) => {
                              const other = pair.photoA === member.photoId ? pair.photoB : pair.photoA;
                              return `${other.slice(0, 4)} ${pair.overall}`;
                            })
                            .join(" · ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </article>
  );
}
