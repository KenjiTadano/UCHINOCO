import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/app/_components/ui";
import { loadUserEntitlements } from "@/lib/entitlements-server";
import { createClient } from "@/lib/supabase/server";
import { PlusCheckoutButton } from "./plus-checkout-button";

type Props = { searchParams: Promise<{ checkout?: string; next?: string }> };

export default async function PlusPage({ searchParams }: Props) {
  const query = await searchParams;
  const next = query.next?.startsWith("/") && !query.next.startsWith("//") ? query.next : "/home";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/plus")}`);
  const entitlements = await loadUserEntitlements(supabase as unknown as SupabaseClient, user.id);

  return (
    <main className="app-page-narrow grid gap-7">
      <Link className="app-back-link" href={next}>戻る</Link>
      <PageHeader
        eyebrow="UCHINOCO PLUS"
        title="ペットとの人生を、ずっと残す"
        description="今の思い出を残す基本機能と印刷購入はFREEでも利用できます。PLUSは長期の振り返りと家族共有を広げます。"
      />

      {query.checkout === "complete" && entitlements.plan !== "PLUS" ? (
        <p className="rounded-xl bg-surface-warm p-4 text-sm text-muted" role="status">
          お申し込みを確認しています。Stripeからの通知後にPLUSへ反映されます。
        </p>
      ) : null}

      <section className="grid gap-4 rounded-[var(--radius-large)] border border-border bg-surface p-5">
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
          <p className="text-sm font-semibold text-success">PLUSをご利用中です。</p>
        ) : (
          <PlusCheckoutButton next={next} />
        )}
      </section>

      <p className="text-xs leading-5 text-muted">
        写真追加、基本検索、AIアルバム、編集、印刷注文はFREEでも利用できます。決済完了画面だけではPLUSにならず、Stripeの正式な通知をもとに反映します。
      </p>
    </main>
  );
}
