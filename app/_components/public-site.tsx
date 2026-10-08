import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export async function PublicSiteFrame({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const signedIn = !error && Boolean(data?.claims);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link className="text-lg font-semibold text-foreground" href="/" aria-label="UCHINOCO ホーム">
            UCHINOCO
          </Link>
          <nav aria-label="メインナビゲーション" className="order-3 flex w-full flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted sm:order-0 sm:w-auto">
            <Link className="hover:text-primary" href="/#features">Features</Link>
            <Link className="hover:text-primary" href="/pricing">Pricing</Link>
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <Link className="text-muted hover:text-primary" href="/login">ログイン</Link>
            <Link
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary-hover"
              href={signedIn ? "/home" : "/signup"}
            >
              {signedIn ? "アプリを開く" : "無料ではじめる"}
            </Link>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col">{children}</div>

      <footer className="mt-16 border-t bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-8 sm:px-6">
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted">
            <Link className="hover:text-primary" href="/pricing">Pricing</Link>
            <Link className="hover:text-primary" href="/privacy">プライバシーポリシー</Link>
            <Link className="hover:text-primary" href="/terms">利用規約</Link>
            <Link className="hover:text-primary" href="/contact">お問い合わせ</Link>
            <Link className="hover:text-primary" href="/legal">事業者情報</Link>
            <Link className="hover:text-primary" href="/login">ログイン</Link>
          </div>
          <p className="text-xs text-muted">© UCHINOCO</p>
        </div>
      </footer>
    </div>
  );
}

export function PublicHeroImage() {
  return (
    <Image
      src="/album/hero_front_facing_blank_cover.jpg"
      alt="UCHINOCOのアルバム表紙サンプル"
      width={1024}
      height={424}
      priority
      className="h-full w-full object-cover"
    />
  );
}

export function AiAlbumIllustration() {
  return (
    <Image
      src="/album/ai_generating_illustration.png"
      alt="写真からAIアルバムを作るイメージ"
      width={320}
      height={320}
      className="h-auto w-full"
    />
  );
}