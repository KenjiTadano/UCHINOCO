import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ALBUM_QUALITY_CONFIG,
  ALBUM_QUALITY_HISTORY,
  buildAlbumQualitySummary,
  parseQualityRange,
  qualityRangeStart,
  type AlbumQualitySummary,
  type QualityEvent,
  type QualityStatus,
} from "@/lib/album-quality";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ range?: string }>;

const RANGE_OPTIONS = [
  { key: "7d", label: "7日" },
  { key: "30d", label: "30日" },
  { key: "90d", label: "90日" },
  { key: "all", label: "すべて" },
] as const;

const STATUS_LABEL: Record<QualityStatus, string> = {
  INSUFFICIENT_DATA: "データ収集中",
  HEALTHY: "良好",
  WATCH: "要観察",
  NEEDS_ATTENTION: "要改善",
};

const SIGNAL_LABEL: Record<string, string> = {
  LOW_DIRECT_ACCEPT: "Direct Acceptが目標未達",
  HIGH_LAYOUT_CHANGE: "Layout変更が多い",
  HIGH_CROP_CHANGE: "Crop変更が多い",
  HIGH_PHOTO_SWAP: "写真差し替えが多い",
  LOW_DECORATION_ACCEPT: "Decoration採用が少ない",
  HIGH_DECORATION_RESET: "Decorationの取り消しが多い",
  HIGH_HEAVY_EDIT: "大幅編集が多い",
  LOW_PRINT_INTENT: "印刷プレビュー到達が少ない",
};

function percent(value: number | null) {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

function decimal(value: number | null, suffix = "") {
  return value == null ? "—" : `${value.toFixed(1)}${suffix}`;
}

function MetricCard({ label, value, metric, note, targetLabel }: {
  label: string;
  value: string;
  metric: { sample: number; status: QualityStatus; target: number | null };
  note?: string;
  targetLabel?: string;
}) {
  return (
    <article className="rounded-2xl border border-border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-medium text-muted">{label}</h3>
        <span className="rounded-full bg-surface-warm px-2 py-1 text-[11px] font-medium text-muted">
          {STATUS_LABEL[metric.status]}
        </span>
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted">n={metric.sample}{metric.target == null ? "" : ` / 初期目標 ${targetLabel ?? percent(metric.target)}`}</p>
      {note ? <p className="mt-2 text-xs leading-5 text-muted">{note}</p> : null}
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

async function loadEvents(client: SupabaseClient, userId: string, start: string | null) {
  const pageSize = 1_000;
  const rows: QualityEvent[] = [];
  for (let offset = 0; ; offset += pageSize) {
    let query = client
      .from("album_analytics_events")
      .select("album_id, draft_version_id, event_type, event_data, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (start) query = query.gte("created_at", start);
    const { data, error } = await query;
    if (error) return { rows: [], unavailable: true };
    const batch = (data ?? []) as QualityEvent[];
    rows.push(...batch);
    if (batch.length < pageSize) return { rows, unavailable: false };
  }
}

function Breakdown({ entries, sample }: { entries: Array<[string, number]>; sample: number }) {
  return (
    <div className="divide-y divide-border rounded-2xl border border-border bg-white px-4">
      {entries.map(([label, count]) => (
        <div key={label} className="flex items-center justify-between gap-4 py-3 text-sm">
          <span className="text-foreground">{label}</span>
          <span className="tabular-nums text-muted">{count}件 · {percent(sample ? count / sample : null)} · n={sample}</span>
        </div>
      ))}
    </div>
  );
}

function Dashboard({ summary }: { summary: AlbumQualitySummary }) {
  const accepted = Object.values(summary.acceptance).reduce((total, count) => total + count, 0);
  return (
    <div className="space-y-10">
      <Section title="Primary KPI">
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricCard label="Direct Accept Rate" value={percent(summary.primary.value)} metric={summary.primary} note="Accept操作を強制せず、生成結果がそのまま採用された割合です。" />
          <MetricCard label="Average Edit Distance" value={decimal(summary.averageEditDistance.value)} metric={summary.averageEditDistance} targetLabel={`${ALBUM_QUALITY_CONFIG.targets.averageEditDistance.toFixed(1)}以下`} />
        </div>
      </Section>

      <Section title="Quality Funnel">
        <div className="grid gap-2 sm:grid-cols-5">
          {summary.funnel.map((step) => (
            <article key={step.key} className="rounded-xl bg-surface-warm p-3">
              <p className="text-xs text-muted">{step.label}</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{step.count}</p>
              <p className="text-xs text-muted">{step.rateFromPrevious == null ? "開始" : `前段階の ${percent(step.rateFromPrevious)}`}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section title="Acceptance Breakdown">
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard label="Album Accept Rate" value={percent(summary.acceptRate.value)} metric={summary.acceptRate} />
          <MetricCard label="Average Time to Accept" value={decimal(summary.averageTimeToAcceptSeconds.value, "秒")} metric={summary.averageTimeToAcceptSeconds} />
          <MetricCard label="Regenerate Rate" value={percent(summary.regenerateRate.value)} metric={summary.regenerateRate} />
        </div>
        <Breakdown sample={accepted} entries={[
          ["Direct Accept", summary.acceptance.DIRECT_ACCEPT],
          ["Light Edit", summary.acceptance.LIGHT_EDIT_ACCEPT],
          ["Medium Edit", summary.acceptance.MEDIUM_EDIT_ACCEPT],
          ["Heavy Edit", summary.acceptance.HEAVY_EDIT_ACCEPT],
        ]} />
      </Section>

      <Section title="Edit Breakdown">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(summary.edits).map(([key, item]) => (
            <MetricCard key={key} label={key} value={percent(item.value)} metric={item} />
          ))}
        </div>
      </Section>

      <Section title="Layout / Crop Quality">
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricCard label="AI Layout #1 Keep" value={percent(summary.layout.keep.value)} metric={summary.layout.keep} />
          <MetricCard label="AI Crop Keep" value={percent(summary.crop.keep.value)} metric={summary.crop.keep} note={`modified ${summary.crop.modified} / reset ${summary.crop.reset}`} />
        </div>
        <Breakdown sample={Object.values(summary.layout.ranks).reduce((total, count) => total + count, 0)} entries={Object.entries(summary.layout.ranks).map(([rank, count]) => [rank === "other" ? "Other selected" : `#${rank} selected`, count])} />
      </Section>

      <Section title="Decoration Quality">
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard label="Preview Rate" value={percent(summary.decoration.previewRate.value)} metric={summary.decoration.previewRate} />
          <MetricCard label="Apply Rate" value={percent(summary.decoration.applyRate.value)} metric={summary.decoration.applyRate} />
          <MetricCard label="Reset Rate" value={percent(summary.decoration.resetRate.value)} metric={summary.decoration.resetRate} />
        </div>
        <Breakdown sample={summary.decoration.shown} entries={Object.entries(summary.decoration.byStyle).map(([style, counts]) => [`${style}: applied ${counts.applied} / reset ${counts.reset}`, counts.shown])} />
      </Section>

      <Section title="Print Intent">
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricCard label="Print Preview Rate" value={percent(summary.print.preview.value)} metric={summary.print.preview} />
          <MetricCard label="Checkout Start Rate" value={percent(summary.print.checkout.value)} metric={summary.print.checkout} />
        </div>
      </Section>

      <Section title="Improvement Signals">
        {summary.signals.length ? (
          <div className="space-y-2">
            {summary.signals.map((signal) => (
              <article key={signal.code} className="rounded-2xl border border-border bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm text-foreground">{SIGNAL_LABEL[signal.code] ?? signal.code}</strong>
                  <span className="rounded-full bg-surface-warm px-2 py-1 text-[11px] text-muted">{STATUS_LABEL[signal.status]}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted">{signal.recommendation}</p>
              </article>
            ))}
          </div>
        ) : <p className="rounded-2xl bg-surface-warm p-4 text-sm text-muted">現時点で確定的な改善シグナルはありません。n={summary.funnel[0]?.count ?? 0}（各指標はn={ALBUM_QUALITY_CONFIG.minimumSample}以上で判定）</p>}
      </Section>
    </div>
  );
}

export default async function AlbumQualityPage({ searchParams }: { searchParams: SearchParams }) {
  if (process.env.NODE_ENV === "production") redirect("/home");
  const params = await searchParams;
  const range = parseQualityRange(params.range);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const result = await loadEvents(supabase as unknown as SupabaseClient, user.id, qualityRangeStart(range));
  const summary = buildAlbumQualitySummary(result.rows, range);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Internal · Task061</p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Album Quality Feedback Loop</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted">Task060の計測開始日以降に記録された、ご自身の集約イベントだけを表示します。写真・ペット名・本文・メール・ユーザーIDは表示しません。</p>
      </header>

      <nav aria-label="集計期間" className="flex flex-wrap gap-2">
        {RANGE_OPTIONS.map((option) => {
          const active = option.key === range;
          return <Link key={option.key} href={`/dev/album-quality?range=${option.key}`} aria-current={active ? "page" : undefined} className={`min-h-11 rounded-full px-4 py-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary ${active ? "bg-primary text-white" : "border border-border bg-white text-foreground"}`}>{option.label}</Link>;
        })}
      </nav>

      {result.unavailable ? (
        <section className="rounded-2xl border border-border bg-white p-6">
          <h2 className="text-lg font-semibold text-foreground">データを収集中です</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Task060のanalytics migration適用後から計測を開始します。履歴は推測補完しません。</p>
        </section>
      ) : summary.empty ? (
        <section className="rounded-2xl border border-border bg-white p-6">
          <h2 className="text-lg font-semibold text-foreground">データを収集中です</h2>
          <p className="mt-2 text-sm text-muted">イベントが記録されると、品質指標と改善候補がここに表示されます。</p>
        </section>
      ) : <Dashboard summary={summary} />}

      <Section title="Improvement History">
        <div className="flex flex-wrap gap-2">
          {ALBUM_QUALITY_HISTORY.map((item) => <span key={item.task} className="rounded-full border border-border bg-white px-3 py-2 text-xs text-muted"><strong className="text-foreground">{item.task}</strong> · {item.label}</span>)}
        </div>
      </Section>
      <p className="pb-6 text-xs leading-5 text-muted">初期目標は製品目標であり実績ではありません。サンプルn={ALBUM_QUALITY_CONFIG.minimumSample}未満では品質を断定しません。計測イベント数: {summary.measuredEventCount}</p>
    </main>
  );
}
