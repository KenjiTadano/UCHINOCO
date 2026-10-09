import Link from "next/link";
import { redirect } from "next/navigation";
import { AIAnalysisRunner } from "@/app/(app)/_components/ai-analysis-runner";
import { AppShell } from "@/app/(app)/_components/app-shell";
import { PlusUpgradeCta } from "@/app/(app)/plus/plus-checkout-button";
import { BillingPortalButton } from "@/app/(app)/settings/billing/billing-portal-button";
import { getBillingSubscriptionPresentation } from "@/lib/billing-display";
import { loadUserEntitlements } from "@/lib/entitlements-server";
import { createClient } from "@/lib/supabase/server";

export default async function BillingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Fsettings%2Fbilling");

  const [{ data: subscription }, entitlements] = await Promise.all([
    supabase
      .from("user_subscriptions")
      .select("status,current_period_end,cancel_at_period_end,stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle(),
    loadUserEntitlements(supabase, user.id),
  ]);
  const isPlus = entitlements.plan === "PLUS";
  const presentation = getBillingSubscriptionPresentation({
    plan: entitlements.plan,
    status: subscription?.status,
    cancelAtPeriodEnd: subscription?.cancel_at_period_end,
    currentPeriodEnd: subscription?.current_period_end,
  });

  return (
    <AppShell analysis={<AIAnalysisRunner key={user.id} />}>
      <main className="app-page-narrow">
        <Link className="app-back-link" href="/home">ホームへ戻る</Link>
        <header>
          <p className="app-eyebrow">ACCOUNT</p>
          <h1 className="app-title">プラン・お支払い</h1>
        </header>

        <section className="grid gap-4 rounded-(--radius-medium) border border-border bg-surface p-5" aria-labelledby="current-plan-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="current-plan-heading" className="ds-heading">現在のプラン</h2>
            <span className="text-sm font-semibold">{isPlus ? "PLUS" : "FREE"}</span>
          </div>

          {isPlus ? (
            <>
              <p className="text-lg font-semibold">UCHINOCO PLUS</p>
              <p className="text-sm">月額 ¥680</p>
              <dl className="grid gap-2 border-t pt-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">契約状態</dt>
                  <dd>{presentation.contractStatus}</dd>
                </div>
                {presentation.formattedPeriodEnd && presentation.periodEndLabel ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">{presentation.periodEndLabel}</dt>
                    <dd>{presentation.formattedPeriodEnd}</dd>
                  </div>
                ) : null}
              </dl>
              {presentation.cancellationNotice ? (
                <p className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm leading-6 text-warning" role="status" aria-live="polite">
                  {presentation.cancellationNotice}
                </p>
              ) : null}
              {subscription?.stripe_customer_id ? (
                <BillingPortalButton />
              ) : (
                <p className="text-sm leading-6 text-muted" role="status">
                  契約管理に必要なお支払い情報を確認できません。サポート窓口は準備中です。
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm leading-6 text-muted">写真追加、Photo Intelligence、UCHINOCO NOW、AI Album、編集、基本検索はFREEで利用できます。</p>
              <div className="border-t pt-4">
                <p className="mb-3 text-sm font-semibold">PLUSで、思い出をもっと長く残せます</p>
                <ul className="mb-4 grid gap-2 text-sm leading-6 text-muted">
                  <li>家族と一緒に残す、複数ペット</li>
                  <li>Year in Review、長期On This Day、成長比較</li>
                  <li>詳しい検索、Album再生成、広告なし</li>
                </ul>
                <PlusUpgradeCta next="/settings/billing" />
                {subscription?.stripe_customer_id ? (
                  <div className="mt-4 grid gap-2 border-t pt-4">
                    <p className="text-sm text-muted">既存のお支払い・契約がある場合はこちらから確認できます。</p>
                    <BillingPortalButton />
                  </div>
                ) : null}
              </div>
            </>
          )}
        </section>
      </main>
    </AppShell>
  );
}