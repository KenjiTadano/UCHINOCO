import Link from "next/link";
import { PublicSiteFrame } from "../_components/public-site";
import { publicMetadata } from "@/lib/public-metadata";

export const metadata = publicMetadata(
  "利用規約",
  "UCHINOCOのアカウント、写真、AI解析、サービス利用に関する規約です。",
  "/terms",
);

const sections = [
  ["サービスについて", "UCHINOCOは、ペットのプロフィールや思い出写真を保存し、振り返るためのサービスです。健康相談や獣医師による診断を提供するものではありません。"],
  ["登録コンテンツ", "ユーザーは、自身が利用する権利を持つ写真や情報のみを登録してください。違法な内容、第三者の権利やプライバシーを侵害する内容は登録できません。"],
  ["アカウント管理", "ユーザーはメールアドレス、パスワードその他の認証情報を適切に管理し、不正利用に気付いた場合は速やかにパスワードを変更してください。"],
  ["AI解析", "AI解析結果は写真から推定した参考情報であり、完全性や正確性を保証するものではありません。健康状態や医療上の判断には使用せず、必要な場合は獣医師へ相談してください。"],
  ["禁止事項", "法令違反、不正アクセス、サービス運営の妨害、第三者へのなりすまし、権利侵害コンテンツの登録、その他サービスに不利益を与える行為を禁止します。"],
  ["変更・停止", "保守、障害、セキュリティ対応その他の事情により、サービス内容を変更または一時停止する場合があります。重要な変更は可能な範囲でサービス内に案内します。"],
  ["データの削除", "ユーザーはサービス内の機能から写真やペット情報を削除できます。削除操作は取り消せない場合があるため、確認のうえ実行してください。"],
  ["Print提供状況", "Production Printの注文受付は現在行っていません。フォトブック機能の提供開始時には、価格や利用条件を事前に案内します。"],
] as const;

export default function TermsPage() {
  return (
    <PublicSiteFrame>
      <main className="mx-auto flex w-full max-w-md flex-col gap-7 px-4 py-8 sm:px-6 sm:py-10">
        <header><p className="app-eyebrow">UCHINOCO</p><h1 className="app-title">利用規約</h1></header>
        <p className="text-sm leading-relaxed text-muted">本規約はUCHINOCOのMVP利用条件を定めます。公開時の運営形態に応じて改定することがあります。</p>
        {sections.map(([title, body]) => <section key={title} className="grid gap-2"><h2 className="app-section-title text-lg">{title}</h2><p className="text-sm leading-7">{body}</p></section>)}
        <section className="grid gap-2">
          <h2 className="app-section-title text-lg">お問い合わせ</h2>
          <p className="text-sm leading-7">
            問い合わせ窓口は準備中です。詳細は<Link className="underline underline-offset-4" href="/contact">お問い合わせページ</Link>をご確認ください。
          </p>
        </section>
        <p className="text-xs text-muted">制定日：2026年9月6日</p>
        <Link className="app-back-link" href="/">UCHINOCOへ戻る</Link>
      </main>
    </PublicSiteFrame>
  );
}
