"use client";

import { useMemo, useState, useTransition } from "react";
import { headSafeAreaFromFace } from "@/lib/smart-crop/head";
import { analyzeSmartCropPhoto, type SmartCropAnalyzeResult } from "./actions";
import { FrameMatchingPanel } from "./frame-matching-panel";
import { SmartCropFrameCard } from "./smart-crop-frame-card";

export type SmartCropPhotoOption = {
  id: string;
  petId: string;
  petName: string;
  thumbUrl: string | null;
  takenAt: string | null;
};

type Props = {
  photos: SmartCropPhotoOption[];
  initialPetId: string | null;
  initialPhotoId: string | null;
};

export function SmartCropLab({ photos, initialPetId, initialPhotoId }: Props) {
  const [petId, setPetId] = useState(initialPetId ?? photos[0]?.petId ?? "");
  const [photoId, setPhotoId] = useState(initialPhotoId ?? photos.find((p) => p.petId === (initialPetId ?? photos[0]?.petId))?.id ?? "");
  const [debug, setDebug] = useState(true);
  const [result, setResult] = useState<SmartCropAnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const petOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of photos) map.set(p.petId, p.petName);
    return Array.from(map.entries());
  }, [photos]);

  const filteredPhotos = useMemo(() => photos.filter((p) => p.petId === petId), [photos, petId]);

  function runAnalyze(nextPetId: string, nextPhotoId: string) {
    if (!nextPetId || !nextPhotoId) return;
    setError(null);
    startTransition(async () => {
      const res = await analyzeSmartCropPhoto(nextPetId, nextPhotoId);
      setResult(res);
      if (!res.ok) setError(res.message ?? "解析に失敗しました。");
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-24 text-[#332f2b]">
      <header className="mb-6">
        <p className="m-0 text-[12px] font-semibold tracking-wide text-[#b36048]">Task049 · Dev</p>
        <h1 className="mt-1 text-[24px] font-bold">Smart Crop Lab</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[#6a5c54]">Smart Crop（048.1）に加え、写真×Frame の適合度ランキング（049）を確認できます。 Before/After と Match Score breakdown を同じ解析結果から表示します。</p>
      </header>

      <section className="mb-6 grid gap-3 rounded-2xl border border-[#eadfd8] bg-white p-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label className="block text-[13px] font-semibold">
          Pet
          <select
            className="mt-1 w-full rounded-xl border border-[#eadfd8] bg-[#fcfaf7] px-3 py-2 text-[14px]"
            value={petId}
            onChange={(e) => {
              const next = e.target.value;
              setPetId(next);
              const first = photos.find((p) => p.petId === next);
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
            onChange={(e) => {
              setPhotoId(e.target.value);
              setResult(null);
            }}
          >
            {filteredPhotos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.takenAt ? new Date(p.takenAt).toLocaleString("ja-JP") : p.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="rounded-xl bg-[#b36048] px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50" disabled={pending || !petId || !photoId} onClick={() => runAnalyze(petId, photoId)}>
          {pending ? "解析中…" : "解析してCrop"}
        </button>
      </section>

      {filteredPhotos.length > 0 ? (
        <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
          {filteredPhotos.slice(0, 24).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setPhotoId(p.id);
                setResult(null);
              }}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${p.id === photoId ? "border-[#b36048]" : "border-transparent"}`}
            >
              {p.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.thumbUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="block h-full w-full bg-[#efe6df]" />
              )}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[14px] text-[#8a7c74]">このペットの写真がありません。</p>
      )}

      {error ? <p className="mb-4 rounded-xl bg-[#fdecea] px-3 py-2 text-[13px] text-[#a24129]">{error}</p> : null}

      {result?.warning ? <p className="mb-4 rounded-xl bg-[#fff6e8] px-3 py-2 text-[13px] text-[#8a5a2b]">{result.warning}</p> : null}

      {result?.ok && result.imageUrl && result.analysis ? (
        <>
          <section className="mb-6 rounded-2xl border border-[#eadfd8] bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="m-0 text-[16px] font-bold">Preview</h2>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} />
                Debug overlay (body / face / head / focal)
              </label>
            </div>
            <div className="relative mx-auto max-w-lg overflow-hidden rounded-xl bg-[#1a1512]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.previewUrl ?? result.imageUrl!} alt="Photo preview" className="block w-full" />
              {debug ? (
                <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">
                  {result.analysis.pets.map((pet, i) => {
                    const head = pet.face ? headSafeAreaFromFace(pet.face) : null;
                    return (
                      <g key={i}>
                        <rect x={pet.bbox.x} y={pet.bbox.y} width={pet.bbox.width} height={pet.bbox.height} fill="none" stroke="#4ade80" strokeWidth={0.008} />
                        {head ? <rect x={head.x} y={head.y} width={head.width} height={head.height} fill="rgba(250, 204, 21, 0.12)" stroke="#facc15" strokeWidth={0.006} strokeDasharray="0.02 0.015" /> : null}
                        {pet.face ? <rect x={pet.face.x} y={pet.face.y} width={pet.face.width} height={pet.face.height} fill="none" stroke="#60a5fa" strokeWidth={0.007} /> : null}
                      </g>
                    );
                  })}
                  <circle cx={result.analysis.focalPoint.x} cy={result.analysis.focalPoint.y} r={0.012} fill="#f97316" />
                </svg>
              ) : null}
            </div>
            <p className="mt-2 text-[12px] text-[#8a7c74]">
              {result.analysis.width}×{result.analysis.height} · {result.analysis.orientation} · pets=
              {result.analysis.pets.length}
              {result.fromCache ? " · cache hit" : ""}
            </p>
            <p className="m-0 text-[11px] text-[#8a7c74]">
              <span className="text-[#4ade80]">■</span> body · <span className="text-[#60a5fa]">■</span> face · <span className="text-[#facc15]">■</span> head safe · <span className="text-[#f97316]">●</span> focal
            </p>
          </section>

          {result.frameMatch ? <FrameMatchingPanel frameMatch={result.frameMatch} /> : null}

          <div className="grid gap-4 md:grid-cols-2">
            {result.frames.map((fr) => (
              <SmartCropFrameCard key={fr.frame.id} result={fr} imageUrl={result.previewUrl ?? result.imageUrl!} />
            ))}
          </div>
        </>
      ) : (
        <p className="text-[14px] text-[#8a7c74]">写真を選んで「解析してCrop」を押してください。</p>
      )}
    </div>
  );
}
