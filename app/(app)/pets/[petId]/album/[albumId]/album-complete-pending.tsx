import Link from "next/link";
/** Only used after active-draft and album/route access checks. */
export function AlbumCompletePending({ petName, backHref, editHref }: { petName: string; backHref: string; editHref: string }) {
  return <main className="ai-complete-page" data-load-stage="primary" data-fully-ready="false" aria-busy="true">
    <header className="ai-complete-header"><Link href={backHref}>戻る</Link><h1 className="ai-complete-header-title">AIが作ったアルバム</h1><Link href={editHref}>編集する</Link></header>
    <div className="ai-complete-body"><div className="ai-complete-hero"><h2 className="ai-complete-title">アルバムが<br />できました！</h2><p className="ai-complete-desc">{petName}との思い出を<br />1冊にまとめました。</p></div>
      <div className="ai-complete-book-wrap" aria-hidden="true"><div className="rounded-xl bg-surface-warm" style={{ width: 260, height: 360, maxWidth: "100%" }} /></div>
      <p role="status">表紙とアルバムの詳細を読み込んでいます…</p>
    </div>
  </main>;
}
