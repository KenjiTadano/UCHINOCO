import Link from "next/link";
import { signup } from "../actions";

type SignupPageProps = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const { error, message } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-6 py-12">
      <header>
        <p className="text-sm text-zinc-500">UCHINOCO</p>
        <h1 className="mt-1 text-2xl font-semibold">新規登録</h1>
      </header>

      {error ? (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          {message}
        </p>
      ) : null}

      <form action={signup} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          表示名
          <input
            className="rounded border border-zinc-300 px-3 py-2"
            name="display_name"
            type="text"
            autoComplete="name"
            maxLength={50}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          メールアドレス
          <input
            className="rounded border border-zinc-300 px-3 py-2"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          パスワード
          <input
            className="rounded border border-zinc-300 px-3 py-2"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          パスワード確認
          <input
            className="rounded border border-zinc-300 px-3 py-2"
            name="password_confirmation"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <button className="rounded bg-zinc-900 px-4 py-2 text-white" type="submit">
          新規登録
        </button>
      </form>

      <p className="text-sm text-zinc-600">
        すでにアカウントをお持ちの場合は、
        <Link className="underline" href="/login">
          ログイン
        </Link>
        してください。
      </p>
    </main>
  );
}
