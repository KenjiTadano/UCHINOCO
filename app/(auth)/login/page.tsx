import Link from "next/link";
import { login } from "../actions";
import { PendingSubmitButton } from "../../_components/pending-submit-button";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error, message } = await searchParams;

  return (
    <main className="app-page-narrow max-w-sm justify-center">
      <header className="text-center">
        <p className="text-sm font-semibold tracking-[0.18em] text-primary">UCHINOCO</p>
        <h1 className="app-title">ログイン</h1>
      </header>

      {error ? (
        <p role="alert" className="app-error">
          {error}
        </p>
      ) : null}
      {message ? <p role="status" className="app-success">{message}</p> : null}

      <form action={login} className="flex flex-col gap-4">
        <label className="app-label">
          メールアドレス
          <input
            className="app-input"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </label>
        <label className="app-label">
          パスワード
          <input
            className="app-input"
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={8}
            required
          />
        </label>
        <PendingSubmitButton pendingText="ログイン中...">ログイン</PendingSubmitButton>
      </form>

      <Link className="app-back-link self-center" href="/forgot-password">
        パスワードを忘れた方
      </Link>

      <p className="text-center text-sm text-muted">
        アカウントをお持ちでない場合は、
        <Link className="font-semibold text-primary underline underline-offset-4" href="/signup">
          新規登録
        </Link>
        してください。
      </p>
    </main>
  );
}
