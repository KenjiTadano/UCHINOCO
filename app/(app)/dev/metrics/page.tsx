import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  analyticsRangeStart,
  buildProductionKpis,
  parseAnalyticsRange,
  type KpiMetric,
  type ProductionKpiRaw,
} from "@/lib/product-analytics";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ranges = [{ key: "7d", label: "7日" }, { key: "30d", label: "30日" }, { key: "all", label: "全期間" }] as const;
const pct = (metric: KpiMetric) => metric.value == null ? "—" : `${Math.round(metric.value * 100)}%`;

function Metric({ label, value, metric }: { label: string; value: string; metric?: KpiMetric }) {
  return <article className="rounded-2xl border border-border bg-white p-4"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>{metric ? <p className="mt-1 text-xs text-muted">n={metric.sample} · {metric.sufficient ? "集計対象" : "データ不足"}</p> : null}</article>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3"><h2 className="text-xl font-semibold text-foreground">{title}</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div></section>;
}

export default async function ProductionMetricsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const allowed = new Set((process.env.UCHINOCO_INTERNAL_USER_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean));
  if (process.env.NODE_ENV === "production" && !allowed.has(user.id)) notFound();

  const range = parseAnalyticsRange((await searchParams).range);
  const admin = createAdminClient() as unknown as SupabaseClient;
  const { data, error } = await admin.rpc("get_production_kpis", { p_since: analyticsRangeStart(range) });
  const summary = buildProductionKpis(error || !data ? {} : data as unknown as ProductionKpiRaw);
  const raw = summary.raw;

  return <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:px-6">
    <header className="space-y-2"><p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Internal · Task074</p><h1 className="text-3xl font-semibold text-foreground">Production KPIs</h1><p className="text-sm text-muted">個人情報・検索語・写真情報を含まないサーバー集計です。n=10未満はデータ不足として扱います。</p></header>
    <nav aria-label="集計期間" className="flex gap-2">{ranges.map((item) => <Link key={item.key} href={`/dev/metrics?range=${item.key}`} aria-current={range === item.key ? "page" : undefined} className={range === item.key ? "app-button-primary" : "app-button-secondary"}>{item.label}</Link>)}</nav>
    {error ? <p role="alert" className="app-error">KPIを取得できませんでした。</p> : null}
    <Section title="Album Quality"><Metric label="Direct Accept Rate" value={pct(summary.album.directAccept)} metric={summary.album.directAccept} /><Metric label="Album Completion Rate" value={pct(summary.album.completionAccepted)} metric={summary.album.completionAccepted} /><Metric label="Avg Edit Distance" value={summary.album.averageEditDistance.value?.toFixed(1) ?? "—"} /><Metric label="Layout Keep Rate" value={pct(summary.album.layoutKeep)} metric={summary.album.layoutKeep} /><Metric label="Crop Keep Rate" value={pct(summary.album.cropKeep)} metric={summary.album.cropKeep} /><Metric label="Swap Rate" value={pct(summary.album.swapRate)} metric={summary.album.swapRate} /><Metric label="Text Edit Rate" value={pct(summary.album.textEditRate)} metric={summary.album.textEditRate} /><Metric label="Decoration Apply Rate" value={pct(summary.album.decorationApplyRate)} metric={summary.album.decorationApplyRate} /></Section>
    <Section title="Monetization"><Metric label="FREE Active Users" value={String(raw.free_active_users)} /><Metric label="PLUS Active Users" value={String(raw.plus_active_users)} /><Metric label="Upgrade Start Rate" value={pct(summary.monetization.upgradeStart)} metric={summary.monetization.upgradeStart} /><Metric label="Subscription Activation Rate" value={pct(summary.monetization.activation)} metric={summary.monetization.activation} /></Section>
    <Section title="Print Funnel"><Metric label="Preview Rate" value={pct(summary.print.preview)} metric={summary.print.preview} /><Metric label="Checkout Start Rate" value={pct(summary.print.checkout)} metric={summary.print.checkout} /><Metric label="Payment Success Rate" value={pct(summary.print.payment)} metric={summary.print.payment} /><Metric label="Fulfillment Readiness" value={pct(summary.print.fulfillmentReadiness)} metric={summary.print.fulfillmentReadiness} /></Section>
    <Section title="Search"><Metric label="Open" value={String(raw.search_opened)} /><Metric label="Result Open Rate" value={pct(summary.search.resultOpen)} metric={summary.search.resultOpen} /><Metric label="Empty Rate" value={pct(summary.search.empty)} metric={summary.search.empty} /></Section>
    <Section title="Family"><Metric label="Invite Sent" value={String(raw.family_invite_sent)} /><Metric label="Invite Accept Rate" value={pct(summary.family.inviteAccept)} metric={summary.family.inviteAccept} /><Metric label="Family Photos" value={String(summary.family.photoAdded)} /><Metric label="Activity Viewed" value={String(summary.family.activityViewed)} /></Section>
    <p className="pb-6 text-xs leading-5 text-muted">MRR・LTV・発送・配達は実データがない限り推定しません。決済と製造準備は別指標です。</p>
  </main>;
}
