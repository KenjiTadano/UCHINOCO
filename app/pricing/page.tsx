import Link from "next/link";
import { PublicSiteFrame } from "../_components/public-site";
import { publicMetadata } from "@/lib/public-metadata";
import { PlusUpgradeCta } from "@/app/(app)/plus/plus-checkout-button";
import { loadUserEntitlements } from "@/lib/entitlements-server";
import { analyticsEventKey, recordProductAnalyticsEvent } from "@/lib/product-analytics-server";
import { createClient } from "@/lib/supabase/server";

export const metadata = publicMetadata("料金プラン", "UCHINOCOのFREEとPLUSの機能、Print提供状況をご案内します。未確定の料金は表示していません。", "/pricing");

const freeFeatures = ["写真追加", "Photo Intelligence", "UCHINOCO NOW", "AI Albumの作成", "Album編集", "基本検索", "Printプレビュー・データ作成機能"];

const plusFeatures = ["長期履歴", "Year in Review", "長期On This Day", "複数ペット", "家族共有", "高度検索", "Album再生成", "広告なし"];

export default async function PricingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const entitlements = user ? await loadUserEntitlements(supabase, user.id) : null;
  if (user && entitlements?.plan !== "PLUS") {
    await recordProductAnalyticsEvent({
      supabase,
      userId: user.id,
      eventType: "upgrade_viewed",
      eventKey: await analyticsEventKey(`upgrade-view:${user.id}:${new Date().toISOString().slice(0, 10)}`),
    });
  }

  return (
    <PublicSiteFrame>
      <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-8 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Pricing</p>
          <h1 className="mt-3 font-serif text-4xl leading-snug">思い出の残し方で選ぶ。</h1>
          <p className="mt-4 text-sm leading-7 text-muted">基本の写真整理とアルバム機能はFREEで利用できます。PLUSは月額 ¥680です。</p>
        </header>

        <div className="grid gap-8 border-t md:grid-cols-2">
          <section aria-labelledby="free-plan" className="border-b py-6 md:border-b-0 md:border-r md:pr-8">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="free-plan" className="text-2xl font-semibold">
                FREE
              </h2>
              <span className="text-sm font-medium text-success">無料</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted">写真を整理して、毎日の思い出を見返す基本機能。</p>
            <ul className="mt-5 grid gap-3 text-sm leading-6">
              {freeFeatures.map((feature) => (
                <li key={feature} className="border-b pb-3">
                  {feature}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-5 text-muted">Printのプレビュー等は利用できますが、Production Printの注文受付は現在行っていません。フォトブック機能は準備中です。</p>
            <Link className="app-button-secondary mt-5 inline-flex min-h-11 w-full items-center justify-center" href={user ? "/home" : "/signup?next=%2Fplus"}>
              {user ? "アプリを開く" : "無料ではじめる"}
            </Link>
          </section>

          <section aria-labelledby="plus-plan" className="border-b py-6 md:border-b-0 md:pl-2">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="plus-plan" className="text-2xl font-semibold">
                PLUS
              </h2>
              <span className="text-sm font-semibold text-primary">月額 ¥680</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted">より長い時間軸で、家族と一緒に思い出を楽しむ機能。</p>
            <ul className="mt-5 grid gap-3 text-sm leading-6">
              {plusFeatures.map((feature) => (
                <li key={feature} className="border-b pb-3">
                  {feature}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-5 text-muted">いつでも契約内容を確認・解約できます。支払いの管理はBilling画面から行えます。</p>
            <div className="mt-5">
              {entitlements?.plan === "PLUS" ? (
                <Link className="app-button-secondary inline-flex min-h-11 w-full items-center justify-center" href="/settings/billing">
                  プラン・お支払いを確認
                </Link>
              ) : (
                <>
                  <PlusUpgradeCta next="/settings/billing" />
                  {!user ? (
                    <p className="mt-3 text-center text-sm text-muted">
                      <Link className="underline underline-offset-4" href="/login?next=%2Fplus">
                        既にアカウントをお持ちの方はログイン
                      </Link>
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </section>
        </div>

        <p className="mt-8 text-sm leading-6 text-muted">
          ご不明点は
          <Link className="font-semibold text-primary underline underline-offset-4" href="/contact">
            お問い合わせ案内
          </Link>
          をご確認ください。
        </p>
      </main>
    </PublicSiteFrame>
  );
}
