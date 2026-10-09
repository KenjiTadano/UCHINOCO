export const GENERATION_PHASES = [
  "01_request_validation",
  "02_pet_ownership_validation",
  "03_source_photo_query",
  "04_intelligence_metadata_query",
  "05_grouping_preparation",
  "06_best_shot_preparation",
  "07_missing_analysis_intelligence",
  "08_photo_ranking_selection",
  "09_layout_planning",
  "10_crop_calculation",
  "11_whole_album_rhythm_audit",
  "12_album_row_creation",
  "13_spread_page_persistence",
  "14_cover_persistence",
  "15_metadata_persistence",
  "16_redirect_preparation",
] as const;
export type GenerationPhase = (typeof GENERATION_PHASES)[number];

export function generationPerformance(emit: (record: Record<string, unknown>) => void = (record) => console.info("Album generation performance", record), now: () => number = () => performance.now()) {
  const runId = crypto.randomUUID();
  const totalStart = now();
  const phases = new Map<GenerationPhase, { time: number; startedAt: string }>();
  let finished = false;
  return {
    context(values: { selectedPetIds: string[]; petCount: number; periodPreset: string; periodStart: string; periodEnd: string; requestedBodyPages: number }) {
      emit({ runId, event: "conditions", ...values });
    },
    counts(values: { eligiblePhotoCount: number; selectedSourcePhotoCount: number; existingIntelligenceCount: number; missingIntelligenceCount: number; cropAnalysisRequiredCount: number; layoutPlanningSpreadCount: number; metadataQueryCount: number; legacyTechnicalFallbackCount: number; failedAnalysisCount: number }) {
      emit({ runId, event: "counts", ...values });
    },
    start(phase: GenerationPhase, itemCount = 0) {
      const startedAt = new Date().toISOString();
      phases.set(phase, { time: now(), startedAt });
      emit({ runId, phase, event: "started", startedAt, durationMs: 0, itemCount });
    },
    end(phase: GenerationPhase, itemCount = 0) {
      const started = phases.get(phase);
      if (!started) return;
      phases.delete(phase);
      emit({ runId, phase, event: "completed", startedAt: started.startedAt, durationMs: Math.round((now() - started.time) * 100) / 100, itemCount });
    },
    finish(outcome: "ready" | "analysis_pending" | "failed") {
      if (finished) return;
      finished = true;
      for (const [phase, started] of phases) emit({ runId, phase, event: "aborted", startedAt: started.startedAt, durationMs: Math.round((now() - started.time) * 100) / 100, itemCount: 0 });
      phases.clear();
      emit({ runId, event: "finished", outcome, durationMs: Math.round((now() - totalStart) * 100) / 100 });
    },
    measured(phase: GenerationPhase, startedAt: string, durationMs: number, itemCount: number) {
      emit({ runId, phase, event: "started", startedAt, durationMs: 0, itemCount });
      emit({ runId, phase, event: "completed", startedAt, durationMs: Math.round(durationMs * 100) / 100, itemCount });
    },
    budgetExceeded() {
      return now() - totalStart >= 80_000;
    },
    work(values: { sourceQueryCount: number; analysisQueryCount: number; cropCalculatedCount: number; cropReusedCount: number; layoutCandidateCount: number; visionCallCount: number; originalDownloadCount: number }) {
      emit({ runId, event: "work", ...values });
    },
  };
}
