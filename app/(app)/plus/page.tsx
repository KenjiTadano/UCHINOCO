import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/app/_components/ui";
import { safeAppReturnPath } from "@/lib/app-return-path";
import { loadUserEntitlements } from "@/lib/entitlements-server";
import { analyticsEventKey, recordProductAnalyticsEvent } from "@/lib/product-analytics-server";
import { createClient } from "@/lib/supabase/server";
import { PlusUpgradeCta } from "./plus-checkout-button";
import { CheckoutReturnStatus } from "./checkout-return-status";

type Props = { searchParams: Promise<{ checkout?: string; next?: string }> };

export default async function PlusPage({ searchParams }: Props) {
  const query = await searchParams;
  const next = safeAppReturnPath(query.next) ?? "/settings/billing";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/plus?next=${next}`)}`);
  const entitlements = await loadUserEntitlements(supabase as unknown as SupabaseClient, user.id);
  const checkoutReturned = query.checkout === "complete" || query.checkout === "cancelled";
  if (entitlements.plan !== "PLUS" || checkoutReturned) {
    await recordProductAnalyticsEvent({
      supabase: supabase as unknown as SupabaseClient,
      userId: user.id,
      eventType: "upgrade_viewed",
      eventKey: await analyticsEventKey(`${checkoutReturned ? `upgrade-return:${query.checkout}` : "upgrade-view"}:${user.id}:${new Date().toISOString().slice(0, 10)}`),
    });
  }

  return (
    <main className="app-page-narrow grid gap-7">
      <Link className="app-back-link" href={next}>戻る</Link>
      <PageHeader
        eyebrow="UCHINOCO PLUS"
        title="ペットとの人生を、ずっと残す"
        description="写真追加やAI Albumなどの基本機能はFREEで利用できます。PLUSは長期の振り返りと家族共有を広げます。フォトブック注文は準備中です。"
      />

      {query.checkout === "complete" && entitlements.plan !== "PLUS" ? <CheckoutReturnStatus /> : null}
      {query.checkout === "complete" && entitlements.plan === "PLUS" ? (
        <p className="rounded-xl bg-success-soft p-4 text-sm font-semibold text-success" role="status">
          UCHINOCO PLUSをご利用いただけます。
        </p>
      ) : null}
      {query.checkout === "cancelled" ? (
        <p className="rounded-xl bg-surface-warm p-4 text-sm text-muted" role="status">
          今回のお申し込みは完了していません。FREEのまま引き続きご利用いただけます。
        </p>
      ) : null}

      <section className="grid gap-4 rounded-(--radius-large) border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="ds-heading">現在のプラン</h2>
          <span className="rounded-full bg-surface-warm px-3 py-1 text-xs font-semibold text-foreground">
            {entitlements.plan}
          </span>
        </div>
        <ul className="grid gap-2 text-sm leading-6 text-muted">
          <li>長期・月次・年次の思い出</li>
          <li>高度な期間検索と複数年のOn This Day</li>
          <li>複数ペットと家族共有</li>
          <li>AIアルバムの再編集・再生成</li>
          <li>広告なし</li>
        </ul>
        {entitlements.plan === "PLUS" ? (
          <>
            <p className="text-sm font-semibold text-success">PLUSをご利用中です。</p>
            <Link className="app-button-secondary min-h-11" href="/settings/billing">プラン・お支払いを確認</Link>
          </>
        ) : (
          <PlusUpgradeCta next={next} />
        )}
      </section>

      <p className="text-xs leading-5 text-muted">
        写真追加、基本検索、AIアルバム、編集はFREEでも利用できます。フォトブック注文は準備中です。決済完了画面だけではPLUSにならず、Stripeの正式な通知をもとに反映します。
      </p>
    </main>
  );
}
