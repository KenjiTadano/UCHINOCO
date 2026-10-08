import type { Metadata } from "next";
import Link from "next/link";
import { AiAlbumIllustration, PublicHeroImage, PublicSiteFrame } from "./_components/public-site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "うちの子との毎日を、家族のアルバムに",
  description: "写真を追加するだけでAIが整理。ベストショットや日々の思い出を、家族と一緒に振り返れるペットアルバムです。",
  alternates: { canonical: "/" },
  openGraph: {
    title: "UCHINOCO | うちの子との思い出アルバム",
    description: "写真を撮るだけ。うちの子との毎日を、家族のアルバムに。",
    url: "/",
  },
};

const workflow = [
  ["01", "写真を追加", "いつもの写真をアップロード。撮影日と一緒に思い出として残します。"],
  ["02", "AIが整理", "写真の内容をAIが読み取り、あとから見つけやすく整理します。"],
  ["03", "ベストショット", "お気に入りの一枚や、その日の小さなできごとを振り返れます。"],
  ["04", "AI Album", "写真を選んで、思い出を一冊のアルバムにまとめます。"],
];

const memories = [
  ["UCHINOCO NOW", "最近の写真や、いま振り返りたい思い出へ。"],
  ["思い出検索", "日付や写真の内容から、あの一枚を探せます。"],
  ["Year in Review", "一年の思い出をまとめて振り返る、PLUSの機能です。"],
  ["家族共有", "家族と一緒に写真を見返せる、PLUSの機能です。"],
];

export default function RootPage() {
  return (
    <PublicSiteFrame>
      <main>
        <section className="mx-auto grid w-full max-w-6xl items-center gap-8 px-4 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-16 md:grid-cols-[1.02fr_0.98fr]">
          <div className="max-w-xl">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.14em] text-primary">A little more together, every day</p>
            <h1 className="font-serif text-4xl leading-[1.35] text-foreground sm:text-5xl">
              写真を撮るだけ。<br />
              うちの子との人生が、<br className="hidden sm:block" />アルバムになっていく。
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-muted">
              何気ない一日も、あとから宝物になる。写真をAIが整理して、家族と一緒に振り返れるペットの思い出アルバムです。
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link className="inline-flex min-h-12 items-center justify-center rounded-md bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary-hover" href="/signup">無料ではじめる</Link>
              <Link className="inline-flex min-h-12 items-center justify-center rounded-md border border-border bg-surface px-6 font-semibold text-foreground hover:bg-surface-warm" href="/login">ログイン</Link>
            </div>
            <p className="mt-3 text-xs text-muted">基本の思い出機能はFREEでご利用いただけます。</p>
          </div>
          <div className="aspect-[1.7] overflow-hidden rounded-md border bg-surface-warm">
            <PublicHeroImage />
          </div>
        </section>

        <section id="features" className="scroll-mt-8 border-y bg-surface">
          <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-10 sm:px-6 sm:py-14 md:grid-cols-[0.75fr_1.25fr] md:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-success">What is UCHINOCO?</p>
              <h2 className="mt-3 font-serif text-3xl leading-snug">うちの子との時間を、<br />ちゃんと残す場所。</h2>
            </div>
            <p className="max-w-2xl text-base leading-7 text-muted">
              UCHINOCOは、ペットの写真と日々の思い出を保存し、見つけて、家族と振り返るためのサービスです。写真が増えても、思い出が埋もれないようにAIがお手伝いします。
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="mb-7 max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">From photo to memory</p>
            <h2 className="mt-3 font-serif text-3xl leading-snug">写真を残すところから、<br />思い出を見返すところまで。</h2>
          </div>
          <div className="grid border-t md:grid-cols-4">
            {workflow.map(([number, title, body]) => (
              <article key={number} className="border-b py-5 md:border-b-0 md:border-r md:px-5 md:first:pl-0 md:last:border-r-0">
                <p className="text-sm font-semibold tabular-nums text-success">{number}</p>
                <h3 className="mt-3 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y bg-[#edf4ef]">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-6 px-4 py-8 sm:px-6 sm:py-12 md:grid-cols-[0.75fr_1.25fr]">
            <div className="mx-auto w-full max-w-[280px] md:order-2">
              <AiAlbumIllustration />
            </div>
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-success">Memories, within reach</p>
              <h2 className="mt-3 font-serif text-3xl leading-snug">思い出は、<br />探す時間も愛おしい。</h2>
              <p className="mt-4 text-sm leading-7 text-muted">ベストショットを見つけたり、過去の写真を検索したり。写真を眺めながら、あの日のことをもう一度。</p>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Little moments, long stories</p>
              <h2 className="mt-3 font-serif text-3xl leading-snug">毎日の写真から、<br />いつかの振り返りまで。</h2>
            </div>
            <Link className="text-sm font-semibold text-primary underline underline-offset-4" href="/pricing">FREEとPLUSを見る</Link>
          </div>
          <div className="grid border-t sm:grid-cols-2">
            {memories.map(([title, body], index) => (
              <article key={title} className={`border-b py-5 ${index % 2 === 0 ? "sm:pr-6 sm:border-r" : "sm:pl-6"}`}>
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y bg-surface-warm">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-5 px-4 py-9 sm:px-6 sm:py-12 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">UCHINOCO PLUS</p>
              <h2 className="mt-2 font-serif text-2xl leading-snug">思い出を、もっと長く、家族と。</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">長期履歴やYear in Review、複数ペット、家族共有など、思い出を長く楽しむ機能。価格と申込条件は確認中です。</p>
            </div>
            <Link className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-primary px-5 font-semibold text-primary hover:bg-white" href="/pricing">プランを見る</Link>
          </div>
        </section>

        <section className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-10 sm:px-6 sm:py-14 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-serif text-2xl leading-snug">フォトブック機能は準備中です。</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Production Printの注文受付は現在行っていません。提供開始時にサービス内でお知らせします。</p>
          </div>
          <Link className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary-hover" href="/signup">無料ではじめる</Link>
        </section>
      </main>
    </PublicSiteFrame>
  );
}
