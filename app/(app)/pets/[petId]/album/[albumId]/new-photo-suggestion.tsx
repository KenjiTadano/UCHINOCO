import Link from "next/link";

export function NewPhotoSuggestionNotice({ href, count }: { href: string; count: number }) {
  return (
    <aside className="rounded-2xl border border-brand-pale bg-surface-warm px-4 py-3" aria-label="アルバムへの新しい写真の提案">
      <p className="text-sm font-semibold text-text">新しい写真が{count}枚あります</p>
      <p className="ds-caption mt-1">編集中の内容は変えずに、追加候補を確認できます。</p>
      <Link href={href} className="app-button-secondary mt-3 inline-flex min-h-11 items-center">確認する</Link>
    </aside>
  );
}
