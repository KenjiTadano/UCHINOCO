import { PublicSiteFrame } from "../_components/public-site";
import { publicMetadata } from "@/lib/public-metadata";

export const metadata = publicMetadata("事業者情報・特定商取引法に基づく表記", "UCHINOCOの運営者情報、販売価格、支払方法、提供時期、解約・返金条件の公開状況です。", "/legal");

const disclosures = [
  ["サービス名", "UCHINOCO"],
  ["運営者", "準備中（運営者確認待ち）"],
  ["所在地", "準備中（公開する所在地を運営者確認中）"],
  ["問い合わせ先", "公開窓口準備中。個人情報や未確認のメールアドレスは掲載していません。"],
  ["販売価格", "FREEの基本機能は無料です。UCHINOCO PLUSは月額 ¥680です。Production Printの注文受付は行っていません。"],
  ["販売価格以外の必要料金", "有料機能の提供条件とあわせて確認・表示します。現在準備中です。"],
  ["支払方法", "有料機能の提供条件とあわせて確認・表示します。現在準備中です。"],
  ["支払時期", "有料機能の提供条件とあわせて確認・表示します。現在準備中です。"],
  ["サービス提供時期", "FREEの基本機能はアカウント登録後に利用できます。有料機能・Printの提供時期は準備中です。"],
  ["解約・キャンセル", "有料サービスの条件を運営者確認中です。確定した条件は申込前に表示します。"],
  ["返金", "返金条件は運営者確認中です。確定した条件は申込前に表示します。"],
  ["サブスクリプション", "PLUSの本番価格、課金周期、更新、解約条件は確認中です。確定前の金額・条件は表示していません。"],
] as const;

export default function LegalPage() {
  return (
    <PublicSiteFrame>
      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Business information</p>
          <h1 className="mt-3 font-serif text-3xl leading-snug sm:text-4xl">事業者情報・特定商取引法に基づく表記</h1>
          <p className="mt-4 text-sm leading-7 text-muted">未確定の法務・販売情報は推測で補わず、確認状況を記載しています。販売開始前に運営者による確認・更新が必要です。</p>
        </header>
        <dl className="border-t">
          {disclosures.map(([term, detail]) => (
            <div key={term} className="grid gap-2 border-b py-4 sm:grid-cols-[12rem_1fr] sm:gap-5">
              <dt className="text-sm font-semibold">{term}</dt>
              <dd className="wrap-break-word text-sm leading-6 text-muted">{detail}</dd>
            </div>
          ))}
        </dl>
      </main>
    </PublicSiteFrame>
  );
}
