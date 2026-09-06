import Link from "next/link";

export function LegalNavigation() {
  return (
    <nav
      aria-label="規約とプライバシー"
      className="mx-auto flex min-h-11 w-full max-w-xl items-center justify-center gap-5 px-4 py-3 text-xs text-muted"
    >
      <Link className="underline underline-offset-4 hover:text-primary" href="/terms">
        利用規約
      </Link>
      <Link className="underline underline-offset-4 hover:text-primary" href="/privacy">
        プライバシーポリシー
      </Link>
    </nav>
  );
}
