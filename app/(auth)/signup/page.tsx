import Link from "next/link";
import { signup } from "../actions";

type SignupPageProps = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const { error, message } = await searchParams;

  return (
    <main className="app-page-narrow max-w-sm justify-center">
      <header className="text-center">
        <p className="text-sm font-semibold tracking-[0.18em] text-primary">UCHINOCO</p>
        <h1 className="app-title">新規登録</h1>
      </header>

      {error ? (
        <p role="alert" className="app-error">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="app-success">
          {message}
        </p>
      ) : null}

      <form action={signup} className="flex flex-col gap-4">
        <label className="app-label">
          表示名
          <input
            className="app-input"
            name="display_name"
            type="text"
            autoComplete="name"
            maxLength={50}
            required
          />
        </label>
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
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <label className="app-label">
          パスワード確認
          <input
            className="app-input"
            name="password_confirmation"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <button className="app-button-primary w-full" type="submit">
          新規登録
        </button>
      </form>

      <p className="text-center text-sm text-muted">
        すでにアカウントをお持ちの場合は、
        <Link className="font-semibold text-primary underline underline-offset-4" href="/login">
          ログイン
        </Link>
        してください。
      </p>
    </main>
  );
}
