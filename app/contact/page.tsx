import Link from "next/link";
import { PublicSiteFrame } from "../_components/public-site";
import { publicMetadata } from "@/lib/public-metadata";

export const metadata = publicMetadata(
  "お問い合わせ",
  "UCHINOCOへのお問い合わせ方法、返信目安、課金・退会に関する現在の案内です。",
  "/contact",
);

const guidance = [
  ["不具合", "発生した画面や操作、発生時刻を控えてください。正式な問い合わせ窓口は現在準備中です。"],
  ["課金・購入", "PLUSの本番価格と申込条件は確認中です。Production Printの注文受付は行っていません。"],
  ["退会・データ", "写真やペット情報はサービス内の削除機能から削除できます。手続きに関する追加案内は窓口確定後に公開します。"],
];

export default function ContactPage() {
  return (
    <PublicSiteFrame>
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Contact</p>
          <h1 className="mt-3 font-serif text-4xl leading-snug">お問い合わせ</h1>
          <p className="mt-4 text-sm leading-7 text-muted">サービス名：UCHINOCO</p>
        </header>

        <section className="border-y py-5">
          <h2 className="text-base font-semibold">お問い合わせ方法</h2>
          <p className="mt-2 text-sm leading-7 text-muted">公開用のメールアドレス等はまだ確定していません。窓口を準備中のため、このページから個別のお問い合わせは送信できません。正式な窓口が決まり次第、このページでご案内します。</p>
        </section>
        <section className="border-b py-5">
          <h2 className="text-base font-semibold">返信の目安</h2>
          <p className="mt-2 text-sm leading-7 text-muted">返信日数は現在設定中です。窓口公開時に目安を掲載します。</p>
        </section>
        <section className="py-5">
          <h2 className="text-base font-semibold">お問い合わせ内容</h2>
          <div className="mt-3 divide-y border-t">
            {guidance.map(([title, body]) => (
              <div key={title} className="py-4">
                <h3 className="text-sm font-medium">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>
        <p className="border-t pt-5 text-sm leading-6 text-muted">ご利用条件は<Link className="text-primary underline underline-offset-4" href="/terms">利用規約</Link>、情報の取り扱いは<Link className="text-primary underline underline-offset-4" href="/privacy">プライバシーポリシー</Link>をご確認ください。</p>
      </main>
    </PublicSiteFrame>
  );
}