"use client";

import { useMemo, useState, useTransition } from "react";
import { selectSmartLayout, type SmartLayoutSelectResult } from "./actions";
import { LayoutPreview } from "./layout-preview";

export type SmartLayoutPhotoOption = {
  id: string;
  petId: string;
  petName: string;
  thumbUrl: string | null;
  takenAt: string | null;
};

type Props = {
  photos: SmartLayoutPhotoOption[];
  initialPetId: string | null;
};

export function SmartLayoutLab({ photos, initialPetId }: Props) {
  const [petId, setPetId] = useState(initialPetId ?? photos[0]?.petId ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const [debug, setDebug] = useState(true);
  const [result, setResult] = useState<SmartLayoutSelectResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const petOptions = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const p of photos) {
      const current = map.get(p.petId);
      map.set(p.petId, { name: p.petName, count: (current?.count ?? 0) + 1 });
    }
    return Array.from(map.entries());
  }, [photos]);

  const filtered = useMemo(() => photos.filter((p) => p.petId === petId), [photos, petId]);

  function togglePhoto(id: string) {
    setResult(null);
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  }

  function runSelect() {
    if (!petId || selected.length < 1) return;
    setError(null);
    startTransition(async () => {
      const res = await selectSmartLayout(petId, selected);
      setResult(res);
      if (!res.ok) setError(res.message ?? "Layout選択に失敗しました。");
    });
  }

  const previewUrlByPhotoId = useMemo(() => Object.fromEntries((result?.photos ?? []).map((photo) => [photo.photoId, photo.previewUrl])), [result]);
  const ranking = result?.selection?.ranking ?? [];
  const best = result?.selection?.best ?? null;
  const alternatives = result?.selection?.alternatives ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-24 text-[#332f2b]">
      <header className="mb-6">
        <p className="m-0 text-[12px] font-semibold tracking-wide text-[#b36048]">Task050.2 · Dev</p>
        <h1 className="mt-1 text-[24px] font-bold">Smart Layout Lab</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[#6a5c54]">写真群 → Frame Matching → Layout候補比較 → Best Layout。 枠に流し込むのではなく、写真に合うLayoutを選びます。</p>
      </header>

      <section className="mb-5 grid gap-3 rounded-2xl border border-[#eadfd8] bg-white p-4 md:grid-cols-[1fr_auto_auto] md:items-end">
        <label className="block text-[13px] font-semibold">
          Pet
          <select
            className="mt-1 w-full rounded-xl border border-[#eadfd8] bg-[#fcfaf7] px-3 py-2 text-[14px]"
            value={petId}
            onChange={(e) => {
              setPetId(e.target.value);
              setSelected([]);
              setResult(null);
            }}
          >
            {petOptions.map(([id, option]) => (
              <option key={id} value={id}>
                {option.name} · {option.count} photos · {id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>

        <p className="m-0 text-[13px] font-semibold text-[#5c534e]">Selected: {selected.length} / 4</p>

        <button type="button" className="rounded-xl bg-[#b36048] px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50" disabled={pending || selected.length < 1} onClick={runSelect}>
          {pending ? "解析中…" : "Layoutを選ぶ"}
        </button>
      </section>

      <div className="mb-6 flex flex-wrap gap-2">
        {filtered.slice(0, 36).map((p) => {
          const on = selected.includes(p.id);
          return (
            <button key={p.id} type="button" onClick={() => togglePhoto(p.id)} className={`relative h-16 w-16 overflow-hidden rounded-lg border-2 ${on ? "border-[#b36048]" : "border-transparent opacity-80"}`}>
              {p.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.thumbUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="block h-full w-full bg-[#efe6df]" />
              )}
              {on ? <span className="absolute right-0.5 top-0.5 rounded bg-[#b36048] px-1 text-[9px] font-bold text-white">{selected.indexOf(p.id) + 1}</span> : null}
            </button>
          );
        })}
      </div>

      {error ? <p className="mb-4 rounded-xl bg-[#fdecea] px-3 py-2 text-[13px] text-[#a24129]">{error}</p> : null}

      {result?.ok && result.selection ? (
        <>
          {result.fallbackReasonCounts && Object.keys(result.fallbackReasonCounts).length > 0 ? (
            <p className="mb-4 text-[11px] text-[#8a7c74]">
              FALLBACK理由集計:{" "}
              {Object.entries(result.fallbackReasonCounts)
                .map(([k, v]) => `${k}×${v}`)
                .join(" · ")}
            </p>
          ) : null}

          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="m-0 text-[16px] font-bold">Layout Ranking</h2>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} />
              Debug overlay
            </label>
          </div>

          <ol className="mb-6 m-0 flex list-none flex-col gap-2 p-0">
            {ranking.map((row, i) => {
              const isBest = best?.layoutId === row.layoutId;
              return (
                <li key={row.layoutId} className={`rounded-xl border px-3 py-2.5 ${row.tier === "unusable" ? "border-[#f0d0c8] bg-[#fff7f5]" : isBest ? "border-[#e8cfc3] bg-[#fff8f4]" : "border-[#eadfd8] bg-white"}`} data-testid={`layout-rank-${row.layoutId}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[12px] font-bold text-[#b36048]">{row.tier === "unusable" ? "—" : `${Math.min(i + 1, ranking.filter((r) => r.tier !== "unusable").length)}.`}</span>
                      <span className="text-[14px] font-semibold">{row.layout.name}</span>
                      <span className="text-[11px] text-[#8a7c74]">
                        {row.layoutId} · {row.layout.purpose}
                      </span>
                    </div>
                    <span className="font-mono text-[13px]">
                      {row.tier === "unusable" ? (
                        <span className="font-bold text-[#a24129]">UNUSABLE</span>
                      ) : (
                        <>
                          Score <strong>{row.scores.overall}</strong> <span className={row.tier === "fallback" ? "text-[#9a6b12]" : "text-[#5c534e]"}>{row.tier.toUpperCase()}</span>
                        </>
                      )}
                    </span>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-x-3 text-[11px] text-[#6a5c54] sm:grid-cols-5">
                    <div>
                      FrameMatch <strong>{row.scores.frameMatching}</strong>
                    </div>
                    <div>
                      RoleFit <strong>{row.scores.roleFit}</strong>
                    </div>
                    <div>
                      Balance <strong>{row.scores.balance}</strong>
                    </div>
                    <div>
                      Variety <strong>{row.scores.variety}</strong>
                    </div>
                    <div>
                      CropQ <strong>{row.scores.cropQuality}</strong>
                    </div>
                  </div>
                  {row.needsAdjustment ? <p className="mt-1 mb-0 text-[11px] text-[#8a5a2b]">needsAdjustment · Fallback枠を含むため微調整推奨</p> : null}
                </li>
              );
            })}
          </ol>

          {best ? (
            <section className="mb-6 rounded-2xl border border-[#eadfd8] bg-white p-4">
              <h2 className="mt-0 mb-3 text-[16px] font-bold">Best Layout · {best.layout.name}</h2>
              <LayoutPreview result={best} previewUrlByPhotoId={previewUrlByPhotoId} debug={debug} />
              <ul className="mt-3 mb-0 list-none space-y-1 p-0 text-[12px] text-[#5c534e]">
                {best.assignments.map((a) => (
                  <li key={a.frameId}>
                    <strong>{a.slotRole}</strong> ({a.cropShapeId}) ← photo {a.photoId.slice(0, 8)} · Match {a.frameMatch.matchScore} {a.frameMatch.matchTier} · Crop {a.quality.overall}
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="mb-6 rounded-xl bg-[#fdecea] px-3 py-2 text-[13px] text-[#a24129]">採用可能な Layout がありません。</p>
          )}

          {alternatives.length > 0 ? (
            <section className="grid gap-4 md:grid-cols-2">
              {alternatives.map((alt, i) => (
                <div key={alt.layoutId} className="rounded-2xl border border-[#eadfd8] bg-white p-4">
                  <LayoutPreview result={alt} previewUrlByPhotoId={previewUrlByPhotoId} debug={debug} title={`Alternative ${i + 2} · ${alt.layout.name} (${alt.scores.overall} ${alt.tier})`} />
                </div>
              ))}
            </section>
          ) : null}
        </>
      ) : (
        <p className="text-[14px] text-[#8a7c74]">写真を1〜4枚選んで「Layoutを選ぶ」を押してください。</p>
      )}
    </div>
  );
}
