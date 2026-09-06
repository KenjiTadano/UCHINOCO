import Link from "next/link";
import { LegalNavigation } from "../_components/legal-navigation";

const sections = [
  ["取り扱う情報", "メールアドレス、表示名、ペット情報、登録写真、キャプション、撮影日時、お気に入り情報、AI解析結果など、サービス提供に必要な情報を取り扱います。"],
  ["利用する基盤", "認証、データベース、画像保管にはSupabaseを利用します。写真はprivate Storageで管理し、認証と権限確認を経て表示します。"],
  ["AI解析", "ユーザーが写真詳細でAI解析を明示的に実行した場合のみ、対象写真を解析のため外部AIサービスへ送信します。AI検索は保存済みの解析結果を利用し、検索のたびに写真を再送信しません。"],
  ["利用目的", "サービスの提供、本人確認、データ保存、機能改善、不正利用防止、障害調査、セキュリティ確保のために必要な範囲で情報を処理します。"],
  ["データの削除", "写真とペット情報はサービス内の削除機能から削除できます。ペットを削除すると、そのペットの写真と関連するAI解析結果も削除対象になります。"],
  ["お問い合わせ", "お問い合わせ方法および運営者情報は、公開時にサービス内の案内から確認できるようにします。"],
] as const;

export default function PrivacyPage() {
  return (
    <>
      <main className="app-page-narrow">
        <header><p className="app-eyebrow">UCHINOCO</p><h1 className="app-title">プライバシーポリシー</h1></header>
        <p className="text-sm leading-relaxed text-muted">本ページはMVPにおける情報の取り扱い方針を説明するものです。公開時の運営形態や適用法令に応じて内容を更新することがあります。</p>
        {sections.map(([title, body]) => <section key={title} className="grid gap-2"><h2 className="app-section-title text-lg">{title}</h2><p className="text-sm leading-7">{body}</p></section>)}
        <p className="text-xs text-muted">制定日：2026年9月6日</p>
        <Link className="app-back-link" href="/">UCHINOCOへ戻る</Link>
      </main>
      <LegalNavigation />
    </>
  );
}
