"use client";

import {
  FRAME_MATCH_REJECT_LABELS,
  FRAME_MATCH_WARNING_LABELS,
} from "@/lib/smart-crop/frame-match";
import type {
  FrameMatchRanking,
  FrameMatchResult,
  FrameMatchTier,
} from "@/lib/smart-crop/types";

type Props = {
  frameMatch: FrameMatchRanking;
};

function tierBadge(tier: FrameMatchTier, isBest: boolean): string {
  if (tier === "unusable") return "UNUSABLE";
  if (isBest && tier === "strict") return "BEST · STRICT";
  if (isBest && tier === "fallback") return "BEST · FALLBACK";
  if (tier === "strict") return "STRICT";
  return "FALLBACK";
}

function displayScore(row: FrameMatchResult): number {
  if (row.matchTier === "strict") return row.matchScore;
  return row.fallbackScore;
}

export function FrameMatchingPanel({ frameMatch }: Props) {
  const { best, ranking, mode } = frameMatch;

  return (
    <section
      className="mb-6 rounded-2xl border border-[#eadfd8] bg-white p-4"
      data-testid="frame-matching-panel"
    >
      <header className="mb-3">
        <p className="m-0 text-[12px] font-semibold tracking-wide text-[#b36048]">
          Task049.1 · Frame Matching
        </p>
        <h2 className="mt-1 m-0 text-[16px] font-bold">Frame Matching</h2>
        <p className="mt-1 m-0 text-[13px] text-[#6a5c54]">
          STRICT → FALLBACK → UNUSABLE · mode=
          <strong>{mode}</strong>
        </p>
      </header>

      {best ? (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 ${
            best.matchTier === "fallback"
              ? "border-[#e8c98a] bg-[#fff8e8]"
              : "border-[#f0d8cc] bg-[#fff8f4]"
          }`}
        >
          <p
            className={`m-0 text-[11px] font-semibold uppercase tracking-wide ${
              best.matchTier === "fallback"
                ? "text-[#9a6b12]"
                : "text-[#b36048]"
            }`}
          >
            Best Match · {best.matchTier === "fallback" ? "FALLBACK" : "STRICT"}
          </p>
          <p className="mt-1 mb-0 text-[20px] font-bold text-[#332f2b]">
            {best.frame.label}
          </p>
          <p className="mt-1 mb-0 text-[14px] text-[#5c534e]">
            Score <strong>{displayScore(best)}</strong>
            <span className="mx-2 text-[#d4c4ba]">·</span>
            Crop Overall {best.quality.overall}
            {best.needsAdjustment ? (
              <>
                <span className="mx-2 text-[#d4c4ba]">·</span>
                needsAdjustment
              </>
            ) : null}
          </p>
          {best.matchTier === "fallback" && best.fallbackReason ? (
            <p className="mt-2 mb-0 rounded-lg bg-[#fff3d6] px-2.5 py-1.5 text-[12px] text-[#8a5a2b]">
              {best.fallbackReason}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mb-4 rounded-xl bg-[#fdecea] px-3 py-2 text-[13px] text-[#a24129]">
          採用可能な Frame がありません（全て UNUSABLE）。
        </p>
      )}

      <h3 className="m-0 mb-2 text-[13px] font-bold text-[#5c534e]">Ranking</h3>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {ranking.map((row, index) => {
          const isBest = Boolean(best && row.frameId === best.frameId);
          const badge = isBest
            ? tierBadge(row.matchTier, true)
            : tierBadge(row.matchTier, false);
          const rankNum =
            row.matchTier === "unusable"
              ? null
              : ranking
                  .slice(0, index + 1)
                  .filter((r) => r.matchTier !== "unusable").length;

          return (
            <li
              key={row.frameId}
              className={`rounded-xl border px-3 py-2.5 ${
                row.matchTier === "unusable"
                  ? "border-[#f0d0c8] bg-[#fff7f5]"
                  : row.matchTier === "fallback"
                    ? isBest
                      ? "border-[#e8c98a] bg-[#fffdf5]"
                      : "border-[#efe0c0] bg-[#fffcf5]"
                    : isBest
                      ? "border-[#e8cfc3] bg-[#fcfaf7]"
                      : "border-[#eadfd8] bg-white"
              }`}
              data-testid={`frame-match-row-${row.frameId}`}
              data-tier={row.matchTier}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${
                      row.matchTier === "unusable"
                        ? "bg-[#f5d0c8] text-[#a24129]"
                        : row.matchTier === "fallback"
                          ? "bg-[#f5e4b8] text-[#9a6b12]"
                          : "bg-[#f0e4dc] text-[#b36048]"
                    }`}
                  >
                    {rankNum != null ? `${rankNum}. ` : ""}
                    {badge}
                  </span>
                  <span className="text-[14px] font-semibold text-[#332f2b]">
                    {row.frame.label}
                  </span>
                </div>
                <span className="font-mono text-[13px] tabular-nums text-[#332f2b]">
                  {row.matchTier === "unusable" ? (
                    <span className="font-bold text-[#a24129]">UNUSABLE</span>
                  ) : (
                    <>
                      {row.matchTier === "fallback" ? "FB " : "Match "}
                      <strong>{displayScore(row)}</strong>
                    </>
                  )}
                </span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-[#6a5c54] sm:grid-cols-3">
                <div>
                  Crop Overall <strong>{row.quality.overall}</strong>
                </div>
                <div>
                  Aspect <strong>{row.compatibility.aspect}</strong>
                </div>
                <div>
                  Subject Fit <strong>{row.compatibility.subjectFit}</strong>
                </div>
                <div>
                  Mask Fit <strong>{row.compatibility.maskFit}</strong>
                </div>
                <div>
                  Composition <strong>{row.compatibility.compositionFit}</strong>
                </div>
                <div>
                  Fallback <strong>{row.fallbackScore}</strong>
                </div>
              </div>

              {row.matchTier === "fallback" && row.fallbackReason ? (
                <p className="mt-1.5 mb-0 text-[11px] text-[#8a5a2b]">
                  {row.fallbackReason}
                </p>
              ) : null}

              {row.matchTier === "unusable" && row.rejectReasons.length > 0 ? (
                <p className="mt-1.5 mb-0 text-[11px] text-[#a24129]">
                  {row.rejectReasons
                    .map((r) => FRAME_MATCH_REJECT_LABELS[r] ?? r)
                    .join(" · ")}
                </p>
              ) : null}

              {row.warnings.length > 0 && row.matchTier !== "unusable" ? (
                <p className="mt-1 mb-0 text-[10px] text-[#8a7c74]">
                  {row.warnings
                    .filter((w) => w !== "FALLBACK_BEST" || isBest)
                    .map((w) => FRAME_MATCH_WARNING_LABELS[w] ?? w)
                    .join(" · ")}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
