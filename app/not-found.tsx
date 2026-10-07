import Link from "next/link";

export default function NotFound() {
  return (
    <main className="app-page items-center justify-center text-center">
      <p className="ds-editorial">404</p>
      <h1 className="ds-heading">ページが見つかりません</h1>
      <p className="ds-body text-muted">URLをご確認いただくか、ホームからもう一度お進みください。</p>
      <Link className="app-button-primary" href="/">UCHINOCOへ戻る</Link>
    </main>
  );
}
